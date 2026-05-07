/**
 * Harris County, Texas — eviction compliance rule engine.
 *
 * This module is the legally load-bearing piece of the Eviction Hub.
 * Every rule here cites the Texas Property Code section it implements.
 * Pure functions only — no AI, no I/O, no time other than what the
 * caller passes in. That makes it trivial to unit-test and impossible
 * to silently change behavior under our feet.
 *
 * Citations (current as of 2025):
 *   Tex. Prop. Code §24.005(a) — written 3-day Notice to Vacate must
 *     be served before filing a forcible-detainer suit for non-payment.
 *   Tex. Prop. Code §24.005(b) — notice must be served in person, by
 *     posting to the inside of the main entry door, or by certified
 *     mail (return receipt requested).
 *   Tex. Prop. Code §24.005(g) — the 3 days run from the day of
 *     service, not the day after. Day-of counts.
 *   Tex. Prop. Code §92.001 — definitions; commercial leases follow a
 *     different track and we don't handle them here.
 *
 * Phase 1 scope: Harris County TX residential nonpayment only. Other
 * counties / states / case types live in sibling modules (or 'unknown'
 * fallthrough below).
 */

// Schema-aligned slugs (eviction_cases_notice_type_check enforces these
// exact values). 'unknown' is local-only — never persisted; used when
// the rule engine refuses to handle a case (commercial / not past due).
export type EvictionNoticeType =
  | '3day_pay_or_quit'
  | '30day_vacate'
  | 'just_cause'
  | 'unknown'

export interface ComplianceCheckInput {
  /** True if the lease is commercial. We only handle residential here. */
  isCommercial: boolean
  /** Days the tenant has been past due on rent. 0 means current. */
  daysUnpaid: number
  /** Monthly rent in dollars. Currently unused but recorded for the notice. */
  monthlyRent: number
  /** When this check is being run. Defaults to now; overridable for tests. */
  now?: Date
}

export interface ComplianceCheckResult {
  /**
   * Whether the landlord can file a forcible-detainer suit RIGHT NOW.
   * If false, the UI must surface why + when they can.
   */
  canFile: boolean
  /** Plain-English reason. Always populated, even when canFile is true. */
  reason: string
  /** Verbatim statutory citation that backs the decision. */
  legalBasis: string
  /** What kind of notice the landlord must serve, if any. */
  requiredNoticeType: EvictionNoticeType
  /** Date of the earliest legal filing — the day the cure period ends. */
  filingEligibleDate: Date
  /**
   * Number of whole days between today and filing_eligible_date,
   * floored at 0. Useful for a UI countdown.
   */
  daysUntilFiling: number
  /**
   * If true, the landlord can serve the notice today and start the
   * cure clock immediately.
   */
  canServeNoticeNow: boolean
}

const MS_PER_DAY = 86_400_000

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY)
}

function daysBetween(from: Date, to: Date): number {
  const diff = startOfDay(to).getTime() - startOfDay(from).getTime()
  return Math.max(0, Math.round(diff / MS_PER_DAY))
}

/**
 * Compliance check for Harris County TX residential nonpayment.
 *
 * Decision tree:
 *   - Commercial lease  → not in scope, refuse.
 *   - Days unpaid <= 0  → no cause, refuse (rent is current).
 *   - Otherwise         → require a §24.005 3-Day Notice to Vacate.
 *                         Filing eligible 3 days after service.
 *
 * The cure period under §24.005(g) is "3 days" — day of service counts
 * as day 0 by Texas case-law convention, so a notice served today makes
 * the soonest filing date today + 3 days.
 */
export function checkHarrisCountyCompliance(
  input: ComplianceCheckInput,
): ComplianceCheckResult {
  const today = startOfDay(input.now ?? new Date())

  if (input.isCommercial) {
    return {
      canFile: false,
      reason:
        'Commercial leases follow a different procedure than this tool covers. Consult counsel.',
      legalBasis: 'Tex. Prop. Code §92.001 (residential definition).',
      requiredNoticeType: 'unknown',
      filingEligibleDate: today,
      daysUntilFiling: 0,
      canServeNoticeNow: false,
    }
  }

  if (input.daysUnpaid <= 0) {
    return {
      canFile: false,
      reason:
        'Rent is not past due. There is no cause for an eviction filing on these facts.',
      legalBasis: 'Tex. Prop. Code §24.002 (forcible detainer requires unpaid rent or holdover).',
      requiredNoticeType: 'unknown',
      filingEligibleDate: today,
      daysUntilFiling: 0,
      canServeNoticeNow: false,
    }
  }

  // Standard nonpayment path — §24.005 3-day notice required.
  const filingEligibleDate = addDays(today, 3)
  return {
    canFile: false,
    reason:
      'Texas Property Code §24.005 requires a written 3-Day Notice to Vacate before any forcible-detainer filing. Serve the notice today; the earliest filing date is 3 days after service.',
    legalBasis:
      'Tex. Prop. Code §24.005(a)–(g). Notice may be served in person, by posting to the inside of the main entry door, or by certified mail (return receipt requested).',
    requiredNoticeType: '3day_pay_or_quit',
    filingEligibleDate,
    daysUntilFiling: daysBetween(today, filingEligibleDate),
    canServeNoticeNow: true,
  }
}
