/**
 * Round 31: the next scheduled violation hearing, for the resident home.
 * Pure: no I/O, so the rules are tested without a database.
 *
 * A hearing is shown only when the board has scheduled it AND sent the
 * notice (residentHearingView drops the day and place before that), and it
 * has not started yet in the association's own zone. Past, held,
 * cancelled and requested-only hearings never appear.
 */
import { instantAtLocalTime, todayIn } from '@/lib/association-time'
import { normaliseState } from '@/lib/compliance/statute-drift'
import type { ResidentHearingView } from './rules'

export const DEFAULT_HEARING_MINUTES = 60
export const HEARING_ICS_TITLE = 'Violation hearing'

export interface UpcomingHearing {
  violationId: string
  /** YYYY-MM-DD, the association's day. */
  hearingOn: string
  /** HH:MM wall time in the association's zone, or null. */
  hearingTime: string | null
  location: string | null
  /** Plain-words violation type, lower case ("trash bins"). */
  summary: string
  associationName: string | null
  /** Governing-law state of the home's association, or null. */
  state: string | null
  timeZone: string
}

const TIME_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** "trash_bins" -> "trash bins". Never throws; falls back to a plain phrase. */
export function hearingSummary(violationType: string | null | undefined): string {
  const t = (violationType ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  return t || 'a notice on your home'
}

/** The instant the hearing starts, or null when it has no time of day. */
export function hearingStartsAt(day: string, time: string | null, timeZone: string): Date | null {
  const m = time ? TIME_RE.exec(time) : null
  if (!m || !DAY_RE.test(day)) return null
  return instantAtLocalTime(day, Number(m[1]) + Number(m[2]) / 60, timeZone)
}

/**
 * True while the hearing is still ahead of `now` in the association's zone.
 * With a time: it must not have started. Without one: the day is today or later.
 */
export function isUpcomingHearing(
  h: { hearingOn: string; hearingTime: string | null },
  timeZone: string,
  now: Date,
): boolean {
  if (!DAY_RE.test(h.hearingOn)) return false
  const at = hearingStartsAt(h.hearingOn, h.hearingTime, timeZone)
  if (at) return at.getTime() > now.getTime()
  return h.hearingOn >= todayIn(timeZone, now)
}

/** Order key: start instant when known, else the end of that day. */
function sortKey(h: UpcomingHearing): number {
  const at = hearingStartsAt(h.hearingOn, h.hearingTime, h.timeZone)
  if (at) return at.getTime()
  return instantAtLocalTime(h.hearingOn, 23.99, h.timeZone).getTime()
}

/** Keep the upcoming ones and put the soonest first. */
export function nextHearingsFirst(hearings: readonly UpcomingHearing[], now: Date): UpcomingHearing[] {
  return hearings
    .filter((h) => isUpcomingHearing(h, h.timeZone, now))
    .sort((a, b) => sortKey(a) - sortKey(b) || a.violationId.localeCompare(b.violationId))
}

/** A resident hearing view -> the card fields, or null when it must not show. */
export function hearingToUpcoming(
  view: ResidentHearingView | null,
  ctx: Omit<UpcomingHearing, 'hearingOn' | 'hearingTime' | 'location'>,
): UpcomingHearing | null {
  if (!view || view.status !== 'scheduled' || !view.hearingOn) return null
  return { ...ctx, hearingOn: view.hearingOn, hearingTime: view.hearingTime, location: view.location }
}

// ─── words ───────────────────────────────────────────────────────────

/** "6:30 PM" from "18:30". */
export function hearingTimeText(time: string | null): string | null {
  const m = time ? TIME_RE.exec(time) : null
  if (!m) return null
  const h = Number(m[1])
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/** "Tuesday, November 17" from "2026-11-17". */
export function hearingDayText(day: string): string {
  if (!DAY_RE.test(day)) return day
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** What the board will do, in plain words. No legal conclusions. */
export function hearingExpectText(summary: string): string {
  return `The board will meet with you about ${summary}. You can come in person and speak. If you can’t make it, contact the board.`
}

/**
 * The remote-attendance line. The hearing record keeps no remote-access
 * field, so this is driven by the association's state: Florida's notice
 * carries access information for a phone or online hearing. Other states
 * get no line rather than a guess.
 */
export function remoteAttendanceText(state: string | null | undefined): string | null {
  if (normaliseState(state) !== 'FL') return null
  return 'You may be able to join by phone or online. Look for how to join in the notice the board sent you, or ask the board.'
}
