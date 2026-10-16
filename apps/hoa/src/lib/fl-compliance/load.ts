/**
 * Reads for /legal/compliance (BL-015). Each function throws on a failed
 * read so the page's tryLoad shows "Couldn't load" rather than an empty —
 * and therefore falsely alarming — checklist. Logs nothing about rows.
 */
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { DEFAULT_MEETING_WINDOW, type ComplianceDoc, type ComplianceMeeting, type StoredStatute } from './evaluate'
import { FL_RECORDS_CODE_CITATION } from './rules'

/** Stored § 720.303 row (current, not superseded), or null. */
export interface StoredRecordsStatute extends StoredStatute {
  id: string
  source_url: string | null
  fetched_at: string | null
}

export async function loadFlRecordsStatute(): Promise<StoredRecordsStatute | null> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('state_statutes' as never)
    .select('id, body, source_name, source_url, fetched_at')
    .eq('state', 'FL')
    .eq('code_citation', FL_RECORDS_CODE_CITATION)
    .is('superseded_at', null)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle<StoredRecordsStatute>()
  if (error) throw new Error(`state_statutes 720.303: ${error.code ?? 'error'}`)
  return data ?? null
}

/** Every current document on file, from both document tables. */
export async function loadComplianceDocs(orgId: string): Promise<ComplianceDoc[]> {
  const supabase = await getSupabaseServerClient()
  const [hoa, gov] = await Promise.all([
    supabase.from('hoa_documents').select('id, name, type, created_at').eq('org_id', orgId),
    supabase
      .from('governing_documents')
      .select('id, title, type, effective_date, created_at')
      .eq('organization_id', orgId)
      .is('superseded_at', null),
  ])
  if (hoa.error) throw new Error(`hoa_documents: ${hoa.error.code ?? 'error'}`)
  if (gov.error) throw new Error(`governing_documents: ${gov.error.code ?? 'error'}`)
  return [
    ...(hoa.data ?? []).map(
      (d): ComplianceDoc => ({ source: 'hoa', id: d.id, title: d.name, type: d.type, date: d.created_at }),
    ),
    ...(gov.data ?? []).map(
      (d): ComplianceDoc => ({
        source: 'governing',
        id: d.id,
        title: d.title,
        type: d.type,
        date: d.effective_date ?? d.created_at,
      }),
    ),
  ]
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Meetings in the default window (the evaluator re-applies it). */
export async function loadComplianceMeetings(orgId: string, now: Date): Promise<ComplianceMeeting[]> {
  const supabase = await getSupabaseServerClient()
  const day = 24 * 60 * 60 * 1000
  const from = isoDay(new Date(now.getTime() - (DEFAULT_MEETING_WINDOW.pastDays + 1) * day))
  const to = isoDay(new Date(now.getTime() + (DEFAULT_MEETING_WINDOW.futureDays + 1) * day))
  const { data, error } = await supabase
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, created_at')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('meeting_date', from)
    .lte('meeting_date', to)
    .order('meeting_date', { ascending: true })
  if (error) throw new Error(`hoa_meeting_minutes: ${error.code ?? 'error'}`)
  return (data ?? []).map((m) => ({
    id: m.id,
    meetingDate: m.meeting_date,
    meetingType: m.meeting_type,
    addedAt: m.created_at,
  }))
}

/** Units on file — the closest thing to a parcel count we store. */
export async function countUnits(orgId: string): Promise<number> {
  const supabase = await getSupabaseServerClient()
  const { count, error } = await supabase
    .from('units')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  if (error) throw new Error(`units count: ${error.code ?? 'error'}`)
  return count ?? 0
}
