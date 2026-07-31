/**
 * Historical backfill, event-triggered at mailbox connect (and re-triggered
 * by mailbox-sync.ts on any truncated run — see the comment there).
 *
 * Separate from mailboxSyncJob because it is a fundamentally different
 * shape: thousands of messages instead of a handful, minutes instead of
 * seconds. Running it inside the 2-minute cron would starve every other
 * mailbox.
 *
 * Resumable by design. Each invocation drains up to PAGE_SIZE messages and
 * re-emits itself while work remains, so no single function invocation can
 * exceed the platform timeout, and a crash resumes from the last page token
 * instead of restarting twelve months of history. It may run concurrently
 * with an ordinary sync (or be re-requested by one while already running):
 * ingestMessages is idempotent by unique index, so re-processing a page is
 * a no-op, not a duplicate.
 *
 * Error handling follows the pattern established in
 * apps/hoa/src/lib/inbox/ingest.ts and packages/jobs/src/mailbox-sync.ts:
 * every Supabase read/write destructures `error` and either throws or is
 * otherwise explicitly handled — a soft PostgREST failure returns
 * `{ data: null, error }` rather than throwing, so an unchecked read would
 * silently look like "no rows" and, in the account-lookup below,
 * indistinguishable from "not found or disconnected".
 *
 * Never log an email address, subject, or body — resident PII. The mailbox
 * address itself (account.email_address) identifies the tenant, not a
 * resident, and is acceptable in logs, matching mailbox-sync.ts.
 */

import { createAdminClient } from '@homeowner-portal/db'
import {
  buildScopeQuery,
  GmailClient,
  isInScope,
  MailboxAuthError,
  parseGmailMessage,
} from '@homeowner-portal/mailbox'
import { ingestMessages } from '../../../apps/hoa/src/lib/inbox/ingest'
import { applyMatch, matchThread } from '../../../apps/hoa/src/lib/inbox/match'
import { logDbError } from './db-error'
import { inngest } from './client'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'

const BACKFILL_MONTHS = 12
const PAGE_SIZE = 50

export const mailboxBackfillJob = inngest.createFunction(
  {
    id: 'mailbox-backfill',
    name: 'Mailbox Historical Backfill',
    concurrency: [{ key: 'event.data.accountId', limit: 1 }],
  },
  { event: 'mailbox/backfill.requested' },
  async ({ event, logger, step }) => {
    const db = createAdminClient()
    const accountId = event.data.accountId as string
    const pageToken = (event.data.pageToken as string | undefined) ?? undefined
    const doneSoFar = (event.data.done as number | undefined) ?? 0

    const { data: account, error: accountError } = await db
      .from('mailbox_accounts')
      .select('id, organization_id, email_address, scope_mode, scope_value, backfill_progress')
      .eq('id', accountId)
      .is('disconnected_at', null)
      .maybeSingle()

    if (accountError) {
      // A soft read failure here is NOT evidence the account is gone — it
      // is indistinguishable from a genuine "not found or disconnected"
      // unless we check `error` first. Falling into the `!account` branch
      // below on a failed query would silently abandon a live backfill
      // rather than retry it. Throw so this run fails visibly.
      logDbError('mailboxBackfillJob', 'mailbox_accounts', { accountId }, accountError)
      throw new Error(
        `mailboxBackfillJob: failed to load mailbox account ${accountId}: ${accountError.message}`,
      )
    }

    if (!account) {
      logger.warn(`[mailbox-backfill] account ${accountId} not found or disconnected`)
      return { skipped: true }
    }

    const { error: runningError } = await db
      .from('mailbox_accounts')
      .update({ backfill_status: 'running' })
      .eq('id', accountId)

    if (runningError) {
      // Not fatal to the run itself — the account record just won't show
      // "running" in the setup UI for this invocation — but it must be
      // visible, not silently dropped.
      logDbError(
        'mailboxBackfillJob',
        'mailbox_accounts',
        { accountId },
        runningError,
      )
    }

    try {
      const accessToken = await getAccessTokenFor(db, accountId)
      const client = new GmailClient(accessToken)

      const since = new Date()
      since.setMonth(since.getMonth() - BACKFILL_MONTHS)
      const afterDate = since.toISOString().slice(0, 10).replace(/-/g, '/')

      // Throws on a malformed scope_value rather than degrading to an
      // unrestricted query — deliberately not caught here, so it surfaces
      // through the outer catch below as a visible backfill_status='failed'
      // instead of silently widening what a personal Gmail account exposes.
      const query = buildScopeQuery(
        account.scope_mode as 'address' | 'label' | 'all',
        account.scope_value,
        afterDate,
      )

      const page = await client.listMessages(query, pageToken)
      const ids = page.messageIds.slice(0, PAGE_SIZE)

      const messages = []
      let fetchFailures = 0
      for (const id of ids) {
        let parsed
        try {
          parsed = parseGmailMessage(await client.getMessage(id))
        } catch (error) {
          // An auth failure means every subsequent fetch will fail too —
          // let it propagate rather than burning through the rest of the
          // page. Anything else (most commonly a 404 — the message was
          // deleted between listing and fetching) is a per-message
          // problem, not a page-ending one: skip it and keep going, same
          // as syncMailbox's fetch loop. Log only the opaque Gmail message
          // id — never a subject, body, or address.
          if (error instanceof MailboxAuthError) throw error
          fetchFailures++
          console.error(
            `mailbox backfill: skipping unfetchable message ${id}`,
            error instanceof Error ? error.message : String(error),
          )
          continue
        }

        if (
          isInScope(
            parsed,
            account.scope_mode as 'address' | 'label' | 'all',
            account.scope_value,
          )
        ) {
          messages.push(parsed)
        }
      }

      if (fetchFailures > 0) {
        logger.warn(
          `[mailbox-backfill] ${account.email_address}: ${fetchFailures} ` +
            `message(s) could not be fetched or parsed and were skipped`,
        )
      }

      // ingestMessages persists everything it can and, if anything failed,
      // throws a summary (counts only, no PII) AFTER persisting — caught by
      // this function's outer catch below, which records backfill_status
      // and re-throws so Inngest's retry (and, ultimately, the next
      // triggered run) picks the rest back up.
      const ingested = await ingestMessages(db, account.organization_id, accountId, messages)

      if (messages.length > 0) {
        const gmailThreadIds = [...new Set(messages.map((m) => m.gmailThreadId))]
        const { data: threads, error: threadsError } = await db
          .from('inbox_threads')
          .select('id')
          .eq('mailbox_account_id', accountId)
          .in('gmail_thread_id', gmailThreadIds)

        if (threadsError) {
          logDbError(
            'mailboxBackfillJob',
            'inbox_threads',
            { accountId },
            threadsError,
          )
          throw new Error(
            `mailboxBackfillJob: failed to load threads for matching for account ${accountId}: ${threadsError.message}`,
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

      const done = doneSoFar + ids.length
      const hasMore = page.nextPageToken !== null

      const { error: progressError } = await db
        .from('mailbox_accounts')
        .update({
          backfill_status: hasMore ? 'running' : 'done',
          backfill_progress: { done, has_more: hasMore },
        })
        .eq('id', accountId)

      if (progressError) {
        // The setup UI's "Importing history… N of M" line depends on this
        // write. A failure here must not be swallowed — throw so it is
        // recorded as a failed run and retried, rather than leaving stale
        // progress with no indication anything went wrong.
        logDbError(
          'mailboxBackfillJob',
          'mailbox_accounts',
          { accountId },
          progressError,
        )
        throw new Error(
          `mailboxBackfillJob: failed to persist backfill progress for ${account.email_address}: ${progressError.message}`,
        )
      }

      logger.info(
        `[mailbox-backfill] ${account.email_address}: ${done} processed, ` +
          `+${ingested.messagesInserted} new`,
      )

      if (hasMore) {
        // Re-emit rather than loop. Each invocation stays well inside the
        // function timeout, and a crash resumes from the last page token
        // instead of restarting twelve months of history.
        await step.sendEvent('continue-backfill', {
          name: 'mailbox/backfill.requested',
          data: { accountId, pageToken: page.nextPageToken, done },
        })
      }

      return { done, hasMore }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // A database error must never become a MailboxAuthError — only a
      // genuine MailboxAuthError marks the account auth_failed, which
      // excludes it from every future sync/backfill run. A transient DB
      // blip surfaces as a generic Error and leaves sync/backfill status
      // retryable, matching the fix applied to getAccessTokenFor.
      if (error instanceof MailboxAuthError) {
        await markAuthFailed(db, accountId, message)
      }

      const { error: failError } = await db
        .from('mailbox_accounts')
        .update({ backfill_status: 'failed', sync_error: message })
        .eq('id', accountId)

      if (failError) {
        // Same judgement call as mailbox-tokens.ts's markAuthFailed: we are
        // already inside the catch block for the ORIGINAL failure. If this
        // write also fails too, log it loudly rather than let it mask the
        // original, more informative error being thrown below.
        logDbError(
          'mailboxBackfillJob',
          'mailbox_accounts',
          { accountId },
          failError,
        )
      }

      logger.error(`[mailbox-backfill] ${account.email_address}: ${message}`)
      throw error
    }
  },
)
