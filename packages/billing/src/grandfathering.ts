// BL-104 / decision §5 — existing subscriptions keep their price until
// renewal. Pure date arithmetic; the renewal-migration job (BL-104 §6) and
// Settings → Billing read it.
//
// "Renewal" = the end of the subscription's current term:
//   - monthly ($4.99/door): the end of the 12-month first-year commitment
//     (start + COMMIT_MONTHS). A monthly subscriber already past month 12 is
//     out of commitment, so their next monthly invoice is the renewal.
//   - annual: the end of the current paid year (Stripe current_period_end).
// At renewal the subscription moves to Complete at its band, with
// proration_behavior 'none'. The board is emailed 30 days before.
// A customer who asks to move earlier is moved at the next invoice and
// released from the remaining commitment (an admin action; never unasked).

import { PRICING } from './pricing'
import { isLegacyPlan, type HoaPlanId } from './pricing-v2'

/** Days before the renewal that the board is told about the move. */
export const RENEWAL_NOTICE_DAYS = 30
/** Where a grandfathered subscription lands: Complete holds every current feature. */
export const RENEWAL_TARGET_PLAN: HoaPlanId = 'complete'

const DAY_MS = 24 * 60 * 60 * 1000

/** start + n calendar months (UTC), clamped to the month's last day. */
export function addMonthsUtc(start: Date, months: number): Date {
  const y = start.getUTCFullYear()
  const m = start.getUTCMonth() + months
  const target = new Date(Date.UTC(y, m, 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay))
  return target
}

export interface LegacySubscriptionFacts {
  /** orgs.plan: 'monthly' | 'annual' | 'legacy_per_door'. */
  plan: string
  /** 'monthly' or 'annual' — the Stripe Price's interval. */
  cadence: 'monthly' | 'annual'
  /** Subscription start (Stripe start_date). */
  startedAt: Date
  /** Stripe current_period_end. */
  currentPeriodEnd: Date
}

export interface GrandfatheringDecision {
  /** Keep the $4.99/door Price right now. */
  keepLegacyPrice: boolean
  /** When the subscription moves to the new plan (the renewal). */
  renewsAt: Date
  /** When the 30-day notice is due. */
  noticeAt: Date
  /** Plan it moves to at renewal. */
  moveTo: HoaPlanId
}

/** The renewal date for a grandfathered subscription. */
export function legacyRenewalDate(facts: LegacySubscriptionFacts): Date {
  if (facts.cadence === 'annual') return facts.currentPeriodEnd
  const commitmentEnd = addMonthsUtc(facts.startedAt, PRICING.COMMIT_MONTHS)
  // Past the commitment: the next monthly invoice is the renewal.
  return commitmentEnd.getTime() > facts.currentPeriodEnd.getTime() ? commitmentEnd : facts.currentPeriodEnd
}

/**
 * The rule for one subscription at `now`. Returns null for an org that is
 * not on a legacy plan (nothing to grandfather).
 */
export function grandfathering(facts: LegacySubscriptionFacts, now: Date): GrandfatheringDecision | null {
  if (!isLegacyPlan(facts.plan)) return null
  const renewsAt = legacyRenewalDate(facts)
  return {
    keepLegacyPrice: now.getTime() < renewsAt.getTime(),
    renewsAt,
    noticeAt: new Date(renewsAt.getTime() - RENEWAL_NOTICE_DAYS * DAY_MS),
    moveTo: RENEWAL_TARGET_PLAN,
  }
}
