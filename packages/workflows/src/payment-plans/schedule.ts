/**
 * Payment-plan installment schedule (BL-080 fix, 2026-10-19). Pure and
 * client-safe: createPaymentPlan writes it, the estoppel certificate and
 * collections letters match installments against it, and the new-plan form
 * previews it. One helper, so the three can't disagree.
 *
 * MONTH ENDS. Installment i is due on the start day, i months on, CLAMPED to
 * that month's last day: Jan 31 → Feb 28 (29) → Mar 31. Until 2026-10-19
 * createPaymentPlan used `Date.UTC(y, m - 1 + i, d)`, which overflows
 * (Jan 31 + 1 month = Mar 3), so a month-end plan skipped a month and put
 * two installments in the next one. `legacyDueDate` is that old date, kept
 * only so installments of plans made before the fix are still recognised.
 *
 * AMOUNTS. installment = total / count rounded to the cent; the last one
 * absorbs the drift, so the schedule adds up to the total exactly.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(day: string): [number, number, number] {
  const m = ISO_DAY.exec(day.slice(0, 10))
  if (!m) throw new Error(`not a yyyy-mm-dd day: ${day}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** `day` plus `n` calendar months, clamped to that month's last day. */
export function addMonthsClamped(day: string, n: number): string {
  const [y, m, d] = parts(day)
  const total = y * 12 + (m - 1) + n
  const year = Math.floor(total / 12)
  const month = total - year * 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return iso(Date.UTC(year, month, Math.min(d, last)))
}

/** The due date the pre-2026-10-19 code wrote (overflows at month ends). */
export function legacyDueDate(startDate: string, n: number): string {
  const [y, m, d] = parts(startDate)
  return iso(Date.UTC(y, m - 1 + n, d))
}

export interface ScheduledInstallment {
  /** 1-based, as in the installment memo. */
  index: number
  dueDate: string
  amountCents: number
}

/** Per-installment amount in cents (the plan's installment_amount). */
export function installmentCents(totalCents: number, count: number): number {
  return Math.round(totalCents / count)
}

export function installmentSchedule(startDate: string, count: number, totalCents: number): ScheduledInstallment[] {
  if (!Number.isInteger(count) || count < 1) return []
  const each = installmentCents(totalCents, count)
  const out: ScheduledInstallment[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      index: i + 1,
      dueDate: addMonthsClamped(startDate, i),
      amountCents: i === count - 1 ? totalCents - each * (count - 1) : each,
    })
  }
  return out
}
