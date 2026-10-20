// BL-104 / decision §4 — the monthly SMS allowance per plan. Pure: no
// database, no env. The app counts this month's sent texts and asks here
// what that means (apps/hoa/src/lib/sms-allowance.ts); Settings → Billing
// and the communications send hook read the same answer.
//
//   Essentials: 2 segments per door per month (minimum 100).
//   Complete:   4 segments per door per month (minimum 200).
//
// Over the allowance, texts aren't sent (email and the portal still go) and
// the board is told why. A soft warning shows from 80%. Only orgs on the new
// plans (orgs.plan 'essentials' / 'complete') have an allowance, and only
// once PRICING_V2 is on: legacy, pilot and trial orgs are never limited.
//
// Segments: the send records (communication_recipients) carry no body, so a
// sent text is counted as SMS_SEGMENTS_PER_TEXT segments. Every text is
// capped at 279 characters (lib/sms.ts htmlToSmsBody / SMS_MAX_CHARS), which
// is at most two GSM-7 segments. A text with non-GSM characters can use more;
// an exact count needs a per-row segment column (a migration), deferred.

import { isHoaPlanId, normalizeDoors, type HoaPlanId } from './pricing-v2'

export const SMS_SEGMENTS_PER_DOOR: Readonly<Record<HoaPlanId, number>> = { essentials: 2, complete: 4 }
export const SMS_MIN_SEGMENTS: Readonly<Record<HoaPlanId, number>> = { essentials: 100, complete: 200 }
/** Segments counted per sent text (see the header). */
export const SMS_SEGMENTS_PER_TEXT = 2
/** The soft warning starts at this share of the allowance. */
export const SMS_WARN_FRACTION = 0.8

export type SmsAllowanceLevel = 'ok' | 'warning' | 'blocked'

export interface SmsAllowanceStatus {
  plan: HoaPlanId
  allowanceSegments: number
  usedSegments: number
  remainingSegments: number
  /** 0–100+, whole percent of the allowance used. */
  percentUsed: number
  level: SmsAllowanceLevel
}

/** Segments a plan includes per month at a door count. 0 homes still gets the minimum. */
export function smsAllowanceSegments(plan: HoaPlanId, doors: number): number {
  const d = Number.isFinite(doors) && doors >= 1 ? normalizeDoors(doors) : 0
  return Math.max(SMS_MIN_SEGMENTS[plan], SMS_SEGMENTS_PER_DOOR[plan] * d)
}

/** Whether an org has an SMS allowance at all: new-plan orgs, after the flip. */
export function smsAllowanceApplies(plan: string | null | undefined, pricingV2: boolean): plan is HoaPlanId {
  return pricingV2 && isHoaPlanId(plan)
}

export function smsAllowanceLevel(usedSegments: number, allowanceSegments: number): SmsAllowanceLevel {
  if (usedSegments >= allowanceSegments) return 'blocked'
  if (usedSegments >= allowanceSegments * SMS_WARN_FRACTION) return 'warning'
  return 'ok'
}

export function smsAllowanceStatus(plan: HoaPlanId, doors: number, sentTexts: number): SmsAllowanceStatus {
  const allowanceSegments = smsAllowanceSegments(plan, doors)
  const usedSegments = Math.max(0, Math.floor(sentTexts)) * SMS_SEGMENTS_PER_TEXT
  return {
    plan,
    allowanceSegments,
    usedSegments,
    remainingSegments: Math.max(0, allowanceSegments - usedSegments),
    percentUsed: Math.floor((usedSegments / allowanceSegments) * 100),
    level: smsAllowanceLevel(usedSegments, allowanceSegments),
  }
}

/** What a recipient row records, and the board reads, when a text is held back. */
export const SMS_ALLOWANCE_REACHED_MESSAGE =
  'Not texted: this month’s text message allowance is used up. Email and the portal still went. Texts resume on the 1st (see Settings → Billing).'

/** Board-facing copy for Settings → Billing. null when there is nothing to say. */
export function smsAllowanceNotice(status: SmsAllowanceStatus): { title: string; body: string } | null {
  if (status.level === 'blocked') {
    return {
      title: 'Text messages are paused until the 1st',
      body: `Your association has used this month’s ${status.allowanceSegments} text message segments. New texts aren’t sent; email and the resident portal still go. Texts resume on the 1st of next month.`,
    }
  }
  if (status.level === 'warning') {
    return {
      title: `You’ve used ${status.percentUsed}% of this month’s texts`,
      body: `${status.remainingSegments} of ${status.allowanceSegments} text message segments are left this month. When they run out, texts pause until the 1st; email and the portal keep going.`,
    }
  }
  return null
}
