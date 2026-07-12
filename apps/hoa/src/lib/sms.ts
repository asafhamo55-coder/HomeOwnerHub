// Vonage wrapper for transactional SMS. Mirror of lib/email.ts so the
// communications send pipeline can treat both channels symmetrically.
//
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   VONAGE_API_KEY      — the API key from the Vonage dashboard
//   VONAGE_API_SECRET   — the API secret from the Vonage dashboard
//   VONAGE_FROM_NUMBER  — the sender. For US delivery this must be a
//                         Vonage virtual number you've rented, in E.164
//                         (e.g. "14045551234"). Some non-US countries
//                         also accept an alphanumeric sender ID, e.g.
//                         "HomeownerHub".
//
// If VONAGE_API_KEY/SECRET are unset we no-op and log instead. Keeps
// dev/preview builds from failing when SMS isn't configured yet — same
// graceful-degrade pattern email uses with RESEND_API_KEY.
//
// We use the `@vonage/server-sdk` package (the official Vonage Node SDK)
// and its legacy SMS API (vonage.sms.send), which authenticates with the
// API key + secret pair. The client is constructed lazily and cached at
// the module level so serverless cold starts amortize across requests in
// the same warm function instance.

import { Vonage } from '@vonage/server-sdk'

let _client: Vonage | null = null

function getClient(): Vonage | null {
  if (_client) return _client
  const apiKey = process.env.VONAGE_API_KEY
  const apiSecret = process.env.VONAGE_API_SECRET
  if (!apiKey || !apiSecret) return null
  _client = new Vonage({ apiKey, apiSecret })
  return _client
}

export interface SendSmsInput {
  /** E.164-formatted destination number, e.g. "+14045551234". */
  to: string
  /** Plain-text body. Carriers split at 160 chars (multipart for longer). */
  body: string
}

export async function sendSms(
  input: SendSmsInput,
): Promise<
  | { ok: true; messageSid: string | null }
  | { ok: false; error: string }
> {
  const from = process.env.VONAGE_FROM_NUMBER
  if (!from) {
    return { ok: false, error: 'VONAGE_FROM_NUMBER is not configured.' }
  }
  const client = getClient()
  if (!client) {
    // No key/secret configured — log so a developer can still trace the
    // flow without burning a real Vonage send. NOT for prod.
    console.warn('[sms] VONAGE_API_KEY / VONAGE_API_SECRET missing; skipping send', {
      to: input.to,
      bodyPreview: input.body.slice(0, 80),
    })
    return { ok: true, messageSid: null }
  }

  // Vonage expects E.164 *without* the leading + (digits only): country
  // code followed by the subscriber number. Strip anything else.
  const to = input.to.trim().replace(/[^\d]/g, '')

  try {
    const resp = await client.sms.send({
      to,
      from,
      text: input.body,
    })
    // On success the SMS API resolves with a per-message status of "0"
    // (accepted for delivery). Any non-"0" status makes the SDK *throw*
    // (MessageSendAllFailure / MessageSendPartialFailure) rather than
    // resolve, so the real error handling lives in the catch below.
    const message = resp.messages?.[0]
    return { ok: true, messageSid: message?.messageId ?? null }
  } catch (err) {
    // A failed send throws a Vonage SMSFailure carrying the per-message
    // errorText (e.g. "Non White-listed Destination", "Invalid Sender
    // Address"). Surface that specific reason instead of the generic
    // "All SMS messages failed to send" wrapper message.
    const detail = firstVonageErrorText(err)
    const message =
      detail ??
      (err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Vonage send failed.')
    return { ok: false, error: message }
  }
}

/**
 * Pull the first per-message errorText out of a thrown Vonage SMSFailure.
 * The failure exposes getFailedMessages(): Array<{ status?, errorText? }>.
 * Returns undefined for anything that isn't a recognizable SMSFailure.
 */
function firstVonageErrorText(err: unknown): string | undefined {
  if (
    err &&
    typeof err === 'object' &&
    'getFailedMessages' in err &&
    typeof (err as { getFailedMessages: unknown }).getFailedMessages === 'function'
  ) {
    const failed = (
      err as { getFailedMessages: () => Array<{ errorText?: string }> }
    ).getFailedMessages()
    return failed?.[0]?.errorText
  }
  return undefined
}

/**
 * Squash HTML to a plain-text SMS body. Strips tags, decodes a few
 * common entities, collapses runs of whitespace. We don't aim for
 * perfect — SMS body should be plain English, the manager edits in
 * the wizard before sending.
 */
// Default cap keeps messages to roughly two GSM-7 segments (153 chars
// each in a multipart message). Long unregistered A2P SMS gets
// aggressively carrier-filtered on US networks, so long-form messages
// should link to /communications/[id] instead of blasting many segments.
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
