// BL-080: read how each payment plan is going, for the board screens.
// Active plans: progress from their installment charges and the payments
// applied to them. Completed plans: the day from their completion audit
// row. Throws on a failed read — callers wrap it in tryLoad and show the
// plan without a standing rather than a wrong one.

import { loadCompletionDays, loadPlanProgress, type PlanDb } from '@homeowner-portal/workflows/payment-plans'
import type { PlanStandingView } from '@/lib/money/plan-standing'

export interface StandingPlan {
  id: string
  unit_id: string
  installment_count: number
  status: string
}

export async function loadPlanStandings(
  db: PlanDb,
  ctx: { organizationId: string; associationId: string },
  plans: readonly StandingPlan[],
  today: string,
): Promise<Record<string, PlanStandingView>> {
  const active = plans
    .filter((p) => p.status === 'active')
    .map((p) => ({ id: p.id, unitId: p.unit_id, installmentCount: Number(p.installment_count), status: p.status }))
  const completed = plans.filter((p) => p.status === 'completed').map((p) => p.id)

  const [progress, days] = await Promise.all([
    active.length > 0 ? loadPlanProgress(db, ctx.associationId, active, today) : Promise.resolve(new Map()),
    completed.length > 0 ? loadCompletionDays(db, ctx.organizationId, completed) : Promise.resolve(new Map<string, string>()),
  ])

  const out: Record<string, PlanStandingView> = {}
  for (const p of active) {
    const g = progress.get(p.id)
    if (!g) continue
    out[p.id] = {
      standing: g.standing,
      found: g.found,
      settled: g.settled,
      overdue: g.overdue,
      nextDueDate: g.nextDueDate,
      completedOn: null,
    }
  }
  for (const id of completed) {
    out[id] = { standing: null, found: 0, settled: 0, overdue: 0, nextDueDate: null, completedOn: days.get(id) ?? null }
  }
  return out
}
