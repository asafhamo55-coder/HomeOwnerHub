import { createAdminClient } from '@homeowner-portal/db'
import {
  GmailClient,
  MailboxAuthError,
  fetchGmailStateSnapshot,
  resolveMessageState,
  threadStateFromMessages,
  type GmailStateSnapshot,
  type GmailThreadState,
  type ObservedGmailMessageState,
} from '@homeowner-portal/mailbox'
import { logDbError } from './db-error'
import { inngest } from './client'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'

/**
 * Gmail state reconciliation — every 15 minutes.
 *
 * The fix for the mailbox integration being append-only. Sync captured a
 * message once and nothing ever reconciled it, so a board that filed,
 * archived or trashed mail in Gmail kept seeing it in HomeownerHub
 * forever. This job re-reads what is actually in the mailbox now and
 * updates the stored state to match.
 *
 * WHY NOT THE 2-MINUTE SYNC JOB. Two reasons, both about cost. This walks
 * the whole in-scope inbox rather than a history delta, so it is the
 * expensive operation in this feature; running it 7.5× more often would
 * multiply Gmail quota for no benefit. And responsiveness is not the
 * constraint here — nobody files an email and then checks HomeownerHub
 * fifteen seconds later to confirm it left. New MAIL still appears within
 * two minutes; ingest stamps label state at capture time
 * (apps/hoa/src/lib/inbox/ingest.ts), and a resident replying to a filed
 * thread un-hides it on that same two-minute path via the fast path
 * there. Only the filing direction waits for this job.
 *
 * Per-account failures are caught and recorded rather than thrown, same
 * as mailboxSyncJob: one HOA's dead credentials must not stop every other
 * tenant's mail from reconciling.
 */

/** Rows updated per `.in()` call, to keep PostgREST URLs a sane length. */
const WRITE_CHUNK = 400

/** Rows read per page when walking an account's stored messages. */
const READ_PAGE = 1000

export interface ReconcileSummary {
  /**
   * False when nothing was written. The overwhelmingly important case is
   * an incomplete snapshot — see `skipReason`.
   */
  applied: boolean
  skipReason: string | null
  messagesScanned: number
  messagesChanged: number
  threadsChanged: number
  /** Thread states after the run, for a one-line operator summary. */
  threadStateCounts: Record<GmailThreadState, number>
  pagesFetched: number
}

function emptySummary(overrides: Partial<ReconcileSummary> = {}): ReconcileSummary {
  return {
    applied: false,
    skipReason: null,
    messagesScanned: 0,
    messagesChanged: 0,
    threadsChanged: 0,
    threadStateCounts: { unknown: 0, active: 0, archived: 0, trashed: 0 },
    pagesFetched: 0,
    ...overrides,
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

interface StoredMessage {
  id: string
  gmail_message_id: string
  gmail_state: string
  thread_id: string
}

/**
 * Reconcile one account's stored mail against a live Gmail snapshot.
 *
 * Exported and free of Inngest so `scripts/backfill-inbox-gmail-state.ts`
 * runs the IDENTICAL logic on demand rather than reimplementing it — the
 * script's whole purpose is to bring Madison Park's existing rows into
 * line immediately instead of waiting for the cron, and a second
 * implementation of the archive rule is exactly how the two would drift.
 *
 * `dryRun` computes everything and writes nothing, so the script can show
 * what it would change before it changes it.
 *
 * Reads only INBOUND messages. Outbound mail never carries INBOX and is
 * excluded from the thread rollup by `threadStateFromMessages` anyway;
 * fetching it would mean classifying every sent message as "archived",
 * which is noise at best and, if the rollup rule ever changed, a live
 * hazard. A thread with no inbound mail therefore never appears here and
 * keeps its default 'unknown' — correct, since the board never filed it.
 */
export async function reconcileAccountGmailState(
  db: ReturnType<typeof createAdminClient>,
  client: GmailClient,
  account: {
    id: string
    scopeMode: 'address' | 'label' | 'all'
    scopeValue: string | null
  },
  opts: { dryRun?: boolean; maxPages?: number } = {},
): Promise<ReconcileSummary> {
  const dryRun = opts.dryRun ?? false

  const snapshot = await fetchGmailStateSnapshot(
    client,
    { scopeMode: account.scopeMode, scopeValue: account.scopeValue },
    { maxPages: opts.maxPages },
  )

  // THE FAIL-SAFE. "Archived" is derived from absence, and absence only
  // means anything if the snapshot is whole. Applying a truncated one
  // would mark every message past the page cap as archived and hide the
  // board's entire live inbox in a single run. Refuse, loudly.
  if (!snapshot.complete) {
    return emptySummary({
      skipReason:
        `Gmail returned more mail than one reconciliation pass can read ` +
        `(${snapshot.pagesFetched} pages). Filing changes made in Gmail will not ` +
        `be reflected until the mailbox has fewer messages in its inbox.`,
      pagesFetched: snapshot.pagesFetched,
    })
  }

  // ── walk stored inbound messages, resolve each against the snapshot ──
  const desiredByState = new Map<ObservedGmailMessageState, string[]>()
  const inboundByThread = new Map<string, ObservedGmailMessageState[]>()
  let scanned = 0
  let changed = 0

  // Paged by ascending id rather than offset: under a live run a row's
  // gmail_state changes as we go, and a fixed offset over a set the writes
  // are mutating skips or repeats rows. An id cursor is immune to that.
  let afterId = '00000000-0000-0000-0000-000000000000'

  for (;;) {
    const { data, error } = await db
      .from('inbox_messages')
      .select('id, gmail_message_id, gmail_state, thread_id')
      .eq('mailbox_account_id', account.id)
      .eq('direction', 'inbound')
      .gt('id', afterId)
      .order('id', { ascending: true })
      .limit(READ_PAGE)

    if (error) {
      logDbError('reconcileAccountGmailState', 'inbox_messages', { accountId: account.id }, error)
      throw new Error(
        `reconcileAccountGmailState: failed to read messages for ${account.id}: ${error.message}`,
      )
    }

    const rows = (data ?? []) as StoredMessage[]
    if (rows.length === 0) break

    for (const row of rows) {
      scanned++
      afterId = row.id

      const desired = resolveMessageState(row.gmail_message_id, snapshot)

      const bucket = inboundByThread.get(row.thread_id)
      if (bucket) bucket.push(desired)
      else inboundByThread.set(row.thread_id, [desired])

      if (row.gmail_state === desired) continue
      changed++
      const ids = desiredByState.get(desired)
      if (ids) ids.push(row.id)
      else desiredByState.set(desired, [row.id])
    }
  }

  // ── roll each thread up from the states just resolved ────────────────
  // Computed from the FULL set of the thread's inbound messages gathered
  // above, not from the changed ones — `threadStateFromMessages` decides
  // "is any inbound message still in the inbox", which a partial view
  // cannot answer.
  const desiredThreadState = new Map<string, GmailThreadState>()
  const threadStateCounts: Record<GmailThreadState, number> = {
    unknown: 0,
    active: 0,
    archived: 0,
    trashed: 0,
  }
  for (const [threadId, states] of inboundByThread) {
    const state = threadStateFromMessages(
      states.map((gmailState) => ({ direction: 'inbound' as const, gmailState })),
    )
    desiredThreadState.set(threadId, state)
    threadStateCounts[state]++
  }

  const threadIdsToChange = await selectThreadsNeedingUpdate(db, account.id, desiredThreadState)

  if (dryRun) {
    return emptySummary({
      applied: false,
      skipReason: 'dry run',
      messagesScanned: scanned,
      messagesChanged: changed,
      threadsChanged: threadIdsToChange.length,
      threadStateCounts,
      pagesFetched: snapshot.pagesFetched,
    })
  }

  // ── write ────────────────────────────────────────────────────────────
  // Grouped by target state and chunked, so a mailbox of ten thousand
  // messages costs a handful of round trips rather than ten thousand.
  //
  // `gmail_labels` is deliberately NOT written here. A membership snapshot
  // knows which set a message is in, not its full label list; overwriting
  // the last real full-fetch observation with a guess would make the
  // column a liar. gmail_state is the authoritative current state,
  // gmail_labels is the last complete label set seen — they are allowed to
  // be of different vintages.
  const observedAt = new Date().toISOString()

  for (const [state, ids] of desiredByState) {
    for (const batch of chunk(ids, WRITE_CHUNK)) {
      const { error } = await db
        .from('inbox_messages')
        .update({ gmail_state: state, gmail_state_at: observedAt })
        .in('id', batch)

      if (error) {
        logDbError('reconcileAccountGmailState', 'inbox_messages', { accountId: account.id }, error)
        throw new Error(
          `reconcileAccountGmailState: failed to write message state for ${account.id}: ${error.message}`,
        )
      }
    }
  }

  const byThreadState = new Map<GmailThreadState, string[]>()
  for (const threadId of threadIdsToChange) {
    const state = desiredThreadState.get(threadId)
    if (!state) continue
    const ids = byThreadState.get(state)
    if (ids) ids.push(threadId)
    else byThreadState.set(state, [threadId])
  }

  for (const [state, ids] of byThreadState) {
    for (const batch of chunk(ids, WRITE_CHUNK)) {
      const { error } = await db
        .from('inbox_threads')
        .update({ gmail_state: state })
        .in('id', batch)

      if (error) {
        logDbError('reconcileAccountGmailState', 'inbox_threads', { accountId: account.id }, error)
        throw new Error(
          `reconcileAccountGmailState: failed to write thread state for ${account.id}: ${error.message}`,
        )
      }
    }
  }

  return {
    applied: true,
    skipReason: null,
    messagesScanned: scanned,
    messagesChanged: changed,
    threadsChanged: threadIdsToChange.length,
    threadStateCounts,
    pagesFetched: snapshot.pagesFetched,
  }
}

/**
 * Which of the computed thread states actually differ from what is stored.
 *
 * Compared rather than written blindly so a steady-state run — the normal
 * case, once a mailbox has been reconciled once — writes nothing at all
 * and `threadsChanged` reports an honest zero instead of "every thread,
 * every time".
 */
async function selectThreadsNeedingUpdate(
  db: ReturnType<typeof createAdminClient>,
  accountId: string,
  desired: Map<string, GmailThreadState>,
): Promise<string[]> {
  if (desired.size === 0) return []

  const needsUpdate: string[] = []

  for (const batch of chunk([...desired.keys()], WRITE_CHUNK)) {
    const { data, error } = await db
      .from('inbox_threads')
      .select('id, gmail_state')
      .eq('mailbox_account_id', accountId)
      .in('id', batch)

    if (error) {
      logDbError('reconcileAccountGmailState', 'inbox_threads', { accountId }, error)
      throw new Error(
        `reconcileAccountGmailState: failed to read thread state for ${accountId}: ${error.message}`,
      )
    }

    for (const row of data ?? []) {
      if (row.gmail_state !== desired.get(row.id)) needsUpdate.push(row.id)
    }
  }

  return needsUpdate
}

export const mailboxReconcileJob = inngest.createFunction(
  {
    id: 'mailbox-reconcile',
    name: 'Mailbox Gmail State Reconcile',
    // Global, like mailboxSyncJob's — the cron event carries no accountId,
    // so a concurrency key would evaluate to the same empty value every
    // run and buy nothing but a misleading comment. See that job for the
    // full reasoning.
    concurrency: [{ limit: 1 }],
  },
  { cron: '*/15 * * * *' },
  async ({ logger }) => {
    const db = createAdminClient()

    const { data: accounts, error: accountsError } = await db
      .from('mailbox_accounts')
      .select('id, organization_id, email_address, scope_mode, scope_value')
      .is('disconnected_at', null)
      .neq('sync_status', 'auth_failed')

    if (accountsError) {
      // Never fall through to a "nothing to reconcile" success on a failed
      // read — that log line would lie about why nothing changed. Same
      // posture as mailboxSyncJob.
      logDbError('mailboxReconcileJob', 'mailbox_accounts', {}, accountsError)
      throw new Error(
        `mailboxReconcileJob: failed to load mailbox accounts: ${accountsError.message}`,
      )
    }

    if (!accounts || accounts.length === 0) {
      logger.info('[mailbox-reconcile] no connected mailboxes')
      return { accounts: 0, reconciled: 0 }
    }

    let reconciled = 0

    for (const account of accounts) {
      try {
        const client = new GmailClient(await getAccessTokenFor(db, account.id))

        const summary = await reconcileAccountGmailState(db, client, {
          id: account.id,
          scopeMode: account.scope_mode as 'address' | 'label' | 'all',
          scopeValue: account.scope_value,
        })

        if (!summary.applied) {
          // A mailbox too large to snapshot is a real, persistent
          // limitation the board should see rather than a silent no-op —
          // otherwise "my Gmail cleanup isn't showing up" has no visible
          // cause anywhere in the product. Surfaced the same way a
          // partially-skipped sync is (mailbox-sync.ts), on sync_error.
          logger.warn(`[mailbox-reconcile] ${account.email_address}: ${summary.skipReason}`)

          const { error: noteError } = await db
            .from('mailbox_accounts')
            .update({ sync_error: summary.skipReason })
            .eq('id', account.id)

          if (noteError) {
            logDbError(
              'mailboxReconcileJob',
              'mailbox_accounts',
              { accountId: account.id },
              noteError,
            )
          }
          continue
        }

        reconciled++
        // Counts only — never a subject, address, or body. Same rule the
        // rest of the mailbox jobs follow.
        logger.info(
          `[mailbox-reconcile] ${account.email_address}: scanned ${summary.messagesScanned} msg, ` +
            `${summary.messagesChanged} restated, ${summary.threadsChanged} thread(s) changed ` +
            `(active ${summary.threadStateCounts.active}, archived ${summary.threadStateCounts.archived}, ` +
            `trashed ${summary.threadStateCounts.trashed}) · ${summary.pagesFetched} Gmail page(s)`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        if (error instanceof MailboxAuthError) {
          await markAuthFailed(db, account.id, message)
          logger.error(`[mailbox-reconcile] ${account.email_address}: AUTH FAILED — ${message}`)
        } else {
          logger.error(`[mailbox-reconcile] ${account.email_address}: ${message}`)
        }
        // One bad mailbox must not stop every other tenant's reconcile.
      }
    }

    return { accounts: accounts.length, reconciled }
  },
)

export type { GmailStateSnapshot }
