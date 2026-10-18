/**
 * Reads for /legal/compliance (BL-015). Each function throws on a failed
 * read so the page's tryLoad shows "Couldn't load" rather than an empty —
 * and therefore falsely alarming — checklist. Logs nothing about rows.
 */
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { DEFAULT_MEETING_WINDOW, complianceMeetingColumns, type ComplianceDoc, type ComplianceMeeting, type StoredStatute } from './evaluate'
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

/**
 * Every current document on file, from both document tables — the BOARD's
 * view: nothing is filtered by resident visibility here. hasFile and
 * aiGenerated feed only the "posted for owners" line (BL-049).
 */
export async function loadComplianceDocs(orgId: string, m1: boolean = M1_APPLIED): Promise<ComplianceDoc[]> {
  const supabase = await getSupabaseServerClient()
  const flag = m1 ? ', visible_to_owners' : ''
  const [hoaRes, govRes] = await Promise.all([
    supabase.from('hoa_documents').select(`id, name, type, storage_path, created_at${flag}`).eq('org_id', orgId),
    supabase
      .from('governing_documents')
      .select(`id, title, type, effective_date, storage_path, ai_generated, created_at${flag}`)
      .eq('organization_id', orgId)
      .is('superseded_at', null),
  ])
  if (hoaRes.error) throw new Error(`hoa_documents: ${hoaRes.error.code ?? 'error'}`)
  if (govRes.error) throw new Error(`governing_documents: ${govRes.error.code ?? 'error'}`)
  type Hoa = { id: string; name: string; type: string; storage_path: string | null; created_at: string | null; visible_to_owners?: boolean }
  type Gov = {
    id: string
    title: string
    type: string
    effective_date: string | null
    storage_path: string | null
    ai_generated: boolean | null
    created_at: string | null
    visible_to_owners?: boolean
  }
  const hoa = { data: hoaRes.data as unknown as Hoa[] | null }
  const gov = { data: govRes.data as unknown as Gov[] | null }
  return [
    ...(hoa.data ?? []).map(
      (d): ComplianceDoc => ({
        source: 'hoa',
        id: d.id,
        title: d.name,
        type: d.type,
        date: d.created_at,
        hasFile: Boolean(d.storage_path?.trim()),
        ...(m1 ? { visibleToOwners: d.visible_to_owners === true } : {}),
      }),
    ),
    ...(gov.data ?? []).map(
      (d): ComplianceDoc => ({
        source: 'governing',
        id: d.id,
        title: d.title,
        type: d.type,
        date: d.effective_date ?? d.created_at,
        hasFile: Boolean(d.storage_path?.trim()),
        aiGenerated: d.ai_generated,
        ...(m1 ? { visibleToOwners: d.visible_to_owners === true } : {}),
      }),
    ),
  ]
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Meetings in the default window (the evaluator re-applies it). */
export async function loadComplianceMeetings(orgId: string, now: Date, m1: boolean = M1_APPLIED): Promise<ComplianceMeeting[]> {
  const supabase = await getSupabaseServerClient()
  const day = 24 * 60 * 60 * 1000
  const from = isoDay(new Date(now.getTime() - (DEFAULT_MEETING_WINDOW.pastDays + 1) * day))
  const to = isoDay(new Date(now.getTime() + (DEFAULT_MEETING_WINDOW.futureDays + 1) * day))
  const { data: rows, error } = await supabase
    .from('hoa_meeting_minutes')
    .select(complianceMeetingColumns(m1))
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('meeting_date', from)
    .lte('meeting_date', to)
    .order('meeting_date', { ascending: true })
  if (error) throw new Error(`hoa_meeting_minutes: ${error.code ?? 'error'}`)
  const data = rows as unknown as Array<{
    id: string
    meeting_date: string
    meeting_type: string | null
    created_at: string | null
    notice_posted_at?: string | null
  }> | null
  return (data ?? []).map((m) => ({
    id: m.id,
    meetingDate: m.meeting_date,
    meetingType: m.meeting_type,
    addedAt: m.created_at,
    ...(m1 ? { noticePostedAt: m.notice_posted_at ?? null } : {}),
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
