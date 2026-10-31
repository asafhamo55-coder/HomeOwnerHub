import { computeBudgetVsActual, listBudgets, type BudgetVsActualRow } from './queries'
import { budgetGlance, type BudgetGlance } from './budget-overview'

/**
 * Year-to-date budget glance for the current fiscal period. Reuses the
 * report's loader (posted entries only, paged past the row cap), so the
 * overview and the full report can't disagree. Throws on a failed read;
 * the caller wraps it in tryLoad.
 */
export async function loadBudgetGlance(associationId: string, periodId: string | null, today: string): Promise<BudgetGlance> {
  if (!periodId) return { kind: 'none' }
  const budgets = (await listBudgets(associationId)).filter((b) => b.fiscalPeriod?.id === periodId && b.status !== 'archived')
  if (budgets.length === 0) return budgetGlance(null)
  const reports = await Promise.all(budgets.map((b) => computeBudgetVsActual(associationId, b.id, { through: today })))
  // An account budgeted in one fund's budget is not "unbudgeted" in another's:
  // drop those stray rows so the same activity isn't listed twice.
  const budgetedElsewhere = new Set(reports.flatMap((r) => (r?.rows ?? []).filter((x) => !x.unbudgeted).map((x) => x.accountId)))
  const rows: BudgetVsActualRow[] = reports.flatMap((r) => (r?.rows ?? []).filter((x) => !x.unbudgeted || !budgetedElsewhere.has(x.accountId)))
  return budgetGlance(rows)
}
