/**
 * Payment-plan progress (BL-080). Pure.
 *
 * THE LINK. A plan's installments are ordinary `special` assessments
 * (apps/hoa/src/lib/payment-plans.ts). The schema has no plan → charge
 * column; the one stored link is the installment's own charge entry:
 * a journal entry with source 'ar_payment', source_id = the assessment,
 * and the memo `installmentMemo(i, n, planId)` — "Payment plan
 * installment 2/6 (plan 1a2b3c4d)". `installmentFromMemo` reads it back.
 * The memo is built and parsed here only, so the two can't drift.
 * (A real column, `assessments.payment_plan_id`, would replace this —
 * reported in BL-080, not added: no migrations in this change.)
 *
 * SETTLED. An installment is settled when the payments applied to it
 * cover its amount (cents-exact), or nothing is owed on it any more
 * (waived, written off, or deleted). Overpaying one installment does not
 * pay the next — each charge stands alone, as on /dues.
 *
 * STANDING.
 *   behind    an unsettled installment's due date is before today
 *   unlinked  fewer installments found than the plan schedules — the plan
 *             is never completed on a guess
 *   paid_off  every scheduled installment found and settled
 *   on_track  otherwise
 */

export const INSTALLMENT_MEMO_PREFIX = 'Payment plan installment '

/** The 8-character key a plan's installment memos carry. */
export function planKey(planId: string): string {
  return planId.slice(0, 8).toLowerCase()
}

export function installmentMemo(index: number, count: number, planId: string): string {
  return `${INSTALLMENT_MEMO_PREFIX}${index}/${count} (plan ${planKey(planId)})`
}

/** The LIKE pattern for one plan's installment memos. */
export function installmentMemoPattern(planId: string): string {
  return `${INSTALLMENT_MEMO_PREFIX}%(plan ${planKey(planId)})`
}

const MEMO_RE = /^Payment plan installment (\d+)\/(\d+) \(plan ([0-9a-f]{8})\)$/

export function installmentFromMemo(memo: string): { index: number; count: number; key: string } | null {
  const m = MEMO_RE.exec(memo.trim())
  if (!m) return null
  return { index: Number(m[1]), count: Number(m[2]), key: m[3] }
}

export interface PlanRecord {
  id: string
  unitId: string
  installmentCount: number
  status: string
}

export interface InstallmentRecord {
  assessmentId: string
  unitId: string
  /** planKey() of the plan the memo names. */
  key: string
  index: number
  dueDate: string
  amount: number
  paid: number
  status: string
  deleted: boolean
}

export type PlanStanding = 'paid_off' | 'behind' | 'on_track' | 'unlinked'

export interface PlanProgress {
  standing: PlanStanding
  /** Installments found for the plan. */
  found: number
  settled: number
  /** Unsettled installments whose due date is before today. */
  overdue: number
  /** Earliest unsettled due date, or null when none is left. */
  nextDueDate: string | null
  paidTotal: number
  scheduledTotal: number
}

const SETTLED_STATUSES: readonly string[] = ['waived', 'written_off']

const cents = (n: number) => Math.round(Number(n) * 100)

export function isSettled(i: Pick<InstallmentRecord, 'amount' | 'paid' | 'status' | 'deleted'>): boolean {
  if (i.deleted) return true
  if (SETTLED_STATUSES.includes(i.status)) return true
  return cents(i.paid) >= cents(i.amount)
}

/** Installments grouped by plan id: memo key AND unit must both match. */
export function installmentsByPlan(
  plans: readonly PlanRecord[],
  installments: readonly InstallmentRecord[],
): Map<string, InstallmentRecord[]> {
  const out = new Map<string, InstallmentRecord[]>()
  for (const p of plans) {
    const key = planKey(p.id)
    const mine = installments
      .filter((i) => i.key === key && i.unitId === p.unitId)
      .sort((a, b) => a.index - b.index || a.dueDate.localeCompare(b.dueDate))
    out.set(p.id, mine)
  }
  return out
}

export function planProgress(
  plan: Pick<PlanRecord, 'installmentCount'>,
  installments: readonly InstallmentRecord[],
  today: string,
): PlanProgress {
  let settled = 0
  let overdue = 0
  let nextDueDate: string | null = null
  let paid = 0
  let scheduled = 0
  // One row per installment index: a duplicate link must not count twice.
  const seen = new Set<number>()
  for (const i of installments) {
    if (seen.has(i.index)) continue
    seen.add(i.index)
    scheduled += cents(i.amount)
    paid += Math.min(cents(i.paid), cents(i.amount))
    if (isSettled(i)) {
      settled += 1
      continue
    }
    if (i.dueDate < today) overdue += 1
    if (nextDueDate === null || i.dueDate < nextDueDate) nextDueDate = i.dueDate
  }
  const found = seen.size
  const standing: PlanStanding =
    overdue > 0
      ? 'behind'
      : found < plan.installmentCount
        ? 'unlinked'
        : settled === found
          ? 'paid_off'
          : 'on_track'
  return { standing, found, settled, overdue, nextDueDate, paidTotal: paid / 100, scheduledTotal: scheduled / 100 }
}
