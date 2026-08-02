/**
 * Date/time formatting for HOA-facing screens.
 *
 * Why this exists: the inbox screens are React Server Components, so they
 * render on Vercel, whose runtime timezone is UTC. `new Date(x).toLocaleString()`
 * with no options formats in the *runtime's* zone, so a resident's email sent
 * at 10:05 AM Eastern was displayed as 14:05 — an hour stamp that is simply
 * wrong to everyone reading it, and wrong in a way that looks plausible.
 *
 * Correspondence timestamps matter beyond cosmetics. A board member reading a
 * thread is often establishing when a resident was told something — before or
 * after a deadline, a violation notice, a board vote. A four- or five-hour
 * shift can invert that.
 *
 * The zone is stated explicitly here rather than left to the runtime, so the
 * output does not depend on where the code happens to execute. That also makes
 * these functions deterministically testable.
 */

/**
 * The product's business timezone.
 *
 * Matches every scheduled job in `packages/jobs` (`TZ=America/New_York` on the
 * daily digest, HOA and PM late fees, Plaid sync, eviction reminders and the
 * state-law refresh), so a "midnight" late fee and a "10:05 AM" email agree
 * about what day it is.
 *
 * KNOWN LIMITATION: this is product-wide, not per-association. An HOA outside
 * Eastern would see its correspondence stamped in Eastern. Fixing that properly
 * needs a timezone column on the association and every scheduled job keyed off
 * it — a larger change than this, and one that should be made deliberately
 * rather than smuggled in behind a formatting fix.
 */
export const HOA_TIME_ZONE = 'America/New_York'

/**
 * Full timestamp for a single message: date, time, and the zone abbreviation.
 *
 * The zone abbreviation is included deliberately. Without it a reader cannot
 * tell whether a time is theirs, the association's, or the server's — and this
 * bug existed precisely because that was ambiguous. "EDT"/"EST" also makes the
 * daylight-saving transition visible instead of silent.
 */
export function formatMessageTimestamp(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''

  // Explicit components rather than dateStyle/timeStyle: ECMA-402 forbids
  // combining those shorthands with timeZoneName, and dropping the zone
  // abbreviation is not an option — its absence is what made the original
  // bug invisible.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: HOA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

/**
 * Date only, for compact lists where a full timestamp would crowd the row.
 */
export function formatShortDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''

  return new Intl.DateTimeFormat('en-US', {
    timeZone: HOA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/**
 * Returns null for anything that is not a usable date.
 *
 * `new Date('nonsense')` yields an Invalid Date, and formatting one throws a
 * RangeError. A malformed `sent_at` on one message must not take down the whole
 * thread view — Phase A hit exactly this shape when a single corrupt Gmail
 * `internalDate` aborted an entire mailbox sync.
 */
function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
