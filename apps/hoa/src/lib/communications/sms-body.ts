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

/** Slice to at most n UTF-16 units without leaving half an emoji (lone high surrogate). */
function safeSlice(s: string, n: number): string {
  if (n <= 0) return ''
  if (n >= s.length) return s
  const c = s.charCodeAt(n - 1)
  return s.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n)
}

/** Compliant only if the body ENDS with the opt-out sentence. */
function endsWithStopLine(body: string): boolean {
  return body.toLowerCase().endsWith(SMS_STOP_LINE.trim().toLowerCase())
}

/**
 * Make a text end with SMS_STOP_LINE, within SMS_MAX_CHARS. Idempotent: a
 * body that already ends with the line and fits is returned as is. Anything
 * else is cut to make room (content gives way, never the STOP line) and the
 * line is appended, so "reply stop" wording elsewhere in the text does not
 * count. Pure and client-safe; sendSms applies it as the last guard.
 */
export function withStopLine(body: string): string {
  const trimmed = body.trim()
  if (endsWithStopLine(trimmed) && trimmed.length <= SMS_MAX_CHARS) return trimmed
  const content = trimmed.length > CONTENT_MAX ? `${safeSlice(trimmed, CONTENT_MAX - 1).trimEnd()}…` : trimmed
  return `${content}${SMS_STOP_LINE}`.trim()
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
  // Precondition: link + STOP line fit. If not, drop the link rather than
  // send a cut-off one.
  const tail = `… see ${portalLink}`
  if (tail.length > CONTENT_MAX) return withStopLine(combined)
  const cut = `${safeSlice(combined, CONTENT_MAX - tail.length).trimEnd()}${tail}`
  return `${cut}${SMS_STOP_LINE}`
}
