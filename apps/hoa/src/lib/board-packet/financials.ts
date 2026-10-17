import {
  computeBalanceSheet,
  computeBudgetVsActual,
  computeIncomeStatementForRange,
  listBudgets,
  type BalanceSheet,
  type BudgetSummary,
  type BudgetVsActual,
  type IncomeStatement,
} from '@/lib/accounting/queries'
import type { PacketPeriod } from './period'

/**
 * The packet's money sections, built on the same report queries the
 * /accounting/reports pages use (which throw on failure). Each is a full
 * aggregation over posted ledger lines — no paged list is summed anywhere.
 */

/** Income statement for exactly the packet month (accrual basis). */
export function loadIncomeStatement(associationId: string, period: PacketPeriod): Promise<IncomeStatement> {
  return computeIncomeStatementForRange(associationId, period.start, period.end, 'accrual')
}

/** Position at the close of the packet month. */
export function loadBalanceSheet(associationId: string, period: PacketPeriod): Promise<BalanceSheet> {
  return computeBalanceSheet(associationId, period.end)
}

/**
 * Budgets whose fiscal period covers the packet month, one per fund — an
 * approved budget wins over a draft for the same fund.
 */
export function pickBudgetsForPeriod(budgets: BudgetSummary[], period: PacketPeriod): BudgetSummary[] {
  const byFund = new Map<string, BudgetSummary>()
  for (const b of budgets) {
    const fp = b.fiscalPeriod
    if (!fp || fp.start_date > period.start || fp.end_date < period.end) continue
    const fundKey = b.fund?.id ?? `budget:${b.id}`
    const prior = byFund.get(fundKey)
    if (!prior || (prior.status !== 'approved' && b.status === 'approved')) byFund.set(fundKey, b)
  }
  return [...byFund.values()]
}

export interface PacketBudget {
  budget: BudgetSummary
  report: BudgetVsActual
}

/**
 * Year-to-date through the end of the packet month (BL-051): entries
 * posted after the month — including ones posted before the meeting —
 * are not part of this month's packet.
 *
 * [] when no budget covers the month (the section says so, it isn't a failure).
 */
export async function loadBudgetsVsActual(associationId: string, period: PacketPeriod): Promise<PacketBudget[]> {
  const picked = pickBudgetsForPeriod(await listBudgets(associationId), period)
  const reports = await Promise.all(picked.map((b) => computeBudgetVsActual(associationId, b.id, { through: period.end })))
  return picked.flatMap((budget, i) => {
    const report = reports[i]
    return report ? [{ budget, report }] : []
  })
}
