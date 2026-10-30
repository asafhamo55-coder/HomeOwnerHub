/**
 * The accounting overview's budget glance: which expense lines have spent
 * past their budget. Pure; the math (budgeted, actual) comes from
 * computeBudgetVsActual, this only picks and ranks.
 */
import type { BudgetVsActualRow } from './queries'

export interface OverBudgetLine {
  accountId: string
  accountNumber: string
  accountName: string
  budgeted: number
  actual: number
  over: number
  /** Whole percent over budget; null when the line has no budget (no divide by zero). */
  overPct: number | null
}

export const OVER_BUDGET_LIMIT = 3

/** Expense lines whose actual exceeds budget, largest overage in dollars first. */
export function topOverBudget(rows: BudgetVsActualRow[], limit = OVER_BUDGET_LIMIT): OverBudgetLine[] {
  return rows
    .filter((r) => r.accountType === 'expense' && r.actual > r.budgeted)
    .map((r) => {
      const over = r.actual - r.budgeted
      return {
        accountId: r.accountId,
        accountNumber: r.accountNumber,
        accountName: r.accountName,
        budgeted: r.budgeted,
        actual: r.actual,
        over,
        overPct: r.budgeted > 0 ? Math.round((over / r.budgeted) * 100) : null,
      }
    })
    .sort(
      (a, b) =>
        b.over - a.over ||
        (b.overPct ?? Infinity) - (a.overPct ?? Infinity) ||
        a.accountNumber.localeCompare(b.accountNumber),
    )
    .slice(0, limit)
}

export type BudgetGlance = { kind: 'none' } | { kind: 'ready'; lines: OverBudgetLine[] }

/** `null` rows means no budget exists for the year. */
export function budgetGlance(rows: BudgetVsActualRow[] | null): BudgetGlance {
  return rows === null ? { kind: 'none' } : { kind: 'ready', lines: topOverBudget(rows) }
}
