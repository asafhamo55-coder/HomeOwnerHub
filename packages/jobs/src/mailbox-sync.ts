import { createAdminClient } from '@homeowner-portal/db'
import { GmailClient, MailboxAuthError, syncMailbox } from '@homeowner-portal/mailbox'
import { ingestMessages } from '../../../apps/hoa/src/lib/inbox/ingest'
import { applyMatch, applyVendorMatch, matchThread } from '../../../apps/hoa/src/lib/inbox/match'
import { logDbError } from './db-error'
import { inngest } from './client'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'

/**
 * Mailbox sync — every 2 minutes.
 *
 * This is a plain global lock (`limit: 1`, no key), not a per-account one.
 * The job is cron-triggered — Inngest's internal cron event carries no
 * `accountId` — so a key expression like `event.data.accountId` would
 * evaluate to the same empty value on every run and produce exactly the
 * same global lock as writing no key at all, just with a misleading
 * comment claiming per-account isolation. Being honest about that: this
 * prevents overlapping invocations of the whole job, nothing more. The
 * unique indexes on inbox_threads and inbox_messages are what actually
 * guard against duplicate writes at the row level. Genuine per-account
 * isolation (so one slow mailbox can't back up every other tenant's sync
 * window) would require fanning out one event per account instead of
 * looping over all of them in a single cron invocation — a deliberate
 * follow-up, not something a concurrency key alone can achieve.
 *
 * A per-account failure is caught and recorded rather than thrown,
 * because one HOA with revoked credentials must not stop every other
 * tenant's mail from syncing.
 */
export const mailboxSyncJob = inngest.createFunction(
  {
    id: 'mailbox-sync',
    name: 'Mailbox Sync',
    concurrency: [{ limit: 1 }],
  },
  { cron: '*/2 * * * *' },
  async ({ logger }) => {
    const db = createAdminClient()

    const { data: accounts, error: accountsError } = await db
      .from('mailbox_accounts')
      .select(
        'id, organization_id, email_address, scope_mode, scope_value, sync_cursor, backfill_status',
      )
      .is('disconnected_at', null)
      .neq('sync_status', 'auth_failed')

    if (accountsError) {
      // Do NOT fall into the "no connected mailboxes" branch below on a
      // failed query — that log line actively lies about why nothing
      // synced (query failed, not "there is nothing to sync"). Throw so
      // the run fails visibly instead.
      logDbError('mailboxSyncJob', 'mailbox_accounts', {}, accountsError)
      throw new Error(`mailboxSyncJob: failed to load mailbox accounts: ${accountsError.message}`)
    }

    if (!accounts || accounts.length === 0) {
      logger.info('[mailbox-sync] no connected mailboxes')
      return { accounts: 0 }
    }

    let synced = 0

    for (const account of accounts) {
      try {
        const accessToken = await getAccessTokenFor(db, account.id)
        const client = new GmailClient(accessToken)

        // Seven days back covers the history-expiry window exactly.
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const fallbackAfterDate = sevenDaysAgo.toISOString().slice(0, 10).replace(/-/g, '/')

        const result = await syncMailbox(
          client,
          {
            id: account.id,
            emailAddress: account.email_address,
            scopeMode: account.scope_mode as 'address' | 'label' | 'all',
            scopeValue: account.scope_value,
            syncCursor: account.sync_cursor,
          },
          { fallbackAfterDate },
        )

        if (result.usedFallback) {
          logger.warn(
            `[mailbox-sync] ${account.email_address}: historyId expired, used dated re-sync`,
          )
        }

        // Backfill is requested on ANY truncated run, not only a truncated
        // fallback run. A capped FALLBACK run always needs it (the cursor
        // had to advance past mail the cap dropped). A capped HISTORY run
        // additionally needs it in the case sync.ts documents: if a
        // mailbox's first `cap` history events are ALL out-of-scope, the
        // history walk holds the same cursor and re-walks the identical
        // window forever, never making progress on its own. Backfill
        // paginates properly with page tokens and is idempotent against
        // inbox_messages' unique index, so requesting it unconditionally on
        // any truncated run is what guarantees forward progress either way.
        //
        // BUT: not if a backfill for this account is already `'running'`.
        // That chain will reach the frontier on its own — re-requesting
        // would start a second concurrent chain that begins from
        // `pageToken: undefined`, wasting Gmail quota and, worse, resetting
        // `done` to 0 in `backfill_progress` so the setup UI's counter
        // visibly counts backward mid-import.
        if (result.truncated) {
          if (account.backfill_status === 'running') {
            logger.info(
              `[mailbox-sync] ${account.email_address}: truncated run — backfill ` +
                `already running, not re-requesting`,
            )
          } else {
            logger.warn(
              `[mailbox-sync] ${account.email_address}: truncated run` +
                `${result.usedFallback ? ' (fallback)' : ' (history)'} — requesting backfill`,
            )
            await inngest.send({
              name: 'mailbox/backfill.requested',
              data: { accountId: account.id },
            })
          }
        }

        if (result.fetchFailures > 0) {
          // Opaque Gmail message ids only — never an address, subject, or
          // body. See sync.ts, which already logs per-id at skip time; this
          // is the run-level rollup.
          logger.warn(
            `[mailbox-sync] ${account.email_address}: ${result.fetchFailures} ` +
              `message(s) could not be fetched or parsed and were skipped`,
          )
        }

        const ingested = await ingestMessages(
          db,
          account.organization_id,
          account.id,
          account.email_address,
          result.messages,
        )

        // Match only threads that actually received new messages.
        if (ingested.messagesInserted > 0) {
          const gmailThreadIds = [
            ...new Set(result.messages.map((m) => m.gmailThreadId)),
          ]
          const { data: threads, error: threadsError } = await db
            .from('inbox_threads')
            .select('id')
            .eq('mailbox_account_id', account.id)
            .in('gmail_thread_id', gmailThreadIds)

          if (threadsError) {
            logDbError(
              'mailboxSyncJob',
              'inbox_threads',
              { accountId: account.id },
              threadsError,
            )
            throw new Error(
              `mailboxSyncJob: failed to load threads for matching for account ${account.id}: ${threadsError.message}`,
            )
          }

          for (const thread of threads ?? []) {
            await applyMatch(
              db,
              account.organization_id,
              thread.id,
              await matchThread(db, account.organization_id, thread.id),
            )
            // Independent of the property outcome: a thread can auto-file
            // to a vendor while still sitting at 'needs_review' for a
            // property. Never throws.
            await applyVendorMatch(db, account.organization_id, thread.id)
          }
        }

        // A non-zero fetchFailures means specific messages are missing from
        // an otherwise-successful run. Surface that on the account record
        // rather than letting sync_status='ok' + sync_error=null claim a
        // clean run that wasn't quite complete.
        const syncError =
          result.fetchFailures > 0
            ? `${result.fetchFailures} message(s) could not be fetched or parsed on the last sync and were skipped.`
            : null

        const { error: statusError } = await db
          .from('mailbox_accounts')
          .update({
            sync_cursor: result.nextCursor,
            last_synced_at: new Date().toISOString(),
            sync_status: 'ok',
            sync_error: syncError,
          })
          .eq('id', account.id)

        if (statusError) {
          // A silently-failed status write is worse than no write: the
          // success log and synced++ below would fire while the database
          // record disagrees. Throw so this account falls into the catch
          // block below like any other failure — the cursor is not
          // advanced, `synced` is not incremented, and the next run
          // retries from the same (unadvanced) cursor. ingestMessages'
          // and syncMailbox's idempotency guarantees make that retry safe.
          logDbError('mailboxSyncJob', 'mailbox_accounts', { accountId: account.id }, statusError)
          throw new Error(
            `mailboxSyncJob: failed to persist sync status for ${account.email_address}: ${statusError.message}`,
          )
        }

        if (ingested.attachmentsQueued > 0) {
          await inngest.send({
            name: 'mailbox/attachments.queued',
            data: { accountId: account.id },
          })
        }

        synced++
        logger.info(
          `[mailbox-sync] ${account.email_address}: +${ingested.messagesInserted} msg, ` +
            `${ingested.messagesSkipped} dupes, ${ingested.threadsCreated} new threads`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        if (error instanceof MailboxAuthError) {
          await markAuthFailed(db, account.id, message)
          logger.error(`[mailbox-sync] ${account.email_address}: AUTH FAILED — ${message}`)
        } else {
          // `message` here may originate from ingestMessages' thrown
          // summary (thread/message/attachment failure counts, no PII) or
          // from a transient failure elsewhere (e.g. a network-level
          // fetch throw that the Gmail client does not retry on its own).
          // Either way it is logged and recorded rather than swallowed —
          // the next run's retry is the recovery path, not silence.
          const { error: recordError } = await db
            .from('mailbox_accounts')
            .update({ sync_error: message })
            .eq('id', account.id)

          // Judgement call: we are already inside the catch block for the
          // ORIGINAL failure. If this write also fails, throwing here
          // would propagate out of the per-account try/catch (there is no
          // outer catch around this loop) and abort every remaining
          // account's sync for a failure that is strictly less
          // informative than the one we already have in `message`. So
          // this logs loudly instead of throwing — the original error is
          // still logged below unconditionally, and the next run's retry
          // remains the recovery path either way.
          if (recordError) {
            logDbError(
              'mailboxSyncJob',
              'mailbox_accounts',
              { accountId: account.id },
              recordError,
            )
          }
          logger.error(`[mailbox-sync] ${account.email_address}: ${message}`)
        }
        // Continue to the next account — one bad mailbox must not stop
        // every other tenant's mail.
      }
    }

    return { accounts: accounts.length, synced }
  },
)

/**
 * Stall watchdog — every 15 minutes.
 *
 * The most dangerous failure in this feature is the silent one: the cron
 * stops, or every run throws, and nobody notices for a week while
 * residents go unanswered. A sync that has not completed in 30 minutes is
 * broken by definition — the cron runs every 2.
 *
 * A second, independent check below covers the historical backfill chain
 * (mailbox-backfill.ts). That chain's own try/catch records
 * `backfill_status: 'failed'` on any JS-level throw, but a step that dies
 * out-of-band — a platform timeout, an OOM, a process kill — never reaches
 * the catch and leaves the row at `backfill_status: 'running'` forever.
 * That gap got sharper once mailboxSyncJob started skipping its
 * re-trigger of `mailbox/backfill.requested` while `backfill_status` is
 * already `'running'` (see the comment on that check above): the
 * accidental recovery a blind re-trigger used to provide is gone, so
 * without this second check a killed backfill would leave the setup UI
 * showing "Importing history…" indefinitely, with no code path able to
 * correct it.
 *
 * Staleness is read from `backfill_updated_at` (0032_mailbox_backfill_watchdog.sql),
 * a column stamped by a DB trigger on `mailbox_accounts` whenever
 * `backfill_status` or `backfill_progress` changes — not by application
 * code, so mailbox-backfill.ts needed no changes to keep it current; its
 * existing per-page `.update()` already touches both columns.
 *
 * Threshold: 30 minutes, same as the sync check above, chosen with a wide
 * margin over any legitimate in-flight page. A page is expected to take
 * seconds; even the pathological case — every one of PAGE_SIZE (50)
 * message fetches hitting GmailClient's full retry ladder (3 retries,
 * ~500–2500ms backoff each, i.e. up to ~4s of backoff per message before
 * the jitter) — tops out around 3-4 minutes for a single page, roughly an
 * order of magnitude under 30. A chain making normal progress re-emits
 * (and the trigger re-stamps `backfill_updated_at`) every page, so 30
 * minutes of silence cannot be a healthy chain that just happens to be
 * mid-flight.
 *
 * On detection this marks `backfill_status: 'failed'` rather than
 * re-emitting `mailbox/backfill.requested` directly from here, for two
 * reasons. First, resuming correctly needs `pageToken` and `afterDate`,
 * which live only in the event payload threaded through the chain
 * (carried forward on each re-emit) — `backfill_progress` persists
 * `done`/`has_more`/`total_estimate` but not those two, so this watchdog
 * has no way to resume mid-chain and would have to restart from scratch
 * regardless of which path fires the event. Second, marking `'failed'`
 * is a single honest state change that both fixes the setup UI (no longer
 * lying "Importing history…") and releases mailboxSyncJob's own
 * re-trigger guard (`backfill_status === 'running'`) so the *next*
 * truncated sync run restarts the chain using logic that already exists
 * and is already tested there — rather than duplicating "start a fresh
 * backfill" event-emission logic in a second file, which would also risk
 * a duplicate concurrent chain if the "dead" process turns out to still
 * be alive and finishes after this watchdog already re-emitted.
 *
 * Note this is not a complete recovery guarantee: restart depends on a
 * future truncated sync run for this account. That is the same
 * dependency mailbox-sync.ts's re-trigger guard already accepted when it
 * stopped re-requesting a `'running'` backfill — this watchdog closes the
 * "permanently stuck" gap that change introduced, not a pre-existing gap
 * in how restarts are triggered.
 */
export const mailboxWatchdogJob = inngest.createFunction(
  { id: 'mailbox-watchdog', name: 'Mailbox Stall Watchdog' },
  { cron: '*/15 * * * *' },
  async ({ logger }) => {
    const db = createAdminClient()
    const threshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    // A never-synced account (last_synced_at IS NULL) is measured from
    // `connected_at`, NOT treated as instantly stale. The previous
    // condition — a bare `last_synced_at.is.null` — flagged every mailbox
    // the moment it was connected, so the next 15-minute tick told a board
    // that had just finished onboarding "Mail sync has stalled, resident
    // email may not be arriving" before the first sync had any chance to
    // run. Caught in live testing on a freshly connected mailbox.
    //
    // The grace period is the same 30 minutes used for a mailbox that HAS
    // synced before: a connection that has produced no successful sync in
    // half an hour is genuinely broken and should still be flagged.
    const { data: stalled, error: stalledError } = await db
      .from('mailbox_accounts')
      .select('id, email_address, last_synced_at')
      .is('disconnected_at', null)
      .eq('sync_status', 'ok')
      .or(
        `last_synced_at.lt.${threshold},and(last_synced_at.is.null,connected_at.lt.${threshold})`,
      )

    if (stalledError) {
      // The watchdog exists BECAUSE the most dangerous failure here is a
      // silent one. A watchdog whose own read fails soft — `stalled` ends
      // up null, the loop below never runs, and the function returns a
      // clean `{ stalled: 0 }` — would be the worst version of that bug:
      // Inngest's own failure tracking sees a successful run. Throw so
      // this is a visible, failing execution instead.
      logDbError('mailboxWatchdogJob', 'mailbox_accounts', {}, stalledError)
      throw new Error(`mailboxWatchdogJob: failed to load sync status: ${stalledError.message}`)
    }

    for (const account of stalled ?? []) {
      const { error: flagError } = await db
        .from('mailbox_accounts')
        .update({
          sync_status: 'stalled',
          sync_error: account.last_synced_at
            ? `No successful sync since ${account.last_synced_at}.`
            : 'No successful sync since this mailbox was connected.',
        })
        .eq('id', account.id)

      if (flagError) {
        // Unlike the sync job's per-account try/catch, there is no
        // enclosing handler here to demote this to a "record and
        // continue" — so this throws, same as the read above: a stall
        // that fails to get flagged must still fail the run visibly
        // rather than let the loop quietly move on to the next account.
        logDbError(
          'mailboxWatchdogJob',
          'mailbox_accounts',
          { accountId: account.id },
          flagError,
        )
        throw new Error(
          `mailboxWatchdogJob: failed to flag ${account.email_address} as stalled: ${flagError.message}`,
        )
      }

      logger.error(`[mailbox-watchdog] STALLED: ${account.email_address}`)
    }

    // Second, independent check: a backfill chain stuck at
    // `backfill_status: 'running'` with no forward progress in 30 minutes.
    // See the doc comment above for why `backfill_updated_at` is the right
    // signal and why 'failed' (not a direct re-emit) is the right action.
    const { data: stalledBackfills, error: stalledBackfillsError } = await db
      .from('mailbox_accounts')
      .select('id, email_address, backfill_updated_at')
      .is('disconnected_at', null)
      .eq('backfill_status', 'running')
      .or(`backfill_updated_at.is.null,backfill_updated_at.lt.${threshold}`)

    if (stalledBackfillsError) {
      // Same reasoning as the sync-status read above: a soft failure here
      // must not be allowed to look like "nothing stalled" — throw so the
      // run fails visibly instead.
      logDbError('mailboxWatchdogJob', 'mailbox_accounts', {}, stalledBackfillsError)
      throw new Error(
        `mailboxWatchdogJob: failed to load backfill status: ${stalledBackfillsError.message}`,
      )
    }

    for (const account of stalledBackfills ?? []) {
      const { error: flagError } = await db
        .from('mailbox_accounts')
        .update({
          backfill_status: 'failed',
          sync_error: `Backfill made no progress since ${account.backfill_updated_at ?? 'it started'}.`,
        })
        .eq('id', account.id)

      if (flagError) {
        // Same judgement as the sync-stall loop above: no enclosing
        // handler to demote this to "record and continue" — a backfill
        // stall that fails to get flagged must still fail the run visibly.
        logDbError(
          'mailboxWatchdogJob',
          'mailbox_accounts',
          { accountId: account.id },
          flagError,
        )
        throw new Error(
          `mailboxWatchdogJob: failed to flag ${account.email_address}'s backfill as failed: ${flagError.message}`,
        )
      }

      logger.error(`[mailbox-watchdog] BACKFILL STALLED: ${account.email_address}`)
    }

    // Third, independent check: an approved reply wedged in 'sending'.
    const stuckSends = await reconcileStuckSends(db, logger, threshold)

    return {
      stalled: stalled?.length ?? 0,
      backfillStalled: stalledBackfills?.length ?? 0,
      stuckSends,
    }
  },
)

/**
 * The reason text written onto a reply reconciled out of 'sending'.
 *
 * Every word here is load-bearing. A row reaches this state in two very
 * different ways and the watchdog CANNOT tell them apart:
 *
 *   1. The job died between the claim and `sendToGmail` — nothing was sent.
 *   2. `sendToGmail` succeeded and `recordSent`'s bookkeeping update failed
 *      or never ran — the resident HAS the email.
 *
 * Case 2 is exactly the state mailbox-send.ts's `recordSent` is careful to
 * log rather than route to `fail()`, for the same reason: a human who reads
 * "failed" resends, and the resident gets the reply twice. So this must not
 * say the send failed, and DraftPanel's failed state must not imply nothing
 * was sent (it no longer does — see the panel's status==='failed' branch).
 *
 * And nothing here auto-retries. An ambiguous send is a human's decision;
 * that is the whole reason `sendReply` has no retry.
 */
export const STUCK_SEND_REASON =
  'This reply was still marked as sending long after it should have finished, ' +
  'so it was closed out automatically. We cannot tell whether it was delivered ' +
  '— it may already have reached the resident. Check the thread or the ' +
  "mailbox's Sent folder before writing another reply. Nothing was resent."

/**
 * Mark replies wedged in `'sending'` as `'failed'`, with an honest reason.
 *
 * `mailbox-send.ts` claims a draft by flipping it 'queued' → 'sending', and
 * its top-of-function guard (`if (draft.status !== 'queued') return`) makes
 * every subsequent Inngest retry early-return. That is correct — it is what
 * guarantees a reply is sent at most once — but it means any uncaught throw
 * between the claim and `sendToGmail` (a network-level supabase-js rejection
 * on the thread, account or last-message reads, a platform timeout, an OOM)
 * strands the row at 'sending' permanently: never sent, never failed, never
 * retried. DraftPanel shows "Sending…" with Undo suppressed, forever, and no
 * other code path can correct it. This is that missing path.
 *
 * Threshold is the caller's — the same 30 minutes the sync and backfill
 * checks use, and enormously wide for this operation. Time in 'sending' is
 * measured from `send_after` (the moment the undo window elapsed and the
 * claim happened), and the work after the claim is three indexed reads plus
 * one Gmail send whose client retry ladder tops out in seconds. A row in
 * 'sending' for half an hour is not a slow send.
 *
 * Rows are filtered in memory rather than in the query: `status='sending'`
 * is a transient state that normally matches zero rows, and doing the
 * timestamp comparison here keeps the fallback chain (`send_after` →
 * `approved_at` → `created_at`) explicit instead of encoding it as nested
 * PostgREST `.or()` branches. A row with no usable timestamp at all is left
 * alone rather than guessed at.
 *
 * Exported for testing, and separately from the job body for the same reason
 * `runMailboxSend` is (see mailbox-send.ts).
 */
export async function reconcileStuckSends(
  db: ReturnType<typeof createAdminClient>,
  logger: { error(message: string): void },
  thresholdIso: string,
): Promise<number> {
  const { data: sending, error: sendingError } = await db
    .from('inbox_drafts')
    .select('id, send_after, approved_at, created_at')
    .eq('status', 'sending')

  if (sendingError) {
    // Same posture as the two checks above: a watchdog whose own read fails
    // soft reports a clean run while the thing it exists to catch goes
    // uncaught. Throw so the failure is visible in Inngest.
    logDbError('mailboxWatchdogJob', 'inbox_drafts', {}, sendingError)
    throw new Error(
      `mailboxWatchdogJob: failed to load sending drafts: ${sendingError.message}`,
    )
  }

  let reconciled = 0
  for (const draft of sending ?? []) {
    const since = draft.send_after ?? draft.approved_at ?? draft.created_at
    if (!since || since >= thresholdIso) continue

    // Conditional on `status='sending'`, never a bare update by id. If the
    // send job is in fact alive and `recordSent` lands between this read and
    // this write, it matches zero rows and a genuinely-sent reply is not
    // overwritten with a failure.
    const { data, error: flagError } = await db
      .from('inbox_drafts')
      .update({ status: 'failed', error: STUCK_SEND_REASON })
      .eq('id', draft.id)
      .eq('status', 'sending')
      .select('id')
      .maybeSingle()

    if (flagError) {
      logDbError('mailboxWatchdogJob', 'inbox_drafts', { draftId: draft.id }, flagError)
      throw new Error(
        `mailboxWatchdogJob: failed to reconcile stuck send ${draft.id}: ${flagError.message}`,
      )
    }
    if (!data) continue // the send job finished first — leave its result alone

    reconciled += 1
    // Never log a subject, body or address — only the opaque draft id, same
    // rule mailbox-send.ts follows.
    logger.error(`[mailbox-watchdog] STUCK SEND reconciled: draft ${draft.id}`)
  }

  return reconciled
}
