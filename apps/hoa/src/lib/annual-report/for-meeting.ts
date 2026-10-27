import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import { getAccountingContext, type AccountingContext } from '@/lib/accounting/queries'
import { packetMeetingQuery } from '@/lib/board-packet/queries'
import { readKitAssociations } from '@/lib/meeting-quorum/load'
import { todayIso } from '@/lib/money/format'
import { loadAnnualReport, type AnnualReportMeeting } from './load'
import type { AnnualReport } from './model'
import { readNarrative } from './narrative'

export type ReportForMeeting =
  | { ok: true; report: AnnualReport; narrative: string; annual: boolean }
  | { ok: false; reason: 'not_found' | 'failed' }

/**
 * The owner-safe report and the board's saved narrative for one meeting of
 * this org. For server actions (the caller has run the board gate).
 */
export async function loadReportForMeeting(supabase: SupabaseClient, orgId: string, meetingId: string): Promise<ReportForMeeting> {
  const res = await packetMeetingQuery(supabase, orgId, meetingId)
  if (res.error) return { ok: false, reason: 'failed' }
  if (!res.data) return { ok: false, reason: 'not_found' }
  const meeting = res.data as unknown as AnnualReportMeeting
  if (!/^\d{4}-\d{2}-\d{2}/.test(meeting.meeting_date ?? '')) return { ok: false, reason: 'failed' }

  let ctx: AccountingContext | null = null
  let ctxFailed = false
  try {
    ctx = await getAccountingContext()
  } catch {
    ctxFailed = true
  }
  const timeZone = ctx?.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE
  const loaded = await loadAnnualReport({ supabase, orgId, meeting, ctx, ctxFailed, today: todayIso(timeZone), timeZone })
  if (!loaded.ok) return { ok: false, reason: 'failed' }

  const assocs = await readKitAssociations(supabase, orgId)
  const narrative = assocs.ok && assocs.rows[0] ? readNarrative(assocs.rows[0].compliance_settings, meetingId) : ''
  return { ok: true, report: loaded.report, narrative, annual: meeting.meeting_type === 'annual' }
}
