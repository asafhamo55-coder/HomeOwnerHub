import 'server-only'

import { todayIn } from '@/lib/association-time'
import { getCurrentOrg } from '@/lib/orgs'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { checkMeetingNotice, type NoticeCheck } from './notice-law'
import { buildMeetingNoticePrefill, type MeetingNoticePrefill } from './notice-prefill'
import { loadLatestMeetingNotice, type NoticeSent } from './notice-record'

/**
 * BL-118 server reads: the association's state, type (BL-155) and today, the meeting,
 * and the latest notice sent for it. Board client (RLS-bound): only the
 * board reads hoa_meeting_minutes. Logs carry codes only.
 */

export interface NoticeMeeting {
  id: string
  meetingDate: string
  meetingType: string | null
  status: string | null
}

async function associationStateAndToday(): Promise<{ state: string | null; type: string | null; today: string } | null> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return null
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.from('associations').select('state, type').eq('id', assoc.id).maybeSingle()
  if (error) {
    console.error('[meeting-notice] association state read failed', { code: error.code ?? null })
    return null
  }
  const row = data as { state: string | null; type: string | null } | null
  // BL-155: the type picks the Georgia Condominium Act (§ 44-3-102) for a GA condo.
  return { state: row?.state ?? null, type: row?.type ?? null, today: todayIn(assoc.timeZone) }
}

export interface MeetingNoticeStatus {
  check: NoticeCheck | null
  /** null = none sent; 'failed' = couldn't read. */
  latest: NoticeSent | null | 'failed'
  /** The meeting is still ahead and not yet held: offer "Send meeting notice". */
  canSend: boolean
}

/** For the meeting page's notice section. */
export async function loadMeetingNoticeStatus(meeting: NoticeMeeting): Promise<MeetingNoticeStatus> {
  const org = await getCurrentOrg()
  const supabase = await getSupabaseServerClient()
  const [ctx, latest] = await Promise.all([
    associationStateAndToday(),
    org ? loadLatestMeetingNotice(supabase, { orgId: org.id, meetingId: meeting.id }) : Promise.resolve('failed' as const),
  ])
  const check = ctx
    ? checkMeetingNotice({
        state: ctx.state,
        associationType: ctx.type,
        meetingType: meeting.meetingType,
        meetingDate: meeting.meetingDate,
        today: ctx.today,
      })
    : null
  const canSend = meeting.status !== 'approved' && (check ? check.level !== 'past' : true)
  return { check, latest, canSend }
}

export type MeetingNoticeContext =
  | { ok: true; prefill: MeetingNoticePrefill; check: NoticeCheck | null }
  | { ok: false; reason: 'not_found' | 'held' | 'failed' }

/** For the composer's `?meeting=<id>`: the prefill and the notice check. */
export async function loadMeetingNoticeContext(meetingId: string): Promise<MeetingNoticeContext> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, reason: 'not_found' }
  const supabase = await getSupabaseServerClient()
  const [{ data, error }, ctx] = await Promise.all([
    supabase
      .from('hoa_meeting_minutes')
      .select('id, meeting_date, meeting_type, status, ai_summary')
      .eq('id', meetingId)
      .eq('org_id', org.id)
      .is('deleted_at', null)
      .maybeSingle(),
    associationStateAndToday(),
  ])
  if (error) {
    console.error('[meeting-notice] meeting read failed', { code: error.code ?? null })
    return { ok: false, reason: 'failed' }
  }
  if (!data) return { ok: false, reason: 'not_found' }
  const row = data as { id: string; meeting_date: string; meeting_type: string | null; status: string | null; ai_summary: string | null }
  const upcoming = row.status !== 'approved' && (!ctx || row.meeting_date >= ctx.today)
  if (!upcoming) return { ok: false, reason: 'held' }
  const prefill = buildMeetingNoticePrefill({
    id: row.id,
    meetingDate: row.meeting_date,
    meetingType: row.meeting_type,
    // An upcoming draft's text is its agenda (lib/resident-meetings/select.ts).
    agenda: row.status === 'draft' ? row.ai_summary : null,
  })
  const check = ctx
    ? checkMeetingNotice({
        state: ctx.state,
        associationType: ctx.type,
        meetingType: row.meeting_type,
        meetingDate: row.meeting_date,
        today: ctx.today,
      })
    : null
  return { ok: true, prefill, check }
}
