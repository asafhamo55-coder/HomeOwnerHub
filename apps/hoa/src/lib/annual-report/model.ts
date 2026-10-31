/**
 * BL-153: the annual-meeting report for owners. Georgia asks for it in
 * § 44-3-230(a) ("comprehensive reports of the affairs, finances, and
 * budget projections"); every other state gets the same report without
 * the Georgia wording (./law.ts).
 *
 * OWNER-SAFE BY CONSTRUCTION. The board packet (BL-016) is board-only: it
 * lists delinquent homes, open violations by address and ARC requests.
 * This report goes to every owner, so each section below is rebuilt FIELD
 * BY FIELD from the loaders the packet and the other kits already use, and
 * only aggregate or association-level figures are copied across:
 *   - collections: totals, counts and aging only — never a home, a unit,
 *     an address, an owner's name or a per-home balance;
 *   - insurance: kind, insurer, limit, deductible and end date (the BL-142
 *     owner columns) — never the premium, policy number, notes or file;
 *   - elections: the seats and the names elected once results are
 *     recorded — never the other candidates, their homes or ledger checks;
 *   - motions: passed motions from APPROVED minutes (owners already see
 *     those in the resident portal, BL-116), with the mover's and
 *     seconder's names taken out of the text;
 *   - ledger account names pass through `ownerAccountLabel`, which masks a
 *     bank account or routing number typed into an account's name.
 * No vendor, bank-account or payment-method record is read anywhere.
 *
 * Pure (types only from the server loaders). The page renders
 * `AnnualReport`; ./message.ts turns it into the composer's message.
 */

import type { BalanceSheet, BudgetDetail, BudgetSummary, IncomeStatement, ReportLineRow } from '@/lib/accounting/queries'
import type { ReserveSnapshotResult } from '@/lib/accounting/reserves'
import type { PacketBudget } from '@/lib/board-packet/financials'
import type { DelinquencySummary } from '@/lib/board-packet/delinquency'
import type { SectionResult } from '@/lib/board-packet/sections'
import type { ComplianceOverview, ObligationTone } from '@/lib/compliance/obligations'
import type { InsurancePolicy } from '@/lib/insurance/model'
import { POLICY_KINDS, POLICY_KIND_LABELS, isActive } from '@/lib/insurance/model'
import { tallyOf, type Election } from '@/lib/elections/model'
import { motionsForMeeting, type MinutesRow } from '@/lib/meeting-motions'
import { calendarDaysBetween } from '@/lib/association-time'
import { formatDay, periodLabel } from '@/lib/money/format'
import { MEETING_TYPE } from '@/lib/status/community'
import type { AnnualReportJurisdiction } from './law'

// ─── Sections ────────────────────────────────────────────────────────

/** A section's content, a failed read ("couldn't load", never zeros), or a reason it has nothing. */
export type Section<T> = { state: 'ok'; data: T } | { state: 'failed' } | { state: 'none'; why: string }

/**
 * A loader's result → an owner-safe section. `build` copies only the
 * fields owners may see. A skipped loader (no accounting, flag off) is
 * `none` with `why`.
 */
export function sectionOf<S, T>(res: SectionResult<S>, build: (s: S) => T, why: string): Section<T> {
  if (res.ok) return { state: 'ok', data: build(res.data) }
  return 'skipped' in res ? { state: 'none', why } : { state: 'failed' }
}

// ─── Report window ───────────────────────────────────────────────────

/** Within this many days of a new fiscal year, the report covers the year just ended. */
export const EARLY_YEAR_DAYS = 60

export interface FiscalPeriodRow {
  start_date: string
  end_date: string
}

export interface ReportWindow {
  /** First day reported, 'YYYY-MM-DD'. */
  start: string
  /** Last day reported (inclusive): the fiscal year's end, or the report day for a year in progress. */
  end: string
  /** The fiscal year the window sits in: its last day (next year's budget starts after it). */
  fiscalYearEnd: string
  /** The whole fiscal year has closed. */
  complete: boolean
  /** "FY 2026" or "FY 2026, through Oct 21, 2026". */
  label: string
}

/**
 * What the report covers, as of `asOf` (the meeting day, or today while
 * the meeting is still ahead).
 *
 * The fiscal year in progress, to date — unless it began fewer than
 * EARLY_YEAR_DAYS ago and the year before it is on record, when the report
 * covers that whole year instead (a January annual meeting reports on the
 * year just closed, not on three weeks). No fiscal period on record: the
 * calendar year to date.
 */
export function reportWindow(periods: readonly FiscalPeriodRow[], asOf: string): ReportWindow {
  const valid = periods.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.start_date) && /^\d{4}-\d{2}-\d{2}$/.test(p.end_date))
  const current = valid.filter((p) => p.start_date <= asOf && asOf <= p.end_date).sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0]
  if (!current) {
    const y = asOf.slice(0, 4)
    const fy = { start_date: `${y}-01-01`, end_date: `${y}-12-31` }
    return { start: fy.start_date, end: asOf, fiscalYearEnd: fy.end_date, complete: false, label: `${periodLabel(fy)}, through ${formatDay(asOf)}` }
  }
  if (calendarDaysBetween(current.start_date, asOf) < EARLY_YEAR_DAYS) {
    const prior = valid.filter((p) => p.end_date < current.start_date).sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0]
    if (prior) return { start: prior.start_date, end: prior.end_date, fiscalYearEnd: prior.end_date, complete: true, label: periodLabel(prior) }
  }
  const complete = asOf >= current.end_date
  return {
    start: current.start_date,
    end: complete ? current.end_date : asOf,
    fiscalYearEnd: current.end_date,
    complete,
    label: complete ? periodLabel(current) : `${periodLabel(current)}, through ${formatDay(asOf)}`,
  }
}

// ─── Owner-safe shapes ───────────────────────────────────────────────

export interface OwnerLine {
  label: string
  amount: number
}

export interface OwnerIncome {
  totalIncome: number
  totalExpenses: number
  net: number
  income: OwnerLine[]
  expenses: OwnerLine[]
}

export interface OwnerBudgetRow {
  label: string
  kind: 'income' | 'expense'
  budgeted: number
  actual: number
}

export interface OwnerBudgetFund {
  fund: string
  period: string | null
  adopted: boolean
  rows: OwnerBudgetRow[]
  budgetedIncome: number
  actualIncome: number
  budgetedExpense: number
  actualExpense: number
  budgetedNet: number
  actualNet: number
}

export interface OwnerBalance {
  asOf: string
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  netIncomeToDate: number
  balanced: boolean
  assets: OwnerLine[]
  liabilities: OwnerLine[]
  equity: OwnerLine[]
}

export type OwnerReserves =
  | { kind: 'no_reserve_fund' }
  | {
      kind: 'ready'
      asOf: string
      year: string
      balance: number
      contributions: number
      interest: number
      draws: number
      /** null when no budget for the year sets a reserve contribution. */
      budgetedAnnual: number | null
      budgetedToDate: number | null
      behindBudget: boolean
    }

export interface OwnerProjectionFund {
  fund: string
  period: string | null
  /** Approved by the board, or still a draft the board proposes. */
  adopted: boolean
  income: OwnerLine[]
  expenses: OwnerLine[]
  totalIncome: number
  totalExpenses: number
  net: number
  /** This year's budget for the same fund, for the change; null when there is none. */
  currentIncome: number | null
  currentExpenses: number | null
}

export interface OwnerCollections {
  asOf: string
  totalOverdue: number
  homesBehind: number
  charges: number
  aging: { d1_30: number; d31_60: number; d61_90: number; d90_plus: number }
}

export interface OwnerPolicy {
  kind: string
  insurer: string
  limitCents: number | null
  deductibleCents: number | null
  inForceUntil: string
}

export interface OwnerComplianceItem {
  title: string
  status: string
  tone: ObligationTone
}

export interface OwnerMotion {
  date: string
  text: string
}

export interface OwnerMeetings {
  meetings: { date: string; type: string }[]
  motions: OwnerMotion[]
}

export interface OwnerElection {
  meetingDate: string
  seats: number | null
  /** results: elected names known; tie: the last seat is tied (bylaws decide); planned: no results yet. */
  state: 'results' | 'tie' | 'planned'
  resultsOn: string | null
  elected: string[]
}

export interface AnnualReport {
  associationName: string
  jurisdiction: AnnualReportJurisdiction
  meeting: { date: string; type: string; annual: boolean }
  preparedOn: string
  window: ReportWindow
  income: Section<OwnerIncome>
  budget: Section<OwnerBudgetFund[]>
  balance: Section<OwnerBalance>
  reserves: Section<OwnerReserves>
  projection: Section<OwnerProjectionFund[]>
  collections: Section<OwnerCollections>
  insurance: Section<OwnerPolicy[]>
  compliance: Section<OwnerComplianceItem[]>
  meetings: Section<OwnerMeetings>
  elections: Section<OwnerElection[]>
}

// ─── Builders (field by field) ───────────────────────────────────────

/**
 * An account name as owners see it. A bank account or routing number
 * typed into the name ("Operating ****4821", "Checking x4821", a full
 * number) is masked; years and ordinary words stay.
 */
export function ownerAccountLabel(name: string | null | undefined): string {
  const s = (name ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return 'Account'
  return s
    .replace(/(?:[*xX#•]+|\.{2,}|\bending(?: in)?\s+|\bacct\.?\s*|\baccount\s+(?:no\.?|number)\s*)\s?\d{2,}/gi, '••••')
    .replace(/\d{5,}/g, '••••')
}

const lines = (rows: readonly ReportLineRow[]): OwnerLine[] => rows.map((r) => ({ label: ownerAccountLabel(r.accountName), amount: r.balance }))

export function ownerIncome(s: IncomeStatement): OwnerIncome {
  return {
    totalIncome: s.totalIncome,
    totalExpenses: s.totalExpenses,
    net: s.netIncome,
    income: lines(s.income),
    expenses: lines(s.expenses),
  }
}

export function ownerBudgets(budgets: readonly PacketBudget[]): OwnerBudgetFund[] {
  return budgets.map(({ budget, report }) => ({
    fund: ownerAccountLabel(budget.fund?.name ?? 'Fund'),
    period: budget.fiscalPeriod ? periodLabel(budget.fiscalPeriod) : null,
    adopted: budget.status === 'approved',
    rows: report.rows.map((r) => ({ label: ownerAccountLabel(r.accountName) + (r.unbudgeted ? ' (not budgeted)' : ''), kind: r.accountType, budgeted: r.budgeted, actual: r.actual })),
    budgetedIncome: report.totals.budgetedIncome,
    actualIncome: report.totals.actualIncome,
    budgetedExpense: report.totals.budgetedExpense,
    actualExpense: report.totals.actualExpense,
    budgetedNet: report.totals.budgetedNet,
    actualNet: report.totals.actualNet,
  }))
}

export function ownerBalance(b: BalanceSheet): OwnerBalance {
  return {
    asOf: b.asOfDate,
    totalAssets: b.totalAssets,
    totalLiabilities: b.totalLiabilities,
    totalEquity: b.totalEquity,
    netIncomeToDate: b.netIncomePtd,
    balanced: b.isBalanced,
    assets: lines(b.assets),
    liabilities: lines(b.liabilities),
    equity: lines(b.equity),
  }
}

export function ownerReserves(r: ReserveSnapshotResult): OwnerReserves {
  if (r.kind === 'no_reserve_fund') return { kind: 'no_reserve_fund' }
  const s = r.snapshot
  return {
    kind: 'ready',
    asOf: s.asOf,
    year: periodLabel({ start_date: s.year.start, end_date: s.year.end }),
    balance: s.balance,
    contributions: s.contributionsYtd,
    interest: s.interestYtd,
    draws: s.drawsYtd,
    budgetedAnnual: s.budget ? s.budget.annual : null,
    budgetedToDate: s.budget ? s.budget.ytd : null,
    behindBudget: s.behindBudget,
  }
}

/**
 * Next year's budgets: those whose fiscal year starts first after
 * `fiscalYearEnd`, one per fund, an approved budget winning over a draft.
 */
export function pickProjectionBudgets(budgets: readonly BudgetSummary[], fiscalYearEnd: string): BudgetSummary[] {
  const later = budgets.filter((b) => b.fiscalPeriod && b.fiscalPeriod.start_date > fiscalYearEnd)
  if (later.length === 0) return []
  const first = later.map((b) => b.fiscalPeriod!.start_date).sort()[0]!
  const byFund = new Map<string, BudgetSummary>()
  for (const b of later) {
    if (b.fiscalPeriod!.start_date !== first) continue
    const key = b.fund?.id ?? `budget:${b.id}`
    const prior = byFund.get(key)
    if (!prior || (prior.status !== 'approved' && b.status === 'approved')) byFund.set(key, b)
  }
  return [...byFund.values()].sort((a, b) => (a.fund?.name ?? '').localeCompare(b.fund?.name ?? ''))
}

export interface ProjectionInput {
  budget: Pick<BudgetDetail, 'status' | 'fund' | 'fiscalPeriod' | 'lineItems'>
}

export function ownerProjection(next: readonly ProjectionInput[], current: readonly PacketBudget[]): OwnerProjectionFund[] {
  return next.map(({ budget }) => {
    const of = (type: string) =>
      budget.lineItems.filter((l) => l.accountType === type).map((l) => ({ label: ownerAccountLabel(l.accountName), amount: l.amount }))
    const income = of('income')
    const expenses = of('expense')
    const sum = (ls: OwnerLine[]) => ls.reduce((n, l) => n + l.amount, 0)
    const same = current.find((c) => (c.budget.fund?.id ?? null) === (budget.fund?.id ?? null) && budget.fund !== null)
    return {
      fund: ownerAccountLabel(budget.fund?.name ?? 'Fund'),
      period: budget.fiscalPeriod ? periodLabel(budget.fiscalPeriod) : null,
      adopted: budget.status === 'approved',
      income,
      expenses,
      totalIncome: sum(income),
      totalExpenses: sum(expenses),
      net: sum(income) - sum(expenses),
      currentIncome: same ? same.report.totals.budgetedIncome : null,
      currentExpenses: same ? same.report.totals.budgetedExpense : null,
    }
  })
}

/** Totals, counts and aging only. `units` (per home) is never copied. */
export function ownerCollections(d: DelinquencySummary, asOf: string): OwnerCollections {
  return {
    asOf,
    totalOverdue: d.totalOverdue,
    homesBehind: d.unitCount,
    charges: d.chargeCount,
    aging: { d1_30: d.aging.d1_30, d31_60: d.aging.d31_60, d61_90: d.aging.d61_90, d90_plus: d.aging.d90_plus },
  }
}

/** Policies in force on `today`: the BL-142 owner columns only. */
export function ownerInsurance(policies: readonly InsurancePolicy[], today: string): OwnerPolicy[] {
  const rank = (k: string) => POLICY_KINDS.indexOf(k as (typeof POLICY_KINDS)[number])
  return policies
    .filter((p) => isActive(p, today))
    .slice()
    .sort((a, b) => rank(a.kind) - rank(b.kind) || a.carrier.localeCompare(b.carrier))
    .map((p) => ({
      kind: POLICY_KIND_LABELS[p.kind] ?? 'Other',
      insurer: p.carrier.trim() || 'Insurer not recorded',
      limitCents: p.coverageLimitCents,
      deductibleCents: p.deductibleCents,
      inForceUntil: p.expiresOn,
    }))
}

/** Each obligation's title and where it stands (counts only; no names, no evidence files). */
export function ownerCompliance(o: ComplianceOverview, associationId: string | null): OwnerComplianceItem[] {
  const groups = associationId ? o.groups.filter((g) => g.associationId === associationId) : o.groups
  return (groups.length > 0 ? groups : o.groups).flatMap((g) =>
    g.obligations.map((ob) => ({ title: ob.title, status: ob.label, tone: ob.tone })),
  )
}

/**
 * The meetings held in the window (date and type), and the motions that
 * PASSED at those whose minutes are approved: the text only, without the
 * mover's or seconder's name.
 */
export function ownerMeetings(rows: readonly MinutesRow[], window: Pick<ReportWindow, 'start'>, through: string): OwnerMeetings {
  const held = rows
    .filter((r) => typeof r.meeting_date === 'string' && r.meeting_date.slice(0, 10) >= window.start && r.meeting_date.slice(0, 10) <= through)
    .slice()
    .sort((a, b) => (a.meeting_date < b.meeting_date ? -1 : a.meeting_date > b.meeting_date ? 1 : 0))
  const motions: OwnerMotion[] = held
    .filter((r) => r.status === 'approved')
    .flatMap((r) => motionsForMeeting(r))
    .filter((m) => m.result === 'passed')
    .map((m) => ({ date: m.meetingDate.slice(0, 10), text: withoutNames(m.text, [m.movedBy, m.secondedBy]) }))
  return {
    meetings: held.map((r) => ({ date: r.meeting_date.slice(0, 10), type: meetingTypeLabel(r.meeting_type) })),
    motions,
  }
}

/** A motion's text with the mover's and seconder's names (as the parser found them) replaced. */
export function withoutNames(text: string, names: readonly (string | null)[]): string {
  let out = text
  for (const n of names) {
    const name = n?.trim()
    if (!name || name.length < 2) continue
    out = out.split(name).join('a director')
  }
  return out
}

export function meetingTypeLabel(type: string | null | undefined): string {
  const t = type ? MEETING_TYPE[type] : undefined
  return t ? `${t} meeting` : 'Meeting'
}

export interface ElectionInput {
  meetingDate: string
  /** A verified (signed) planner record; unverified or missing records are not passed. */
  election: Election
}

/** Seats, and the names elected once every vote is recorded. Other candidates never appear. */
export function ownerElections(list: readonly ElectionInput[]): OwnerElection[] {
  return list
    .filter((e) => e.election.seats !== null || e.election.candidates.length > 0)
    .map(({ meetingDate, election }) => {
      const t = tallyOf(election)
      const recorded = Boolean(election.resultsAnnouncedOn) && t.complete
      const state: OwnerElection['state'] = !recorded ? 'planned' : t.tieAtCutoff ? 'tie' : 'results'
      return {
        meetingDate,
        seats: election.seats,
        state,
        resultsOn: recorded ? election.resultsAnnouncedOn : null,
        elected: recorded ? t.rows.filter((r) => r.outcome === 'elected').map((r) => r.candidate.name) : [],
      }
    })
    .sort((a, b) => (a.meetingDate < b.meetingDate ? -1 : 1))
}
