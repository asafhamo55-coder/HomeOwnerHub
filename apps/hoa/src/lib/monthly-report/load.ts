/**
 * Loads the month-end board report (BL-073) — the board packet's own
 * loaders (lib/board-packet) plus the few month-activity reads the packet
 * doesn't make. Every loader THROWS on a query error; `loadPacketSections`
 * turns that into the section's "couldn't load", never a zero.
 *
 * `db` is either the signed-in board member's RLS client (the in-app
 * Preview) or a service-role client (the job, which has no request). With
 * the service-role client RLS is not there to scope anything, so EVERY read
 * here filters by the org or association id it is given.
 */

import { readAll } from '@/lib/supabase/read-all'
import { instantAtLocalTime } from '@/lib/association-time'
import type { AccountingDb } from '@/lib/accounting/queries'
import { loadBalanceSheet, loadBudgetsVsActual, loadIncomeStatement } from '@/lib/board-packet/financials'
import { loadDelinquency } from '@/lib/board-packet/queries'
import { packetPeriod, type PacketPeriod } from '@/lib/board-packet/period'
import { loadPacketSections } from '@/lib/board-packet/sections'
import { countPendingApprovals } from '@/lib/approvals-inbox/load'
import { loadReserveSnapshot } from '@/lib/accounting/reserves'
import { renderMonthlyReportEmail, type RenderedReport } from './render'
import {
  approvalsWaiting,
  cashPosition,
  delinquencyHeadline,
  incomeSummary,
  mapSection,
  reserveReport,
  summarizeArc,
  summarizeCollections,
  summarizeViolations,
  topVariances,
  type ArcActivityRow,
  type BilledRow,
  type MonthlyReportData,
  type PaymentRow,
  type UpcomingMeeting,
  type ViolationActivityRow,
} from './model'

type QueryError = { code?: string; message?: string }
type Page<T> = PromiseLike<{ data: T[] | null; error: QueryError | null }>

function failed(what: string, error: QueryError): Error {
  return new Error(`monthly report: ${what} failed (${error.code ?? 'no code'})`)
}

/** The month as instants in the association's zone: [start, close). */
function monthInstants(period: PacketPeriod, timeZone: string) {
  return {
    startIso: instantAtLocalTime(period.start, 0, timeZone).toISOString(),
    closeIso: instantAtLocalTime(period.after, 0, timeZone).toISOString(),
  }
}

// ─── collected vs billed ────────────────────────────────────────────

export async function loadCollections(db: AccountingDb, associationId: string, period: PacketPeriod, timeZone: string) {
  const { startIso, closeIso } = monthInstants(period, timeZone)
  const [charges, payments] = await Promise.all([
    readAll<BilledRow>(
      (from, to) =>
        db
          .from('assessments')
          .select('id, amount, due_date')
          .eq('association_id', associationId)
          .is('deleted_at', null)
          .not('status', 'in', '("waived","written_off")')
          .gte('due_date', period.start)
          .lte('due_date', period.end)
          .order('id', { ascending: true })
          .range(from, to) as unknown as Page<BilledRow>,
      (e) => failed('charges billed', e),
    ),
    readAll<PaymentRow>(
      (from, to) =>
        db
          .from('payments')
          .select('id, amount, paid_at, assessment:assessment_id!inner(association_id)')
          .eq('assessment.association_id', associationId)
          .gte('paid_at', startIso)
          .lt('paid_at', closeIso)
          .order('id', { ascending: true })
          .range(from, to) as unknown as Page<PaymentRow>,
      (e) => failed('payments received', e),
    ),
  ])
  return summarizeCollections(charges, payments, period, timeZone)
}

// ─── violations / ARC activity ──────────────────────────────────────

export async function loadViolationActivity(db: AccountingDb, orgId: string, period: PacketPeriod, timeZone: string) {
  const { closeIso } = monthInstants(period, timeZone)
  const rows = await readAll<ViolationActivityRow>(
    (from, to) =>
      db
        .from('hoa_violations')
        .select('id, status, created_at, resolved_at, notice_sent_at, cure_period_days')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .lt('created_at', closeIso)
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page<ViolationActivityRow>,
    (e) => failed('violations', e),
  )
  return summarizeViolations(rows, period, timeZone)
}

export async function loadArcActivity(db: AccountingDb, orgId: string, period: PacketPeriod, timeZone: string) {
  const { startIso, closeIso } = monthInstants(period, timeZone)
  const read = (column: 'submitted_at' | 'board_response_at') =>
    readAll<ArcActivityRow & { id: string }>(
      (from, to) =>
        db
          .from('arc_requests')
          .select('id, status, submitted_at, board_response_at')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .gte(column, startIso)
          .lt(column, closeIso)
          .order('id', { ascending: true })
          .range(from, to) as unknown as Page<ArcActivityRow & { id: string }>,
      (e) => failed('ARC applications', e),
    )
  const [submitted, decided] = await Promise.all([read('submitted_at'), read('board_response_at')])
  // A request submitted and decided in the same month is in both reads.
  const byId = new Map([...submitted, ...decided].map((r) => [r.id, r]))
  return summarizeArc([...byId.values()], period, timeZone)
}

// ─── next meeting / approvals ───────────────────────────────────────

export async function loadNextMeeting(db: AccountingDb, orgId: string, today: string): Promise<UpcomingMeeting | null> {
  const { data, error } = await db
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('meeting_date', today)
    .order('meeting_date', { ascending: true })
    .range(0, 0)
  if (error) throw failed('next meeting', error)
  return ((data ?? [])[0] ?? null) as UpcomingMeeting | null
}

// ─── the whole report ───────────────────────────────────────────────

export interface MonthlyReportContext {
  orgId: string
  associationId: string
  associationName: string
  timeZone: string
  period: PacketPeriod
  /** The association's today — "next meeting" is the first on or after it. */
  today: string
}

export async function loadMonthlyReportData(db: AccountingDb, ctx: MonthlyReportContext): Promise<MonthlyReportData> {
  const { orgId, associationId: assocId, period, timeZone } = ctx
  // Every money figure is as of the close of the month (BL-051), exactly as
  // the board packet for the following month's meeting shows it.
  const s = await loadPacketSections({
    income: () => loadIncomeStatement(assocId, period, db),
    balance: () => loadBalanceSheet(assocId, period, db),
    reserves: () => loadReserveSnapshot(db, assocId, period.end),
    budgets: () => loadBudgetsVsActual(assocId, period, db),
    delinquency: () => loadDelinquency(db, assocId, period.after, timeZone),
    collections: () => loadCollections(db, assocId, period, timeZone),
    violations: () => loadViolationActivity(db, orgId, period, timeZone),
    arc: () => loadArcActivity(db, orgId, period, timeZone),
    approvals: () => countPendingApprovals(db, orgId),
    meeting: () => loadNextMeeting(db, orgId, ctx.today),
  })
  const ok = <T>(r: { ok: true; data: T } | { ok: false }) => r as { ok: true; data: T } | { ok: false }
  return {
    associationName: ctx.associationName,
    period,
    cash: mapSection(ok(s.balance), cashPosition),
    reserves: mapSection(ok(s.reserves), reserveReport),
    income: mapSection(ok(s.income), incomeSummary),
    collections: mapSection(ok(s.collections), (c) => c),
    delinquency: mapSection(ok(s.delinquency), delinquencyHeadline),
    budget: mapSection(ok(s.budgets), (b) => topVariances(b)),
    violations: mapSection(ok(s.violations), (v) => v),
    arc: mapSection(ok(s.arc), (a) => a),
    approvals: s.approvals.ok ? approvalsWaiting(s.approvals.data) : { ok: false },
    meeting: mapSection(ok(s.meeting), (m) => m),
  }
}

/** The report month → the packet's period for it (the meeting-month 1st is `after`). */
export function periodForMonth(after: string): PacketPeriod {
  const period = packetPeriod(after)
  if (!period) throw new Error('monthly report: invalid month')
  return period
}

export async function buildMonthlyReport(
  db: AccountingDb,
  ctx: MonthlyReportContext,
  appUrl: (path: string) => string,
): Promise<RenderedReport> {
  return renderMonthlyReportEmail(await loadMonthlyReportData(db, ctx), { appUrl })
}
