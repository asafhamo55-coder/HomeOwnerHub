import 'server-only'

import { dayOf } from '@/lib/association-time'
import { loadLatestMeetingNotice } from '@/lib/meetings/notice-record'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { buildAdoptionKit, inBudgetSeason, type AdoptionKit, type AdoptionMeeting, type AdoptionRecord } from './model'
import { readAdoption, type AdoptionReadResult } from './store'

/**
 * BL-138 server reads for the budget adoption kit: the association's state
 * and signed record, the linked meeting, and whether a notice went out for
 * it. The caller has already checked the board/admin role; the
 * cookie-bound client is used so RLS applies on top. Logs carry codes and
 * ids only.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = { from: (t: string) => any }

export interface AdoptionAssociation {
  id: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

export const stateOf = (a: Pick<AdoptionAssociation, 'state' | 'governing_law_state'> | null) =>
  (a?.governing_law_state ?? a?.state ?? '').trim().toUpperCase() || null

export async function readAdoptionAssociation(
  db: LooseDb,
  associationId: string,
): Promise<{ ok: true; row: AdoptionAssociation | null } | { ok: false }> {
  const { data, error } = await db
    .from('associations')
    .select('id, state, governing_law_state, compliance_settings')
    .eq('id', associationId)
    .maybeSingle()
  if (error) {
    console.error('[budget-adoption] association read failed', { code: error.code ?? 'unknown' })
    return { ok: false }
  }
  return { ok: true, row: (data as AdoptionAssociation | null) ?? null }
}

interface MeetingRow {
  id: string
  meeting_date: string
  meeting_type: string | null
  status: string | null
  ai_summary: string | null
}

function toMeeting(r: MeetingRow): AdoptionMeeting {
  // An upcoming draft's text is its agenda (lib/resident-meetings/select.ts).
  return { id: r.id, date: r.meeting_date, type: r.meeting_type, status: r.status, agenda: r.status === 'draft' ? r.ai_summary : null }
}

export async function readMeeting(db: LooseDb, orgId: string, meetingId: string): Promise<{ ok: true; meeting: AdoptionMeeting | null } | { ok: false }> {
  const { data, error } = await db
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, status, ai_summary')
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.error('[budget-adoption] meeting read failed', { code: error.code ?? 'unknown' })
    return { ok: false }
  }
  return { ok: true, meeting: data ? toMeeting(data as MeetingRow) : null }
}

/** Meetings the board can link: not yet held (draft), from today on, soonest first. */
export async function listUpcomingMeetings(db: LooseDb, orgId: string, today: string): Promise<AdoptionMeeting[] | null> {
  const { data, error } = await db
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, status, ai_summary')
    .eq('org_id', orgId)
    .eq('status', 'draft')
    .gte('meeting_date', today)
    .is('deleted_at', null)
    .order('meeting_date', { ascending: true })
    .limit(20)
  if (error) {
    console.error('[budget-adoption] meetings read failed', { code: error.code ?? 'unknown' })
    return null
  }
  return ((data ?? []) as MeetingRow[]).map(toMeeting)
}

export interface AdoptionBudget {
  id: string
  status: string
  periodStart: string | null
}

export interface LoadedKit {
  kit: AdoptionKit
  read: AdoptionReadResult
  record: AdoptionRecord
  meeting: AdoptionMeeting | null
}

export async function loadAdoptionKit(
  db: LooseDb,
  opts: { orgId: string; association: AdoptionAssociation; timeZone: string; today: string; budget: AdoptionBudget },
): Promise<LoadedKit | null> {
  const { orgId, association, timeZone, today, budget } = opts
  const read = readAdoption(association.id, budget.id, association.compliance_settings, paySettingsSecret())
  const record = read.record
  let meeting: AdoptionMeeting | null = null
  let noticeDay: string | null | 'failed' = null
  if (record.meetingId) {
    const m = await readMeeting(db, orgId, record.meetingId)
    if (!m.ok) return null
    meeting = m.meeting
    if (meeting) {
      const latest = await loadLatestMeetingNotice(db, { orgId, meetingId: meeting.id })
      noticeDay = latest === 'failed' ? 'failed' : latest ? dayOf(latest.at, timeZone) : null
    }
  }
  const kit = buildAdoptionKit({ state: stateOf(association), today, budget, meeting, noticeDay, record })
  return { kit, read, record, meeting }
}

export interface SeasonBudget extends AdoptionBudget {
  name: string
}

interface BudgetRow {
  id: string
  status: string
  fund: { name: string } | null
  fiscalPeriod: { start_date: string; end_date: string } | null
}

/** Draft and approved budgets in budget season (model.inBudgetSeason), soonest year first. */
export async function listSeasonBudgets(
  db: LooseDb,
  associationId: string,
  today: string,
  label: (p: { start_date: string; end_date: string }) => string,
): Promise<SeasonBudget[] | null> {
  const { data, error } = await db
    .from('budgets')
    .select('id, status, fund:fund_id(name), fiscalPeriod:fiscal_period_id(start_date, end_date)')
    .eq('association_id', associationId)
    .in('status', ['draft', 'approved'])
    .is('deleted_at', null)
    .limit(50)
  if (error) {
    console.error('[budget-adoption] budgets read failed', { code: error.code ?? 'unknown' })
    return null
  }
  return ((data ?? []) as BudgetRow[])
    .map((b) => ({
      id: b.id,
      status: b.status,
      periodStart: b.fiscalPeriod?.start_date ?? null,
      name: `${b.fund?.name ?? 'Budget'}${b.fiscalPeriod ? ` · ${label(b.fiscalPeriod)}` : ''}`,
    }))
    .filter((b) => inBudgetSeason(b, today))
    .sort((a, b) => (a.periodStart ?? '').localeCompare(b.periodStart ?? ''))
}
