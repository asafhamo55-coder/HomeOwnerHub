import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'

/**
 * The Messages "Drafts" tab, phase 2 (BL-102 A11 step 4,
 * docs/research/2026-10-messages-area.md): besides broadcast drafts (A9,
 * `communications.status = 'draft'`), it lists inbox reply drafts that are
 * waiting for the board.
 *
 * "Waiting for the board" means, per conversation:
 *   - the NEWEST `inbox_drafts` row for the thread (the one the thread page
 *     shows, see `getLatestDraft`) is a `kind = 'reply'` row still in
 *     `status = 'draft'` — not queued, sent, cancelled or failed, and not
 *     superseded by a newer draft;
 *   - the thread is not closed and is still live in Gmail (not archived or
 *     trashed), the same visibility rule the inbox list applies.
 *
 * Nothing here shows more than the inbox list already shows the board: the
 * home's street address (from the thread's matched unit) or the thread
 * subject. No sender names, email addresses or draft bodies. Every read is
 * scoped by `organization_id`; the inbox tables' RLS is board/admin only
 * (auth_is_board_or_admin), and the page only calls this for roles that
 * pass `canSeeInboxTab`. Logs carry ids and error codes, never content.
 */

type Db = SupabaseClient<Database>

/** The label on a broadcast draft row, beside "Reply to …" on an inbox one. */
export const BROADCAST_DRAFT_LABEL = 'Message to many homes'

/** Upper bound on reply drafts read for the tab (and its badge). */
export const REPLY_DRAFTS_LIMIT = 100

/** Mirrors HIDDEN_GMAIL_THREAD_STATES (packages/mailbox) as a PostgREST tuple. */
const HIDDEN_GMAIL_STATES_SQL = '("archived","trashed")'

export interface ReplyDraftItem {
  draftId: string
  threadId: string
  /** "Reply to <home>" or "Reply to <subject>". */
  title: string
  /** The conversation's subject, shown under the title when the title is the home. */
  subject: string | null
  createdAt: string
  href: string
}

export interface DraftRowLite {
  id: string
  thread_id: string | null
  kind: string
  status: string
  created_at: string
}

export interface ThreadLite {
  id: string
  subject: string | null
  unit_id: string | null
}

/** Where an inbox reply draft opens: its conversation, where the draft panel lives. */
export function replyDraftHref(threadId: string): string {
  return `/inbox/${threadId}`
}

/** "Reply to 12 Elm St", else "Reply to <subject>", else "Reply to a resident". */
export function replyDraftTitle(input: { address: string | null; subject: string | null }): string {
  const address = input.address?.trim()
  if (address) return `Reply to ${address}`
  const subject = input.subject?.trim()
  if (subject) return `Reply to “${subject}”`
  return 'Reply to a resident'
}

/**
 * Pure: which threads have a reply draft waiting. `history` is every draft
 * row on the candidate threads (any status), so a stale `draft` row behind a
 * newer queued/sent/cancelled one is dropped, exactly as the thread page
 * would only ever show the newest. `threads` holds only open, visible
 * threads; a draft on any other thread is dropped. Newest first.
 */
export function pickWaitingReplyDrafts(
  history: DraftRowLite[],
  threads: Map<string, ThreadLite>,
  addressByUnit: Map<string, string>,
): ReplyDraftItem[] {
  const newest = new Map<string, DraftRowLite>()
  for (const d of history) {
    if (!d.thread_id) continue
    const cur = newest.get(d.thread_id)
    if (!cur || d.created_at > cur.created_at) newest.set(d.thread_id, d)
  }
  const items: ReplyDraftItem[] = []
  for (const [threadId, d] of newest) {
    if (d.kind !== 'reply' || d.status !== 'draft') continue
    const thread = threads.get(threadId)
    if (!thread) continue
    const address = thread.unit_id ? addressByUnit.get(thread.unit_id) ?? null : null
    items.push({
      draftId: d.id,
      threadId,
      title: replyDraftTitle({ address, subject: thread.subject }),
      subject: address ? thread.subject : null,
      createdAt: d.created_at,
      href: replyDraftHref(threadId),
    })
  }
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

/**
 * The Drafts badge: broadcast drafts plus reply drafts. A count that could
 * not be read adds nothing; when neither could be read the badge shows no
 * number (null) rather than a wrong one.
 */
export function combinedDraftCount(broadcast: number | null, replies: number | null): number | null {
  if (broadcast === null && replies === null) return null
  return (broadcast ?? 0) + (replies ?? 0)
}

function logFailure(table: string, orgId: string, error: { code?: string; message?: string }): void {
  console.error(`listWaitingReplyDrafts: query on "${table}" failed`, {
    orgId,
    code: error.code ?? null,
  })
}

export type ReplyDraftsResult = { ok: true; rows: ReplyDraftItem[] } | { ok: false }

/**
 * Inbox reply drafts waiting for the board, newest first, at most
 * REPLY_DRAFTS_LIMIT. A failed read returns `{ ok: false }` so the Drafts
 * tab can say so instead of claiming there are none; the address lookup is
 * enrichment only and degrades to the subject.
 */
export async function listWaitingReplyDrafts(db: Db, orgId: string): Promise<ReplyDraftsResult> {
  const candidates = await db
    .from('inbox_drafts')
    .select('thread_id')
    .eq('organization_id', orgId)
    .eq('status', 'draft')
    .eq('kind', 'reply')
    .not('thread_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(REPLY_DRAFTS_LIMIT * 2)
  if (candidates.error) {
    logFailure('inbox_drafts', orgId, candidates.error)
    return { ok: false }
  }
  const candidateIds = [
    ...new Set((candidates.data ?? []).map((r) => r.thread_id).filter((id): id is string => Boolean(id))),
  ]
  if (candidateIds.length === 0) return { ok: true, rows: [] }

  const [threadsRes, historyRes] = await Promise.all([
    db
      .from('inbox_threads')
      .select('id, subject, unit_id')
      .eq('organization_id', orgId)
      .in('id', candidateIds)
      .neq('status', 'closed')
      .not('gmail_state', 'in', HIDDEN_GMAIL_STATES_SQL),
    db
      .from('inbox_drafts')
      .select('id, thread_id, kind, status, created_at')
      .eq('organization_id', orgId)
      .in('thread_id', candidateIds),
  ])
  if (threadsRes.error) {
    logFailure('inbox_threads', orgId, threadsRes.error)
    return { ok: false }
  }
  if (historyRes.error) {
    logFailure('inbox_drafts', orgId, historyRes.error)
    return { ok: false }
  }
  const threads = new Map((threadsRes.data ?? []).map((t) => [t.id, t as ThreadLite]))
  if (threads.size === 0) return { ok: true, rows: [] }

  const unitIds = [
    ...new Set([...threads.values()].map((t) => t.unit_id).filter((id): id is string => Boolean(id))),
  ]
  const addressByUnit = new Map<string, string>()
  if (unitIds.length > 0) {
    const units = await db.from('units').select('id, address_line1').eq('organization_id', orgId).in('id', unitIds)
    if (units.error) logFailure('units', orgId, units.error)
    for (const u of units.data ?? []) if (u.address_line1) addressByUnit.set(u.id, u.address_line1)
  }

  const rows = pickWaitingReplyDrafts((historyRes.data ?? []) as DraftRowLite[], threads, addressByUnit)
  return { ok: true, rows: rows.slice(0, REPLY_DRAFTS_LIMIT) }
}
