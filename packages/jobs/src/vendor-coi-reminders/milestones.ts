/**
 * Vendor COI expiry milestones (BL-083). Pure.
 *
 * Three milestones per certificate: 30 days out, 7 days out, and the day
 * it expires. "Today" is the ASSOCIATION's calendar day (BL-043), and the
 * expiration is a date-only column compared on its Y-M-D parts.
 *
 * Catch-up, not exact-day: a milestone fires on the first run inside its
 * window — 8..30 days left for 'd30', 1..7 for 'd7', expiry day through
 * EXPIRED_GRACE_DAYS after for 'expired' — so a missed cron day, or a
 * certificate entered with 20 days left, still gets its reminder. Only the
 * most urgent milestone in reach fires: a certificate first seen at 5 days
 * left gets the 7-day email, never a stale 30-day one as well.
 *
 * The grace bound keeps the first run from emailing every vendor whose
 * certificate lapsed years ago.
 */

import { calendarDaysBetween } from '../association-time'
import { deterministicUuid } from '../deterministic-id'

export type CoiMilestone = 'd30' | 'd7' | 'expired'

export const FIRST_WARNING_DAYS = 30
export const FINAL_WARNING_DAYS = 7
export const EXPIRED_GRACE_DAYS = 7

export interface MilestoneHit {
  milestone: CoiMilestone
  /** Calendar days from today to expiry; 0 = expires today, negative = already expired. */
  daysLeft: number
}

export function coiMilestone(expiresOn: string, today: string): MilestoneHit | null {
  const daysLeft = calendarDaysBetween(today, expiresOn)
  if (!Number.isFinite(daysLeft)) return null
  if (daysLeft > FIRST_WARNING_DAYS) return null
  if (daysLeft > FINAL_WARNING_DAYS) return { milestone: 'd30', daysLeft }
  if (daysLeft > 0) return { milestone: 'd7', daysLeft }
  if (daysLeft >= -EXPIRED_GRACE_DAYS) return { milestone: 'expired', daysLeft }
  return null
}

/**
 * notifications.entity_id for the board's notice of one milestone (the
 * dedupe index is user_id + kind + entity_id). The expiration date is part
 * of the key, so a renewed certificate (new date) starts its own three
 * milestones, while re-running the same day — or the same milestone on a
 * later catch-up day — collides and notifies nobody twice.
 */
export function coiNoticeEntityId(
  associationId: string,
  vendorId: string,
  expiresOn: string,
  milestone: CoiMilestone,
): string {
  return deterministicUuid(`vendor-coi-notice:v1:${associationId}:${vendorId}:${expiresOn.slice(0, 10)}:${milestone}`)
}

/** "in 30 days" / "in 1 day" / "today" / "3 days ago". */
export function whenPhrase(daysLeft: number): string {
  if (daysLeft === 0) return 'today'
  if (daysLeft > 0) return `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
  const ago = -daysLeft
  return `${ago} day${ago === 1 ? '' : 's'} ago`
}
