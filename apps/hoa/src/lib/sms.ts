// Twilio wrapper for transactional SMS. Mirror of lib/email.ts so the
// communications send pipeline can treat both channels symmetrically.
//
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   TWILIO_ACCOUNT_SID   — starts with "AC..."
//   TWILIO_AUTH_TOKEN    — the auth token from the Twilio console
//   TWILIO_FROM_NUMBER   — the verified Twilio number in E.164 format,
//                          e.g. "+14045551234"
//
// If TWILIO_ACCOUNT_SID is unset we no-op and log instead. Keeps
// dev/preview builds from failing when SMS isn't configured yet — same
// graceful-degrade pattern email uses with RESEND_API_KEY.
//
// We use the `twilio` package (the official Twilio Node SDK). The client
// is constructed lazily and cached at the module level so serverless
// cold starts amortize across requests in the same warm function instance.

import twilio from 'twilio'
import type { Twilio } from 'twilio'

let _client: Twilio | null = null

function getClient(): Twilio | null {
  if (_client) return _client
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  _client = twilio(sid, token)
  return _client
}

export interface SendSmsInput {
  /** E.164-formatted destination number, e.g. "+14045551234". */
  to: string
  /** Plain-text body. Twilio splits at 160 chars (1600 max for long-form). */
  body: string
}

export async function sendSms(
  input: SendSmsInput,
): Promise<
  | { ok: true; messageSid: string | null }
  | { ok: false; error: string }
> {
  const from = process.env.TWILIO_FROM_NUMBER
  if (!from) {
    return { ok: false, error: 'TWILIO_FROM_NUMBER is not configured.' }
  }
  const client = getClient()
  if (!client) {
    // No SID/token configured — log so a developer can still trace the
    // flow without burning a real Twilio send. NOT for prod.
    console.warn('[sms] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing; skipping send', {
      to: input.to,
      bodyPreview: input.body.slice(0, 80),
    })
    return { ok: true, messageSid: null }
  }

  // Normalize the destination to E.164 if it's missing the leading +.
  // Twilio will reject anything else with error code 21211.
  const to = input.to.trim().startsWith('+')
    ? input.to.trim()
    : `+${input.to.trim().replace(/[^\d]/g, '')}`

  try {
    const message = await client.messages.create({
      from,
      to,
      body: input.body,
    })
    return { ok: true, messageSid: message.sid }
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Twilio send failed.'
    return { ok: false, error: message }
  }
}

/**
 * Squash HTML to a plain-text SMS body. Strips tags, decodes a few
 * common entities, collapses runs of whitespace. We don't aim for
 * perfect — SMS body should be plain English, the manager edits in
 * the wizard before sending.
 */
// Default cap chosen to fit one Twilio segment with the trial-account
// prefix ("Sent from your Twilio trial account - ") that Twilio prepends
// for free accounts. 160 - 38 prefix = 122 chars usable. Long-form
// messages should use a link to /communications/[id] instead — long
// unregistered SMS gets aggressively carrier-filtered on US networks.
export function htmlToSmsBody(html: string, maxLen = 279): string {
  const stripped = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
  return stripped.length > maxLen ? `${stripped.slice(0, maxLen - 1)}…` : stripped
}
