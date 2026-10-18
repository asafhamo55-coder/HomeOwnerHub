import type { StatusTone } from '@homeowner-portal/ui'
import { formatDay } from './format'

/**
 * How a payment plan is going (BL-080), as the board screens word it —
 * /accounting/payment-plans and the property page's Money section. Pure.
 *
 * `standing` comes from @homeowner-portal/workflows/payment-plans
 * (planProgress) for an ACTIVE plan; a completed plan carries the day its
 * audit row recorded. Anything else (proposed, cancelled, defaulted, or a
 * read that failed) has no standing and the screens say nothing extra —
 * never "On track" for something we couldn't read.
 */
export interface PlanStandingView {
  standing: 'behind' | 'on_track' | 'paid_off' | 'unlinked' | null
  found: number
  settled: number
  overdue: number
  nextDueDate: string | null
  /** Completed plans: the day it completed, when the audit row says. */
  completedOn: string | null
}

export interface PlanStandingText {
  tone: StatusTone
  label: string
  detail: string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function describePlanStanding(
  view: PlanStandingView | null | undefined,
  plan: { status: string; installment_count: number },
): PlanStandingText | null {
  if (plan.status === 'completed') {
    return {
      tone: 'success',
      label: 'Completed',
      detail: view?.completedOn ? `Paid in full · completed ${formatDay(view.completedOn)}` : 'Paid in full',
    }
  }
  if (plan.status !== 'active' || !view || !view.standing) return null
  const paid = `${view.settled} of ${plan.installment_count} paid`
  switch (view.standing) {
    case 'behind':
      return { tone: 'danger', label: 'Behind on plan', detail: `${plural(view.overdue, 'installment')} overdue · ${paid}` }
    case 'on_track':
      return {
        tone: 'info',
        label: 'On track',
        detail: view.nextDueDate ? `${paid} · next due ${formatDay(view.nextDueDate)}` : paid,
      }
    case 'paid_off':
      return { tone: 'success', label: 'Paid in full', detail: 'Moves to Completed with the next payment check, by tomorrow morning' }
    case 'unlinked':
      return { tone: 'neutral', label: 'Not tracked', detail: 'Some installment charges are missing, so this plan won’t complete on its own' }
  }
}
