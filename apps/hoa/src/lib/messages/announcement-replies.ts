import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { resolveForDisplay } from '@/lib/communications/display'

/**
 * "Replies to announcements" in the Messages Inbox tab (BL-102 A11, Phase A).
 *
 * Read-only. A resident's reply to a broadcast lands in
 * `communication_replies` (Resend inbound webhook), not in the Gmail inbox
 * threads. Storage stays separate; merging them is the BL-101 Phase B
 * decision (docs/research/2026-10-communications-plan.md §6). This module
 * only lists those rows, newest first, with the announcement they answer
 * and the home they came from.
 *
 * RLS: communication_replies is board-only (migration 0063), the same bar
 * as the inbox tables, and every read here is also org-scoped.
 */

type Db = SupabaseClient<Database>

export const ANNOUNCEMENT_REPLIES_PAGE_SIZE = 50

export interface AnnouncementReply {
  id: string
  channel: string
  /** The reply's own subject ("Re: …"), when the channel has one. */
  subject: string | null
  body: string
  aiSummary: string | null
  receivedAt: string
  unread: boolean
  communicationId: string
  /** What the resident was sent: their rendered subject, else the template resolved for display. */
  announcementSubject: string
  /** Who replied, as known at send time; falls back to the reply's sender address. */
  from: string
  /** The home the reply came from (communication_recipients.unit_id), when known. */
  unitId: string | null
}

/** Row shape of the select below (Supabase embeds are typed loosely; see toAnnouncementReply). */
export interface AnnouncementReplyRow {
  id: string
  channel: string
  subject: string | null
  body: string
  ai_summary: string | null
  received_at: string
  read_at: string | null
  communication_id: string
  from_email: string | null
  from_phone: string | null
  communication: { subject: string | null } | null
  recipient: { unit_id: string | null; recipient_name: string | null; rendered_subject: string | null } | null
}

const SELECT =
  'id, channel, subject, body, ai_summary, received_at, read_at, communication_id, from_email, from_phone, ' +
  'communication:communications(subject), ' +
  'recipient:communication_recipients(unit_id, recipient_name, rendered_subject)'

/** Pure mapping, exported for tests. */
export function toAnnouncementReply(row: AnnouncementReplyRow, associationName: string): AnnouncementReply {
  const template = row.communication?.subject ?? ''
  const announcementSubject =
    row.recipient?.rendered_subject ||
    (template ? resolveForDisplay(template, { associationName }).text : '') ||
    'Announcement'
  return {
    id: row.id,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    aiSummary: row.ai_summary,
    receivedAt: row.received_at,
    unread: row.read_at === null,
    communicationId: row.communication_id,
    announcementSubject,
    from: row.recipient?.recipient_name || row.from_email || row.from_phone || 'Unknown sender',
    unitId: row.recipient?.unit_id ?? null,
  }
}

/** Short one-line preview of a reply body for the list. */
export function replyPreview(reply: Pick<AnnouncementReply, 'aiSummary' | 'body'>, max = 140): string {
  const text = (reply.aiSummary || reply.body).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * One page of replies, newest first, plus the total. Throws on a failed
 * read so the page shows its error state, never a fake "no replies".
 */
export async function listAnnouncementReplies(
  db: Db,
  orgId: string,
  associationName: string,
  opts: { page: number; pageSize?: number },
): Promise<{ rows: AnnouncementReply[]; total: number }> {
  const pageSize = opts.pageSize ?? ANNOUNCEMENT_REPLIES_PAGE_SIZE
  const from = (Math.max(1, opts.page) - 1) * pageSize
  const { data, error, count } = await db
    .from('communication_replies')
    .select(SELECT, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('received_at', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw new Error(`listAnnouncementReplies: ${error.message}`)
  const rows = ((data ?? []) as unknown as AnnouncementReplyRow[]).map((r) => toAnnouncementReply(r, associationName))
  return { rows, total: count ?? rows.length }
}

/** One reply by id, org-scoped. Null when it does not exist (or is not this org's). */
export async function getAnnouncementReply(
  db: Db,
  orgId: string,
  associationName: string,
  replyId: string,
): Promise<AnnouncementReply | null> {
  const { data, error } = await db
    .from('communication_replies')
    .select(SELECT)
    .eq('organization_id', orgId)
    .eq('id', replyId)
    .maybeSingle()
  if (error) throw new Error(`getAnnouncementReply: ${error.message}`)
  return data ? toAnnouncementReply(data as unknown as AnnouncementReplyRow, associationName) : null
}
