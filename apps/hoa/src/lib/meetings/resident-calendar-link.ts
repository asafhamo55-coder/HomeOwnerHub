/**
 * Server-side "Add to calendar" URL for a meeting a resident can already
 * see on their own page. Signed with the same HMAC the board's notice
 * uses (calendar-link-sign.ts), over this org and meeting. The resident
 * home and meetings pages know only the date, so no time or place is
 * signed; the calendar route serves the date-only invite and still
 * requires the signed-in member gate and the upcoming-meeting rule.
 *
 * Returns null when no signing secret is configured: no secret, no link.
 * Server-only (node:crypto).
 */

import { CALENDAR_SIG_PARAM, signCalendarLink } from './calendar-link-sign'
import { paySettingsSecret } from '@/lib/pay-by-zelle'

export function residentCalendarHref(
  orgId: string,
  meetingId: string,
  secret: string | null = paySettingsSecret(),
): string | null {
  if (!secret || !orgId || !meetingId) return null
  const sig = signCalendarLink(secret, { orgId, meetingId, start: null, where: null })
  return `/resident/meetings/${meetingId}/calendar?${CALENDAR_SIG_PARAM}=${sig}`
}
