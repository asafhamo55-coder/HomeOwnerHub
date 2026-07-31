import { createAdminClient } from '@homeowner-portal/db'
import { GmailClient, MailboxAuthError, syncMailbox } from '@homeowner-portal/mailbox'
import { ingestMessages } from '../../../apps/hoa/src/lib/inbox/ingest'
import { applyMatch, matchThread } from '../../../apps/hoa/src/lib/inbox/match'
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
      .select('id, organization_id, email_address, scope_mode, scope_value, sync_cursor')
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
        if (result.truncated) {
          logger.warn(
            `[mailbox-sync] ${account.email_address}: truncated run` +
              `${result.usedFallback ? ' (fallback)' : ' (history)'} — requesting backfill`,
          )
          await inngest.send({
            name: 'mailbox/backfill.requested',
            data: { accountId: account.id },
          })
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
 */
export const mailboxWatchdogJob = inngest.createFunction(
  { id: 'mailbox-watchdog', name: 'Mailbox Stall Watchdog' },
  { cron: '*/15 * * * *' },
  async ({ logger }) => {
    const db = createAdminClient()
    const threshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data: stalled, error: stalledError } = await db
      .from('mailbox_accounts')
      .select('id, email_address, last_synced_at')
      .is('disconnected_at', null)
      .eq('sync_status', 'ok')
      .or(`last_synced_at.is.null,last_synced_at.lt.${threshold}`)

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
          sync_error: `No successful sync since ${account.last_synced_at ?? 'connection'}.`,
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

    return { stalled: stalled?.length ?? 0 }
  },
)
