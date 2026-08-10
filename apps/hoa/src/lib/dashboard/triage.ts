/**
 * The dashboard's mail-triage queue.
 *
 * Two-tier by design. The LOUD number is property-matched threads awaiting
 * a reply — the queue a board member can trust. The QUIET number is
 * unmatched threads, reported but not headlined: the unmatched set is
 * dominated by marketing mail, so headlining it trains the reader to
 * ignore the figure. It is still reported, because "unmatched" is not
 * "junk" — a resident who is not yet in the property roster lands there
 * too, and hiding them entirely would lose real mail.
 *
 * Never returns a fabricated zero. `countThreadsByStatus` in
 * lib/inbox/queries.ts throws for the same reason: a count that silently
 * falls back to 0 reads as "nothing to do" and the queue gets skipped.
 * This module cannot throw — it renders inside the dashboard, and a
 * mailbox outage must not take the whole page down — so it reports
 * `failed: true` and the card renders "couldn't load" instead of a number.
 *
 * Never logs a subject or an address; PostgrestError `.message`/`.code`
 * only, never `.details`.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { toTriageThreads, type ThreadRow, type TriageThread } from './triage-compute'

type Db = SupabaseClient<Database>

/**
 * 'waiting' means a human deliberately parked the thread; counting it as
 * needing attention today would defeat the act of parking it. 'closed' is
 * excluded for the obvious reason.
 */
export const ACTIVE_STATUSES = ['needs_review', 'open'] as const

/**
 * Thread states that have left the Gmail inbox, as a PostgREST `in` list.
 *
 * The dashboard triage card and the daily digest have to apply the same
 * Gmail-filing exclusion the inbox list does (see
 * apps/hoa/src/lib/inbox/queries.ts). Without it, mail the board filed away
 * in Gmail keeps driving "N threads need a reply" on the dashboard and
 * keeps arriving in the digest email — telling a board it has unanswered
 * mail that its own inbox no longer shows, which is worse than the
 * original divergence because it actively nags.
 *
 * `gmail_state` is NOT NULL defaulting to 'unknown' (migration 0043), so
 * this is a plain two-valued comparison and 'unknown' — never observed —
 * stays counted. Same fail-open choice as the inbox list.
 */
export const HIDDEN_GMAIL_STATES_SQL = '("archived","trashed")'

/** How many thread rows the card lists. */
const THREAD_LIMIT = 5

export interface TriageSnapshot {
  needsReply: { count: number; oldestWaitingDays: number | null }
  untriaged: { count: number }
  threads: TriageThread[]
  /** True when any query failed — counts are UNKNOWN, not zero. */
  failed: boolean
}

function logDbError(context: string, error: PostgrestError): void {
  console.error(`getTriageSnapshot: ${context} failed`, {
    code: error.code,
    message: error.message,
  })
}

export async function getTriageSnapshot(
  db: Db,
  orgId: string,
  now: Date = new Date(),
): Promise<TriageSnapshot> {
  const [needsReplyResult, untriagedResult, rowsResult] = await Promise.all([
    db
      .from('inbox_threads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .not('unit_id', 'is', null)
      .eq('last_direction', 'inbound')
      .in('status', ACTIVE_STATUSES)
      .not('gmail_state', 'in', HIDDEN_GMAIL_STATES_SQL),

    db
      .from('inbox_threads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('unit_id', null)
      .in('status', ACTIVE_STATUSES)
      .not('gmail_state', 'in', HIDDEN_GMAIL_STATES_SQL),

    db
      .from('inbox_threads')
      .select('id, subject, last_message_at')
      .eq('organization_id', orgId)
      .not('unit_id', 'is', null)
      .eq('last_direction', 'inbound')
      .in('status', ACTIVE_STATUSES)
      .not('gmail_state', 'in', HIDDEN_GMAIL_STATES_SQL)
      // Oldest first: a triage queue that buries the six-day-old thread
      // under this morning's arrivals defeats its own purpose.
      .order('last_message_at', { ascending: true })
      .limit(THREAD_LIMIT),
  ])

  let failed = false
  if (needsReplyResult.error) {
    logDbError('needs-reply count', needsReplyResult.error)
    failed = true
  }
  if (untriagedResult.error) {
    logDbError('untriaged count', untriagedResult.error)
    failed = true
  }
  if (rowsResult.error) {
    logDbError('thread rows', rowsResult.error)
    failed = true
  }

  const threads = toTriageThreads((rowsResult.data ?? []) as ThreadRow[], now)

  return {
    needsReply: {
      count: needsReplyResult.count ?? 0,
      oldestWaitingDays: threads.length > 0 ? threads[0].waitingDays : null,
    },
    untriaged: { count: untriagedResult.count ?? 0 },
    threads,
    failed,
  }
}
