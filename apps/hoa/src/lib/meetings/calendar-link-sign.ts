/**
 * L-3: the meeting-notice "Add to calendar" link's start time and place
 * are signed, so a link to a real meeting on our own domain can't be
 * re-shared with a different time or address (a phishing lure that the
 * portal would then put in the resident's calendar).
 *
 * The board's notice asks the server to build the link
 * (meetingCalendarParagraph, notice-actions.ts); the HMAC covers the org,
 * the meeting, and the exact `start` and `where` values. The calendar
 * route verifies it and, on a missing or bad signature, drops both and
 * serves the invite with the meeting's date only.
 *
 * Secret: paySettingsSecret(), the existing server-only settings signing
 * chain. Server-only (node:crypto). Never logs.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const CALENDAR_SIG_PARAM = 'sig'

interface Signed {
  orgId: string
  meetingId: string
  start: string | null
  where: string | null
}

function payload(s: Signed): string {
  // Newline-separated: none of the four values can contain one (uuids,
  // HH:MM, and a place whose whitespace is collapsed before signing).
  return ['meeting-calendar-link-v1', s.orgId.toLowerCase(), s.meetingId.toLowerCase(), s.start ?? '', s.where ?? ''].join('\n')
}

export function signCalendarLink(secret: string, s: Signed): string {
  return createHmac('sha256', secret).update(payload(s)).digest('hex')
}

/** True only for a well-formed signature over exactly these values. */
export function verifyCalendarLink(secret: string | null, s: Signed & { sig: string | null | undefined }): boolean {
  if (!secret || typeof s.sig !== 'string' || !/^[0-9a-f]{64}$/.test(s.sig)) return false
  const expected = Buffer.from(signCalendarLink(secret, s), 'hex')
  const given = Buffer.from(s.sig, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
