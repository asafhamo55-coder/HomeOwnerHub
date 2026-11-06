// One SMS per recipient, never a multipart blast (BL-072). Long-form SMS
// triggers US-carrier filtering for unregistered A2P traffic, so a long
// message is shortened and links to the full one in the portal. The
// wizard's hint (SMS_CHANNEL_HINT) describes exactly this function.
// Plain module, not 'use server', so the client wizard can import the copy.

export const SMS_MAX_CHARS = 279

/** A body at least this long was cut by htmlToSmsBody(html, 200). */
const LONG_BODY = 200

export const SMS_CHANNEL_HINT = `Up to ${SMS_MAX_CHARS} characters. Longer texts are shortened and end with a link to the full message in the portal.`

/** The carrier-required opt-out line every outbound text ends with. */
export const SMS_STOP_LINE = ' Reply STOP to opt out.'

/** Room left for content once the opt-out line is reserved. */
const CONTENT_MAX = SMS_MAX_CHARS - SMS_STOP_LINE.length

/** A body that already carries STOP wording (ours or a template's). */
function hasStopWording(body: string): boolean {
  return /reply\s+stop\b/i.test(body)
}

/**
 * Make a text end with SMS_STOP_LINE, within SMS_MAX_CHARS. Idempotent:
 * a body that already has the line (or other "Reply STOP" wording) is left
 * alone. Content is shortened to make room, never the STOP line. Pure and
 * client-safe; sendSms applies it as the last guard on every send.
 */
export function withStopLine(body: string): string {
  const trimmed = body.trimEnd()
  if (hasStopWording(trimmed)) return trimmed.length <= SMS_MAX_CHARS ? trimmed : trimmed.slice(0, SMS_MAX_CHARS)
  const content = trimmed.length > CONTENT_MAX ? `${trimmed.slice(0, CONTENT_MAX - 1).trimEnd()}…` : trimmed
  return `${content}${SMS_STOP_LINE}`
}

export function composeSmsBody({
  subject,
  body,
  portalLink,
}: {
  subject: string
  body: string
  portalLink: string
}): string {
  const combined = `${subject}: ${body}`
  const shorten = body.length >= LONG_BODY || combined.length > CONTENT_MAX
  if (!shorten) return withStopLine(combined)
  // The text gives way to the link, never the other way round: the old
  // inline version cut at 240 then sliced to 279, which chopped the end
  // off any real portal link (an https URL with a uuid is ~80 chars).
  // Priority: link, then STOP line, then as much content as fits.
  const tail = `… see ${portalLink}`
  const cut = `${combined.slice(0, Math.max(0, CONTENT_MAX - tail.length))}${tail}`.slice(0, CONTENT_MAX)
  return `${cut}${SMS_STOP_LINE}`
}
