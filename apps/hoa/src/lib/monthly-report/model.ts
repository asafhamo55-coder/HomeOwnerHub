/**
 * The month-end board report's numbers (BL-073). Pure.
 *
 * Everything money-shaped is taken from the board packet's own reports
 * (lib/board-packet): the income statement and balance sheet for the
 * month, budget vs actual through its last day, delinquency at its close.
 * What the packet doesn't already compute — collected vs billed, and the
 * month's violation / ARC activity — is summarised here from full reads
 * (load.ts), on the association's calendar days (BL-043).
 *
 * A section that failed to load stays `{ ok: false }` all the way to the
 * email, which says "couldn't load" — never a zero.
 */

import { dayOf, instantAtLocalTime } from '@/lib/association-time'
import type { BalanceSheet, IncomeStatement } from '@/lib/accounting/queries'
import type { PacketBudget } from '@/lib/board-packet/financials'
import type { PacketPeriod } from '@/lib/board-packet/period'
import type { DelinquencySummary } from '@/lib/board-packet/delinquency'
import { cureBy, isClosedViolation } from '@/lib/violation-cure'

export type Section<T> = { ok: true; data: T } | { ok: false }

const inMonth = (day: string | null, period: PacketPeriod) => day !== null && day >= period.start && day <= period.end

// ─── cash ───────────────────────────────────────────────────────────

/** The two cash accounts the books seed (accounting/queries.ts uses the same numbers). */
export const OPERATING_CASH_ACCOUNT = '1010'
export const RESERVE_CASH_ACCOUNT = '1020'

export interface CashPosition {
  /** null when the chart of accounts has no such account. */
  operating: number | null
  reserve: number | null
}

export function cashPosition(sheet: BalanceSheet): CashPosition {
  const find = (n: string) => sheet.assets.find((a) => a.accountNumber === n)?.balance ?? null
  return { operating: find(OPERATING_CASH_ACCOUNT), reserve: find(RESERVE_CASH_ACCOUNT) }
}

export interface IncomeSummary {
  totalIncome: number
  totalExpenses: number
  netIncome: number
}

export function incomeSummary(s: IncomeStatement): IncomeSummary {
  return { totalIncome: s.totalIncome, totalExpenses: s.totalExpenses, netIncome: s.netIncome }
}

// ─── collected vs billed ────────────────────────────────────────────

export interface BilledRow {
  amount: number | string
  due_date: string
}

export interface PaymentRow {
  amount: number | string
  paid_at: string | null
}

export interface Collections {
  /** Charges due during the month. */
  billed: number
  /** Payments received during the month (the association's calendar day), against any charge. */
  collected: number
}

export function summarizeCollections(
  charges: BilledRow[],
  payments: PaymentRow[],
  period: PacketPeriod,
  timeZone: string,
): Collections {
  let billed = 0
  for (const c of charges) if (inMonth(c.due_date.slice(0, 10), period)) billed += Number(c.amount)
  let collected = 0
  for (const p of payments) if (inMonth(dayOf(p.paid_at, timeZone), period)) collected += Number(p.amount)
  return { billed, collected }
}

// ─── delinquency ────────────────────────────────────────────────────

export interface DelinquencyHeadline {
  total: number
  units: number
  over90: number
}

export function delinquencyHeadline(d: DelinquencySummary): DelinquencyHeadline {
  return { total: d.totalOverdue, units: d.unitCount, over90: d.aging.d90_plus }
}

// ─── budget ─────────────────────────────────────────────────────────

export interface Variance {
  accountName: string
  accountType: 'income' | 'expense'
  budgeted: number
  actual: number
  /** Positive = favorable (income over, expense under). */
  variance: number
}

export interface BudgetHeadline {
  /** False when no budget covers the month (said in words, not a failure). */
  hasBudget: boolean
  top: Variance[]
}

/** The `n` lines furthest from budget, largest first. Lines exactly on budget are left out. */
export function topVariances(budgets: PacketBudget[], n = 3): BudgetHeadline {
  const rows = budgets.flatMap((b) => b.report.rows)
  const top = rows
    .filter((r) => Math.abs(r.variance) >= 0.005)
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance) || a.accountName.localeCompare(b.accountName))
    .slice(0, n)
    .map((r) => ({ accountName: r.accountName, accountType: r.accountType, budgeted: r.budgeted, actual: r.actual, variance: r.variance }))
  return { hasBudget: budgets.length > 0, top }
}

// ─── violations ─────────────────────────────────────────────────────

export interface ViolationActivityRow {
  status: string
  created_at: string | null
  resolved_at: string | null
  notice_sent_at: string | null
  cure_period_days: number | null
}

export interface ViolationActivity {
  opened: number
  closed: number
  /** Open at the close of the month with the cure period already over. */
  pastCure: number
}

export function summarizeViolations(rows: ViolationActivityRow[], period: PacketPeriod, timeZone: string): ViolationActivity {
  const close = instantAtLocalTime(period.after, 0, timeZone).getTime()
  let opened = 0
  let closed = 0
  let pastCure = 0
  for (const v of rows) {
    if (inMonth(dayOf(v.created_at, timeZone), period)) opened += 1
    if (inMonth(dayOf(v.resolved_at, timeZone), period)) closed += 1

    const createdBefore = v.created_at ? new Date(v.created_at).getTime() < close : false
    // Open at the close of the month: not closed now, or closed only after it.
    // A closed violation with no resolved_at has no date to place it, so it
    // isn't counted as open then.
    const resolvedAt = v.resolved_at ? new Date(v.resolved_at).getTime() : null
    const openThen = !isClosedViolation(v.status) || (resolvedAt !== null && resolvedAt >= close)
    const due = cureBy(v)
    if (createdBefore && openThen && due && due.getTime() < close) pastCure += 1
  }
  return { opened, closed, pastCure }
}

// ─── ARC ────────────────────────────────────────────────────────────

export interface ArcActivityRow {
  status: string
  submitted_at: string | null
  board_response_at: string | null
}

export interface ArcActivity {
  submitted: number
  approved: number
  denied: number
}

export function summarizeArc(rows: ArcActivityRow[], period: PacketPeriod, timeZone: string): ArcActivity {
  let submitted = 0
  let approved = 0
  let denied = 0
  for (const r of rows) {
    if (inMonth(dayOf(r.submitted_at, timeZone), period)) submitted += 1
    if (!inMonth(dayOf(r.board_response_at, timeZone), period)) continue
    if (r.status === 'approved') approved += 1
    else if (r.status === 'denied') denied += 1
  }
  return { submitted, approved, denied }
}

// ─── approvals ──────────────────────────────────────────────────────

/** null for any source means that source failed: the total is unknown, not lower. */
export function approvalsWaiting(counts: Record<string, number | null>): Section<number> {
  const values = Object.values(counts)
  if (values.some((v) => v === null)) return { ok: false }
  return { ok: true, data: values.reduce<number>((s, v) => s + (v ?? 0), 0) }
}

// ─── the whole report ───────────────────────────────────────────────

export interface UpcomingMeeting {
  id: string
  meeting_date: string
  meeting_type: string | null
}

export interface MonthlyReportData {
  associationName: string
  period: PacketPeriod
  cash: Section<CashPosition>
  income: Section<IncomeSummary>
  collections: Section<Collections>
  delinquency: Section<DelinquencyHeadline>
  budget: Section<BudgetHeadline>
  violations: Section<ViolationActivity>
  arc: Section<ArcActivity>
  approvals: Section<number>
  /** `data: null` = no meeting scheduled. */
  meeting: Section<UpcomingMeeting | null>
}

/** Maps a loaded section through `fn`; a failed one stays failed. */
export function mapSection<T, U>(res: { ok: true; data: T } | { ok: false }, fn: (t: T) => U): Section<U> {
  return res.ok ? { ok: true, data: fn(res.data) } : { ok: false }
}
