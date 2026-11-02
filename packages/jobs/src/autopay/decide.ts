/**
 * BL-036 autopay: the pure decisions. No I/O, integer cents only.
 *
 * Rules (design doc 4.4, docs/decisions/2026-10-31-online-dues-payments-design.md):
 *  - A charge is only ever autopaid after the owner was told about it, at
 *    least AUTOPAY_NOTICE_DAYS ahead. The notice records the charge ids and
 *    the cents it named; the run takes only those, never more than the notice
 *    said, even when charges were added since.
 *  - Regular dues by default; late fees, fines and special charges only when
 *    the owner ticked "also pay late fees and fines".
 *  - The owner's maximum is checked against the whole amount of the run,
 *    including the fee when the homeowner pays it. Over the maximum means no
 *    charge at all.
 *  - Two failed runs in a row pause the enrollment.
 */

export const AUTOPAY_NOTICE_DAYS = 3
export const AUTOPAY_MAX_CONSECUTIVE_FAILURES = 2

export interface AutopayCharge {
  id: string
  /** assessments.assessment_type. */
  type: string
  /** yyyy-mm-dd. */
  dueDate: string
  remainingCents: number
}

/** 'yyyy-mm-dd' plus n calendar days (UTC arithmetic on a date-only string). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const OTHER_TYPES = new Set(['special', 'late_fee', 'fine', 'interest'])

/** Whether autopay may pay a charge of this type for this enrollment. */
export function typeAllowed(type: string, includeOther: boolean): boolean {
  if (type === 'regular') return true
  return includeOther && OTHER_TYPES.has(type)
}

/** Charges to name in today's notice: allowed, owing, due within the notice window, not named before. */
export function noticeCandidates(args: {
  charges: readonly AutopayCharge[]
  today: string
  includeOther: boolean
  alreadyNoticed: ReadonlyMap<string, number>
}): AutopayCharge[] {
  const horizon = addDays(args.today, AUTOPAY_NOTICE_DAYS)
  return args.charges.filter(
    (c) =>
      c.remainingCents > 0 &&
      typeAllowed(c.type, args.includeOther) &&
      c.dueDate <= horizon &&
      !args.alreadyNoticed.has(c.id),
  )
}

export interface ChargeToTake {
  chargeId: string
  cents: number
}

/**
 * What a run takes today: noticed charges that are due, each for at most the
 * cents its notice named (and at most what is still owed).
 */
export function chargesToTake(args: {
  charges: readonly AutopayCharge[]
  today: string
  includeOther: boolean
  noticed: ReadonlyMap<string, number>
}): ChargeToTake[] {
  const out: ChargeToTake[] = []
  for (const c of args.charges) {
    const noticedCents = args.noticed.get(c.id)
    if (noticedCents === undefined) continue
    if (c.dueDate > args.today || !typeAllowed(c.type, args.includeOther)) continue
    const cents = Math.min(c.remainingCents, noticedCents)
    if (cents > 0) out.push({ chargeId: c.id, cents })
  }
  return out
}

export type RunDecision =
  | { kind: 'nothing' }
  | { kind: 'over_max'; totalCents: number; maxCents: number }
  | { kind: 'charge'; totalCents: number }

/** The maximum is a hard ceiling on the whole amount that leaves the account. */
export function decideRun(args: { duesCents: number; totalCents: number; maxCents: number }): RunDecision {
  if (args.duesCents <= 0) return { kind: 'nothing' }
  if (args.totalCents > args.maxCents) return { kind: 'over_max', totalCents: args.totalCents, maxCents: args.maxCents }
  return { kind: 'charge', totalCents: args.totalCents }
}

/** The circuit breaker. */
export function afterFailure(consecutiveFailures: number): { consecutiveFailures: number; paused: boolean } {
  const next = consecutiveFailures + 1
  return { consecutiveFailures: next, paused: next >= AUTOPAY_MAX_CONSECUTIVE_FAILURES }
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100).toLocaleString('en-US')
  const rem = abs % 100
  return rem === 0 ? `${sign}$${dollars}` : `${sign}$${dollars}.${String(rem).padStart(2, '0')}`
}
