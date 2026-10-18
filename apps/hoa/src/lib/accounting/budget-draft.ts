/**
 * BL-029 — a first draft of next year's budget, from last year's budget and
 * the actual trailing 12 months.
 *
 * Pure: no database, no model. The loader (budget-draft-data.ts) gathers
 * the inputs; this decides every number and writes the one-line reason the
 * board reads beside it. The client editor re-runs it as the inflation rate
 * changes, and the AI summary is only ever handed its output — no figure a
 * board member sees is produced by a model.
 *
 * Per account:
 *   - base = the actual trailing 12 months when the account had activity
 *     (annualized when the books cover fewer than 12 months), else last
 *     year's budget, else nothing (a blank line the board fills in);
 *   - suggested = base × (1 + inflation%), in whole dollars;
 *   - a reserve contribution is never suggested below last year's budget.
 */

export const DEFAULT_INFLATION_PCT = 3
export const MAX_INFLATION_PCT = 20

export type DraftAccountType = 'income' | 'expense'

export interface DraftSourceAccount {
  id: string
  number: string
  name: string
  type: DraftAccountType
}

export interface DraftSource {
  /** The fund's income and expense accounts — one draft line each. */
  accounts: DraftSourceAccount[]
  /** Last year's budget: account id → amount. Empty when there was none. */
  priorBudget: Record<string, number>
  /** Posted activity over the trailing window, in each account's normal balance (income credit-positive, expense debit-positive). */
  actuals: Record<string, number>
  /** Months of books inside the trailing window (0–12). Below 12 the actuals are annualized; 0 means no actuals at all. */
  actualMonths: number
  /** Accounts that are contributions to reserves (see isReserveContribution). */
  reserveAccountIds: string[]
}

export type DraftBasis = 'actual' | 'prior_budget' | 'none'

export interface DraftLine {
  accountId: string
  accountNumber: string
  accountName: string
  accountType: DraftAccountType
  priorBudget: number | null
  /** Activity in the window as posted (not annualized); null when none. */
  actual: number | null
  basis: DraftBasis
  suggested: number
  /** True when the reserve floor raised the suggestion to last year's budget. */
  reserveFloor: boolean
  explanation: string
}

export interface DraftTotals {
  income: number
  expense: number
  net: number
  priorIncome: number
  priorExpense: number
}

export interface BudgetDraft {
  lines: DraftLine[]
  totals: DraftTotals
  /** False when there was neither a prior budget nor any activity — a blank template. */
  hasPriorData: boolean
}

const WHOLE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })

/** `$1,234`, `-$300`. */
export function wholeUsd(n: number): string {
  const r = Math.round(n)
  return r < 0 ? `-${WHOLE.format(-r)}` : WHOLE.format(r === 0 ? 0 : r)
}

function pctLabel(pct: number): string {
  return `+${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`
}

const hasActivity = (n: number | undefined): n is number => n !== undefined && Math.abs(n) >= 0.005

export function buildBudgetDraft(src: DraftSource, inflationPct: number): BudgetDraft {
  const factor = 1 + inflationPct / 100
  const months = Math.max(0, Math.min(12, Math.round(src.actualMonths)))
  const reserve = new Set(src.reserveAccountIds)
  const lines: DraftLine[] = []

  for (const a of src.accounts) {
    const prior = src.priorBudget[a.id]
    const priorBudget = prior === undefined ? null : Number(prior)
    const raw = months > 0 ? src.actuals[a.id] : undefined
    const actual = hasActivity(raw) ? raw : null

    let basis: DraftBasis
    let base: number
    const parts: string[] = [priorBudget === null ? 'No budget last year' : `Last year budget ${wholeUsd(priorBudget)}`]

    if (actual !== null) {
      basis = 'actual'
      const yearly = months < 12 ? (actual * 12) / months : actual
      base = Math.max(0, yearly)
      let a1 = `actual ${wholeUsd(actual)}`
      if (months < 12) a1 += ` over ${months} months (about ${wholeUsd(yearly)} a year)`
      if (yearly < 0) a1 += ' (counted as $0)'
      parts.push(a1)
    } else if (priorBudget !== null) {
      basis = 'prior_budget'
      base = priorBudget
      parts.push('no activity in the last 12 months')
    } else {
      basis = 'none'
      base = 0
    }

    let suggested = Math.round(base * factor)
    let explanation: string
    let reserveFloor = false
    if (basis === 'none') {
      explanation = 'No budget or activity last year — enter an amount'
    } else {
      explanation = `${parts.join(', ')}, ${pctLabel(inflationPct)}`
      if (reserve.has(a.id) && priorBudget !== null && suggested < priorBudget) {
        reserveFloor = true
        explanation += ` = ${wholeUsd(suggested)}; kept at last year’s ${wholeUsd(priorBudget)} (reserve contributions don’t go down in a draft)`
        suggested = Math.round(priorBudget)
      }
    }

    lines.push({
      accountId: a.id,
      accountNumber: a.number,
      accountName: a.name,
      accountType: a.type,
      priorBudget,
      actual,
      basis,
      suggested,
      reserveFloor,
      explanation,
    })
  }

  lines.sort((x, y) => (x.accountType === y.accountType ? x.accountNumber.localeCompare(y.accountNumber) : x.accountType === 'income' ? -1 : 1))

  return {
    lines,
    totals: totalsOf(lines.map((l) => ({ type: l.accountType, amount: l.suggested, prior: l.priorBudget ?? 0 }))),
    hasPriorData: lines.some((l) => l.basis !== 'none'),
  }
}

/** Totals for a set of amounts (the editor passes the board's edited amounts). */
export function totalsOf(rows: { type: DraftAccountType; amount: number; prior?: number }[]): DraftTotals {
  let income = 0
  let expense = 0
  let priorIncome = 0
  let priorExpense = 0
  for (const r of rows) {
    if (r.type === 'income') {
      income += r.amount
      priorIncome += r.prior ?? 0
    } else {
      expense += r.amount
      priorExpense += r.prior ?? 0
    }
  }
  return { income, expense, net: income - expense, priorIncome, priorExpense }
}

/** The inflation input: 0–20, at most one decimal. Null when invalid. */
export function parseInflationPct(raw: string): number | null {
  const t = raw.trim()
  if (!/^\d{1,2}(\.\d)?$/.test(t)) return null
  const n = Number(t)
  return n >= 0 && n <= MAX_INFLATION_PCT ? n : null
}

/**
 * A contribution INTO reserves, which the draft won't cut: an account named
 * as a reserve contribution or transfer, or any reserve-fund income other
 * than interest. Spending from reserves is not a contribution.
 */
export function isReserveContribution(account: { name: string; type: string }, fundType: string | null): boolean {
  const name = account.name.toLowerCase()
  if (/reserve\s+(contribution|transfer)|(contribution|transfer)s?\s+to\s+(the\s+)?reserve/.test(name)) return true
  return fundType === 'reserve' && account.type === 'income' && !/interest/.test(name)
}

export interface DraftChange {
  accountName: string
  accountType: DraftAccountType
  from: number
  to: number
  change: number
}

/** The biggest moves against last year's budget — computed here, never by the model. */
export function mainChanges(lines: Pick<DraftLine, 'accountName' | 'accountType' | 'priorBudget' | 'suggested'>[], limit = 5): DraftChange[] {
  return lines
    .map((l) => {
      const from = l.priorBudget ?? 0
      return { accountName: l.accountName, accountType: l.accountType, from, to: l.suggested, change: l.suggested - from }
    })
    .filter((c) => Math.abs(c.change) >= 1)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, limit)
}
