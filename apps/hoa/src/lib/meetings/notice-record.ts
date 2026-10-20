/**
 * BL-118: the record that a meeting notice went out.
 *
 * Every notice sent from a meeting is an ordinary communications row with
 * related_resource = { type: 'meeting', id: <meeting id> }. That row is the
 * record: the meeting page reads "Notice sent on <date>" from it, on any
 * schema.
 *
 * hoa_meeting_minutes.notice_posted_at (BL-050, migration 0064) is written
 * ONLY when M1_APPLIED — the column is not in production before M1, and
 * naming it there fails the write. With the flag on, the first sent
 * notice fills an empty notice_posted_at; a date the board already entered
 * (or an earlier notice) is never overwritten.
 *
 * Clients are taken structurally so tests can pass a fake. Logs carry ids
 * and codes only.
 */

export const MEETING_RESOURCE_TYPE = 'meeting'

export interface NoticeSent {
  communicationId: string
  /** ISO timestamp the communication was sent (or scheduled for). */
  at: string
  status: 'sent' | 'scheduled'
}

interface QueryError {
  code?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = { from: (table: string) => any }
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The latest notice sent (or scheduled) for this meeting, from the
 * communications record. `null` when none; `'failed'` when the read failed
 * (the page says so instead of "not sent").
 */
export async function loadLatestMeetingNotice(
  client: AnyClient,
  opts: { orgId: string; meetingId: string },
): Promise<NoticeSent | null | 'failed'> {
  const { data, error } = (await client
    .from('communications')
    .select('id, status, sent_at, scheduled_for, created_at')
    .eq('organization_id', opts.orgId)
    .eq('related_resource->>type', MEETING_RESOURCE_TYPE)
    .eq('related_resource->>id', opts.meetingId)
    .in('status', ['sent', 'scheduled'])
    .order('created_at', { ascending: false })
    .limit(1)) as {
    data: Array<{ id: string; status: string; sent_at: string | null; scheduled_for: string | null; created_at: string }> | null
    error: QueryError | null
  }
  if (error) {
    console.error('[meeting-notice] latest notice read failed', { code: error.code ?? null })
    return 'failed'
  }
  const row = data?.[0]
  if (!row) return null
  const status = row.status === 'scheduled' ? 'scheduled' : 'sent'
  const at = (status === 'scheduled' ? row.scheduled_for : row.sent_at) ?? row.created_at
  return { communicationId: row.id, at, status }
}

export type StampOutcome = 'flag_off' | 'not_sent' | 'stamped' | 'already_set' | 'failed'

/**
 * After a notice is sent: fill notice_posted_at from the communication's
 * sent time — only when `m1` is true. With it false nothing is read or
 * written, so the app behaves exactly as before M1.
 */
export async function stampNoticePosted(
  client: AnyClient,
  opts: { m1: boolean; orgId: string; meetingId: string; communicationId: string },
): Promise<StampOutcome> {
  if (!opts.m1) return 'flag_off'

  // The communication must be this org's, for this meeting, and sent.
  const { data: comm, error: commErr } = (await client
    .from('communications')
    .select('id, status, sent_at, related_resource')
    .eq('id', opts.communicationId)
    .eq('organization_id', opts.orgId)
    .maybeSingle()) as {
    data: { id: string; status: string; sent_at: string | null; related_resource: unknown } | null
    error: QueryError | null
  }
  if (commErr) {
    console.error('[meeting-notice] communication read failed', { code: commErr.code ?? null })
    return 'failed'
  }
  const rr = (comm?.related_resource ?? null) as { type?: unknown; id?: unknown } | null
  if (!comm || comm.status !== 'sent' || !comm.sent_at || rr?.type !== MEETING_RESOURCE_TYPE || rr?.id !== opts.meetingId) {
    return 'not_sent'
  }

  const { data, error } = (await client
    .from('hoa_meeting_minutes')
    .update({ notice_posted_at: comm.sent_at })
    .eq('id', opts.meetingId)
    .eq('org_id', opts.orgId)
    .is('deleted_at', null)
    .is('notice_posted_at', null)
    .select('id')) as { data: Array<{ id: string }> | null; error: QueryError | null }
  if (error) {
    console.error('[meeting-notice] notice_posted_at write failed', { code: error.code ?? null })
    return 'failed'
  }
  return data && data.length > 0 ? 'stamped' : 'already_set'
}
