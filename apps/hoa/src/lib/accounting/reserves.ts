/**
 * BL-120 — the reserve snapshot: where the reserve fund stands, what has
 * gone into it this fiscal year against the budget, and what has come out.
 * Shown as a dashboard card and a section of the month-end board report.
 * Not a reserve study (that is BL-037): it reads only the books.
 *
 * How reserves are represented here (checked against migrations 0006,
 * lib/association-setup.ts and scripts/seed-*.ts):
 *   - a fund with `fund_type = 'reserve'` (setup and the seeds create one,
 *     code RESERVE; 'operating', 'special_assessment' and 'capex' are the
 *     other allowed types). An association can have none, or several;
 *     every active reserve-type fund counts.
 *   - each ledger line carries its own `fund_id`, and every posted entry is
 *     fund-balanced (validate_je_balances), so a transfer from operating is
 *     two halves: an operating "Transfer to Reserves" expense, and inside
 *     the reserve fund a debit to reserve cash against reserve income or
 *     fund balance. Only the reserve-fund half is counted below, so nothing
 *     is counted twice.
 *   - budgets are per fund: a contribution is budgeted either as income in a
 *     reserve-fund budget or as a transfer line in the operating budget
 *     (isReserveContribution, shared with the budget draft).
 *
 * The figures, all from posted entries, on reserve-fund lines only:
 *   - balance: reserve-fund assets less reserve-fund liabilities, inception
 *     to `asOf`. A position, so closing entries stay in (BL-077).
 *   - contributions YTD: reserve-fund income other than interest, plus
 *     credits straight to reserve fund balance, from the start of the fiscal
 *     year to `asOf`. Closing entries left out.
 *   - interest YTD: reserve-fund income whose account name says interest.
 *   - draws YTD: reserve-fund expenses, plus debits straight to reserve fund
 *     balance (a transfer back out).
 *   - budget YTD: the year's budgeted contribution, prorated by days elapsed.
 *
 * Pure computation below; one loader at the bottom built on readLedgerLines.
 */

import { readAll } from '@/lib/supabase/read-all'
import { isReserveContribution } from './budget-draft'
import { isClosingEntry } from './closing-entries'
import { queryFailed, readLedgerLines, type AccountingDb } from './queries'

/** Contributions trailing the prorated budget by more than this share get a plain warning. */
export const BEHIND_BUDGET_TOLERANCE = 0.1

export interface ReserveFundRow {
  id: string
  name: string
  fund_type: string
  is_active: boolean | null
}

export interface ReserveJournalEntry {
  id: string
  entry_date: string
  source: string | null
}

export interface ReserveLedgerLine {
  journal_entry_id: string
  fund_id: string
  debit_amount: number | string
  credit_amount: number | string
  account: { account_type: string; account_name: string } | null
}

export interface ReserveBudgetRow {
  status: string
  fund_id: string
  fiscalPeriod: { start_date: string; end_date: string } | null
  budget_line_items: { amount: number | string; account: { account_type: string; account_name: string } | null }[] | null
}

export interface ReservePeriodRow {
  start_date: string
  end_date: string
}

export interface ReserveBudget {
  /** The whole fiscal year's budgeted contribution. */
  annual: number
  /** Prorated to `asOf` by days elapsed in the fiscal year. */
  ytd: number
  /** Where the contribution was budgeted. */
  source: 'reserve_fund' | 'operating_transfer'
}

export interface ReserveSnapshot {
  funds: { id: string; name: string }[]
  asOf: string
  /** The fiscal year the YTD figures cover; the calendar year when no period covers `asOf`. */
  year: { start: string; end: string }
  balance: number
  contributionsYtd: number
  interestYtd: number
  drawsYtd: number
  /** null when no budget for the year sets a reserve contribution. */
  budget: ReserveBudget | null
  /** Contributions trail the prorated budget by more than BEHIND_BUDGET_TOLERANCE. */
  behindBudget: boolean
}

export type ReserveSnapshotResult = { kind: 'no_reserve_fund' } | { kind: 'ready'; snapshot: ReserveSnapshot }

const STATUS_RANK: Record<string, number> = { approved: 0, draft: 1 }

const cents = (n: number) => Math.round(n * 100) / 100

function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)
}

/** Active reserve-type funds. Empty means the association has no reserve fund set up. */
export function reserveFunds(funds: ReserveFundRow[]): { id: string; name: string }[] {
  return funds.filter((f) => f.fund_type === 'reserve' && f.is_active !== false).map((f) => ({ id: f.id, name: f.name }))
}

/** The fiscal period covering `asOf`; else the calendar year. */
export function reserveYear(periods: ReservePeriodRow[], asOf: string): { start: string; end: string } {
  const p = periods.find((x) => x.start_date <= asOf && asOf <= x.end_date)
  return p ? { start: p.start_date, end: p.end_date } : { start: `${asOf.slice(0, 4)}-01-01`, end: `${asOf.slice(0, 4)}-12-31` }
}

/**
 * The year's budgeted contribution. A reserve-fund budget's contribution
 * lines win; without one, the operating budget's transfer lines. Approved
 * over draft per fund; archived budgets never count. Amounts are taken as
 * magnitudes (expense lines are stored negative by some books).
 */
export function budgetedContribution(
  budgets: ReserveBudgetRow[],
  reserveFundIds: Set<string>,
  year: { start: string; end: string },
  asOf: string,
): ReserveBudget | null {
  const byFund = new Map<string, ReserveBudgetRow>()
  for (const b of budgets) {
    if (!(b.status in STATUS_RANK)) continue
    const fp = b.fiscalPeriod
    if (!fp || fp.start_date !== year.start || fp.end_date !== year.end) continue
    const prior = byFund.get(b.fund_id)
    if (!prior || STATUS_RANK[b.status]! < STATUS_RANK[prior.status]!) byFund.set(b.fund_id, b)
  }
  const sum = (inReserve: boolean) => {
    let total = 0
    for (const [fundId, b] of byFund) {
      if (reserveFundIds.has(fundId) !== inReserve) continue
      for (const li of b.budget_line_items ?? []) {
        if (!li.account) continue
        const account = { name: li.account.account_name, type: li.account.account_type }
        if (isReserveContribution(account, inReserve ? 'reserve' : 'operating')) total += Math.abs(Number(li.amount))
      }
    }
    return total
  }
  const fromReserve = sum(true)
  const fromOperating = fromReserve > 0 ? 0 : sum(false)
  const annual = fromReserve > 0 ? fromReserve : fromOperating
  if (!(annual > 0)) return null
  const days = dayNumber(year.end) - dayNumber(year.start) + 1
  const elapsed = Math.min(days, Math.max(0, dayNumber(asOf) - dayNumber(year.start) + 1))
  return {
    annual: cents(annual),
    ytd: cents((annual * elapsed) / days),
    source: fromReserve > 0 ? 'reserve_fund' : 'operating_transfer',
  }
}

export function computeReserveSnapshot(input: {
  funds: ReserveFundRow[]
  periods: ReservePeriodRow[]
  journalEntries: ReserveJournalEntry[]
  lines: ReserveLedgerLine[]
  budgets: ReserveBudgetRow[]
  asOf: string
}): ReserveSnapshotResult {
  const funds = reserveFunds(input.funds)
  if (funds.length === 0) return { kind: 'no_reserve_fund' }
  const ids = new Set(funds.map((f) => f.id))
  const { asOf } = input
  const year = reserveYear(input.periods, asOf)

  const jeById = new Map(input.journalEntries.map((j) => [j.id, j]))
  let balance = 0
  let contributions = 0
  let interest = 0
  let draws = 0

  for (const l of input.lines) {
    if (!ids.has(l.fund_id) || !l.account) continue
    const je = jeById.get(l.journal_entry_id)
    if (!je || je.entry_date > asOf) continue
    const dr = Number(l.debit_amount)
    const cr = Number(l.credit_amount)
    const type = l.account.account_type

    if (type === 'asset') balance += dr - cr
    else if (type === 'liability') balance -= cr - dr

    if (je.entry_date < year.start || isClosingEntry(je)) continue
    if (type === 'income') {
      if (/interest/i.test(l.account.account_name)) interest += cr - dr
      else contributions += cr - dr
    } else if (type === 'expense') {
      draws += dr - cr
    } else if (type === 'equity') {
      // Straight to fund balance: money in is a contribution, out a draw.
      if (cr >= dr) contributions += cr - dr
      else draws += dr - cr
    }
  }

  const budget = budgetedContribution(input.budgets, ids, year, asOf)
  const contributionsYtd = cents(contributions)
  return {
    kind: 'ready',
    snapshot: {
      funds,
      asOf,
      year,
      balance: cents(balance),
      contributionsYtd,
      interestYtd: cents(interest),
      drawsYtd: cents(draws),
      budget,
      behindBudget: budget !== null && budget.ytd > 0 && contributionsYtd < budget.ytd * (1 - BEHIND_BUDGET_TOLERANCE),
    },
  }
}

/**
 * Reserve disclosure hints, only for states whose statute text is in
 * scripts/fixtures/state-law (FL ch. 720, CA Davis-Stirling). Each is a
 * plain restatement of the cited section, not advice; every other state
 * gets none.
 */
const DISCLOSURE_HINTS: Record<string, { cite: string; text: string }> = {
  FL: {
    cite: 'Fla. Stat. § 720.303(6)(h)',
    text: 'Reserve funds and their interest stay in the reserve account and are used only for authorized reserve expenditures, unless another use is approved in advance by a majority vote at a meeting with a quorum.',
  },
  CA: {
    cite: 'Cal. Civ. Code § 5300(b)(2)',
    text: 'The annual budget report sent to members must include a summary of the association’s reserves.',
  },
}

export function reserveDisclosureHint(state: string | null | undefined): { cite: string; text: string } | null {
  return DISCLOSURE_HINTS[(state ?? '').trim().toUpperCase()] ?? null
}

// ─── loader ─────────────────────────────────────────────────────────

export interface ReserveSnapshotLoad {
  result: ReserveSnapshotResult
  /** USPS code of the governing state, for reserveDisclosureHint. */
  state: string | null
}

/**
 * Reads everything the snapshot needs for one association, as of `asOf`
 * ('YYYY-MM-DD', the association's day). Throws on any query error (a
 * failed read is "couldn't load", never zeros). Every read is scoped by
 * association id, so the report job's service-role client is safe here.
 * Without a reserve fund it stops after the funds read.
 */
export async function loadReserveSnapshot(db: AccountingDb, associationId: string, asOf: string): Promise<ReserveSnapshotLoad> {
  const [fundsRes, assocRes] = await Promise.all([
    db.from('funds').select('id, name, fund_type, is_active').eq('association_id', associationId),
    db.from('associations').select('state, governing_law_state').eq('id', associationId).maybeSingle(),
  ])
  if (fundsRes.error) throw queryFailed(fundsRes.error)
  if (assocRes.error) throw queryFailed(assocRes.error)
  const assoc = assocRes.data as { state: string | null; governing_law_state: string | null } | null
  const state = (assoc?.governing_law_state ?? assoc?.state ?? '').trim().toUpperCase() || null
  const funds = (fundsRes.data ?? []) as ReserveFundRow[]
  if (reserveFunds(funds).length === 0) return { result: { kind: 'no_reserve_fund' }, state }

  const [periodsRes, budgetsRes, jes] = await Promise.all([
    db.from('fiscal_periods').select('start_date, end_date').eq('association_id', associationId),
    db
      .from('budgets')
      .select(
        'status, fund_id, fiscalPeriod:fiscal_period_id(start_date, end_date), budget_line_items(amount, account:account_id(account_type, account_name))',
      )
      .eq('association_id', associationId)
      .is('deleted_at', null),
    readAll<ReserveJournalEntry>(
      (from, to) =>
        db
          .from('journal_entries')
          .select('id, entry_date, source')
          .eq('association_id', associationId)
          .eq('status', 'posted')
          .lte('entry_date', asOf)
          .order('id', { ascending: true })
          .range(from, to),
      queryFailed,
    ),
  ])
  if (periodsRes.error) throw queryFailed(periodsRes.error)
  if (budgetsRes.error) throw queryFailed(budgetsRes.error)

  const lines =
    jes.length === 0
      ? []
      : await readLedgerLines<ReserveLedgerLine>(
          db,
          'journal_entry_id, fund_id, debit_amount, credit_amount, account:account_id(account_type, account_name)',
          jes.map((j) => j.id),
        )

  return {
    result: computeReserveSnapshot({
      funds,
      periods: (periodsRes.data ?? []) as ReservePeriodRow[],
      journalEntries: jes,
      lines,
      budgets: (budgetsRes.data ?? []) as unknown as ReserveBudgetRow[],
      asOf,
    }),
    state,
  }
}
