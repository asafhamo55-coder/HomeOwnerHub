// One SMS per recipient, never a multipart blast (BL-072). Long-form SMS
// triggers US-carrier filtering for unregistered A2P traffic, so a long
// message is shortened and links to the full one in the portal. The
// wizard's hint (SMS_CHANNEL_HINT) describes exactly this function.
// Plain module, not 'use server', so the client wizard can import the copy.

export const SMS_MAX_CHARS = 279

/** A body at least this long was cut by htmlToSmsBody(html, 200). */
const LONG_BODY = 200

export const SMS_CHANNEL_HINT = `Up to ${SMS_MAX_CHARS} characters. Longer texts are shortened and end with a link to the full message in the portal.`

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
  const shorten = body.length >= LONG_BODY || combined.length > SMS_MAX_CHARS
  if (!shorten) return combined
  // The text gives way to the link, never the other way round: the old
  // inline version cut at 240 then sliced to 279, which chopped the end
  // off any real portal link (an https URL with a uuid is ~80 chars).
  const tail = `… see ${portalLink}`
  return `${combined.slice(0, Math.max(0, SMS_MAX_CHARS - tail.length))}${tail}`.slice(0, SMS_MAX_CHARS)
}
