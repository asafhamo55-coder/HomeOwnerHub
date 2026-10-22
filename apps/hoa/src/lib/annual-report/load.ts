import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@homeowner-portal/db'
import { M4_APPLIED } from '@homeowner-portal/db/m4'
import { addCalendarDays } from '@/lib/association-time'
import { getBudget, listBudgets, type AccountingContext, type AccountingDb } from '@/lib/accounting/queries'
import { loadReserveSnapshot } from '@/lib/accounting/reserves'
import { loadBalanceSheet, loadBudgetsVsActual, loadIncomeStatement } from '@/lib/board-packet/financials'
import type { PacketPeriod } from '@/lib/board-packet/period'
import { loadDelinquency } from '@/lib/board-packet/queries'
import { loadPacketSections, type SectionResult } from '@/lib/board-packet/sections'
import { caBudgetLoader } from '@/lib/compliance/ca-budget-load'
import type { LooseDb } from '@/lib/compliance/evidence'
import { loadComplianceOverview } from '@/lib/compliance/overview-load'
import { electionOf, readElection } from '@/lib/elections/store'
import { loadOwnerInsurancePolicies } from '@/lib/insurance/queries'
import { readKitAssociations, stateOfAssociation, type KitAssociation } from '@/lib/meeting-quorum/load'
import { MOTION_MINUTES_COLUMNS, type MinutesRow } from '@/lib/meeting-motions'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { readAll } from '@/lib/supabase/read-all'
import { annualReportJurisdiction } from './law'
import {
  meetingTypeLabel,
  ownerBalance,
  ownerBudgets,
  ownerCollections,
  ownerCompliance,
  ownerElections,
  ownerIncome,
  ownerInsurance,
  ownerMeetings,
  ownerProjection,
  ownerReserves,
  pickProjectionBudgets,
  reportWindow,
  sectionOf,
  type AnnualReport,
  type FiscalPeriodRow,
  type ProjectionInput,
  type Section,
} from './model'

/**
 * BL-153: server-side reads for the owner annual report. The page has
 * already run `requireBoardOrAdmin` and read the meeting by id AND org
 * (packetMeetingQuery, SEC3-L9), so `orgId` is the caller's own.
 *
 * Every section reuses an existing loader — the packet's financials and
 * delinquency (BL-016), the reserve snapshot (BL-120), the budgets (BL-138),
 * the owner insurance columns (BL-142), the compliance overview (BL-145),
 * the motions parser (BL-116) and the election planner's signed record
 * (BL-141) — and each loads on its own (loadPacketSections), so one failed
 * read is that section's "Couldn't load" and the rest still print.
 *
 * Per-home data never leaves this file: the delinquency summary is cut to
 * totals INSIDE its loader (ownerCollections), and every other section is
 * rebuilt field by field in ./model.ts before the page sees it.
 */

export interface AnnualReportMeeting {
  id: string
  meeting_date: string
  meeting_type: string | null
}

export type AnnualReportLoad = { ok: true; report: AnnualReport } | { ok: false; what: string }

const NO_ACCOUNTING = 'Accounting isn’t set up in HomeownerHub yet, so there are no figures for this section.'

function failed(what: string, error: { code?: string }): Error {
  return new Error(`annual report: ${what} failed (${error.code ?? 'no code'})`)
}

async function readFiscalPeriods(db: SupabaseClient, associationId: string): Promise<FiscalPeriodRow[]> {
  const { data, error } = await db.from('fiscal_periods').select('start_date, end_date').eq('association_id', associationId)
  if (error) throw failed('fiscal periods', error)
  return (data ?? []) as FiscalPeriodRow[]
}

function readMinutes(db: SupabaseClient, orgId: string, from: string, through: string): Promise<MinutesRow[]> {
  return readAll<MinutesRow>(
    (a, b) =>
      db
        .from('hoa_meeting_minutes')
        .select(MOTION_MINUTES_COLUMNS)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .gte('meeting_date', from)
        .lte('meeting_date', through)
        .order('meeting_date', { ascending: true })
        .order('id', { ascending: true })
        .range(a, b) as unknown as PromiseLike<{ data: MinutesRow[] | null; error: { code?: string } | null }>,
    (e) => failed('meetings', e),
    5_000,
  )
}

export async function loadAnnualReport(opts: {
  supabase: SupabaseClient
  orgId: string
  meeting: AnnualReportMeeting
  /** null with `ctxFailed` false: the org has no accounting set up. */
  ctx: AccountingContext | null
  ctxFailed: boolean
  today: string
  timeZone: string
}): Promise<AnnualReportLoad> {
  const { supabase, orgId, meeting, ctx, today, timeZone } = opts
  const meetingDay = meeting.meeting_date.slice(0, 10)
  const asOf = meetingDay < today ? meetingDay : today
  const assocId = ctx?.associationId ?? null

  let periods: FiscalPeriodRow[] = []
  if (assocId) {
    try {
      periods = await readFiscalPeriods(supabase, assocId)
    } catch (e) {
      console.error('[annual-report] fiscal periods read failed', { error: e instanceof Error ? e.message : 'unknown' })
      return { ok: false, what: 'the association’s fiscal years' }
    }
  }
  const window = reportWindow(periods, asOf)
  const period: PacketPeriod = {
    start: window.start,
    end: window.end,
    after: addCalendarDays(window.end, 1),
    label: window.label,
  }

  const assocs = await readKitAssociations(supabase, orgId)
  const assocRows: KitAssociation[] = assocs.ok ? assocs.rows : []
  const accounting = assocRows.find((a) => a.id === assocId) ?? null
  const electionAssoc = assocRows[0] ?? null // the planner's association (lib/elections/load.ts)
  const state = stateOfAssociation(accounting ?? electionAssoc)

  const minutes = readMinutes(supabase, orgId, window.start, asOf)
  // Swallow here; each section that awaits it reports its own failure.
  minutes.catch(() => undefined)

  const acct = <T>(load: (id: string) => Promise<T>) => (assocId ? () => load(assocId) : null)
  const db = supabase as unknown as AccountingDb

  const s = await loadPacketSections({
    income: acct((id) => loadIncomeStatement(id, period)),
    balance: acct((id) => loadBalanceSheet(id, period)),
    budgets: acct((id) => loadBudgetsVsActual(id, period)),
    reserves: acct(async (id) => (await loadReserveSnapshot(db, id, window.end)).result),
    projection: acct(async (id): Promise<ProjectionInput[]> => {
      const picked = pickProjectionBudgets(await listBudgets(id), window.fiscalYearEnd)
      const details = await Promise.all(picked.map((b) => getBudget(id, b.id)))
      return details.flatMap((budget) => (budget ? [{ budget }] : []))
    }),
    // Cut to totals here: the per-home rows never reach the page.
    collections: acct(async (id) => ownerCollections(await loadDelinquency(supabase, id, period.after, timeZone), window.end)),
    insurance: M4_APPLIED
      ? async () => {
          const rows = await loadOwnerInsurancePolicies(supabase as unknown as LooseDb, orgId)
          if (rows === null) throw new Error('annual report: insurance read failed')
          return ownerInsurance(rows, today)
        }
      : null,
    compliance: async () => {
      const loose = supabase as unknown as LooseDb
      const res = await loadComplianceOverview({
        db: loose,
        admin: createAdminClient() as unknown as LooseDb,
        orgId,
        today,
        caBudgets: caBudgetLoader(loose, orgId, today, timeZone),
      })
      if (!res.ok) throw new Error('annual report: compliance obligations failed')
      return ownerCompliance(res.overview, accounting?.id ?? null)
    },
    meetings: async () => ownerMeetings(await minutes, window, asOf),
    elections: async () => {
      if (!assocs.ok) throw new Error('annual report: associations read failed')
      if (!electionAssoc) return []
      const rows = await minutes
      const secret = paySettingsSecret()
      const candidates = rows.map((r) => ({ id: r.id, date: r.meeting_date.slice(0, 10), type: r.meeting_type }))
      if (!candidates.some((c) => c.id === meeting.id)) candidates.push({ id: meeting.id, date: meetingDay, type: meeting.meeting_type })
      return ownerElections(
        candidates
          .filter((c) => c.type === 'annual' || c.type === 'special')
          .flatMap((c) => {
            const read = readElection(electionAssoc.id, c.id, electionAssoc.compliance_settings, secret)
            return read.state === 'saved' ? [{ meetingDate: c.date, election: electionOf(read) }] : []
          }),
      )
    },
  })

  // A failed accounting context is "couldn't load", not "not set up".
  const money = <S, T>(res: SectionResult<S>, build: (s: S) => T): Section<T> =>
    opts.ctxFailed ? { state: 'failed' } : sectionOf(res, build, NO_ACCOUNTING)

  const report: AnnualReport = {
    associationName: ctx?.associationName ?? accounting?.name ?? electionAssoc?.name ?? 'The association',
    jurisdiction: annualReportJurisdiction(state),
    meeting: { date: meetingDay, type: meetingTypeLabel(meeting.meeting_type), annual: meeting.meeting_type === 'annual' },
    preparedOn: today,
    window,
    income: money(s.income, ownerIncome),
    budget: money(s.budgets, ownerBudgets),
    balance: money(s.balance, ownerBalance),
    reserves: money(s.reserves, ownerReserves),
    projection: money(s.projection, (next) => ownerProjection(next, s.budgets.ok ? s.budgets.data : [])),
    collections: money(s.collections, (c) => c),
    insurance: sectionOf(s.insurance, (p) => p, 'Insurance tracking isn’t turned on yet.'),
    compliance: sectionOf(s.compliance, (c) => c, ''),
    meetings: sectionOf(s.meetings, (m) => m, ''),
    elections: sectionOf(s.elections, (e) => e, ''),
  }
  return { ok: true, report }
}

