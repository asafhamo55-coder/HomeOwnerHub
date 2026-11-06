// Twilio wrapper for transactional SMS. Mirror of lib/email.ts so the
// communications send pipeline can treat both channels symmetrically.
//
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   TWILIO_ACCOUNT_SID           — the Account SID ("AC…") from the Twilio console
//   TWILIO_AUTH_TOKEN            — the Auth Token (also signs inbound webhooks)
//   TWILIO_MESSAGING_SERVICE_SID — the Messaging Service ("MG…") holding the
//                                  registered 10DLC campaign and sender numbers.
//                                  A raw From number is never used.
//
// If any of the three is unset, sendSms returns { ok: false, error:
// SMS_NOT_CONFIGURED }, so a broadcast's text rows read "failed" rather
// than "sent" when nothing went out (BL-102 finding 2). smsConfigured()
// lets the composer grey out the Text option up front instead.
//
// No Twilio SDK (it is heavy): one form-encoded POST to the Messages
// resource with Basic auth (Account SID : Auth Token). Twilio answers 201
// with the message `sid`; sendSms returns it as `messageSid`, callers store
// it in communication_recipients.external_id, and the signed status webhook
// (/api/webhooks/twilio/status, lib/sms-status.ts) matches receipts on it.
// StatusCallback is the app's public origin (lib/app-origin.ts) plus that
// path. Twilio's error body is never logged or returned: only a short
// code (twilioErrorMessage).
//
// Every send passes the outbound safety guard (BL-004) first — outside
// VERCEL_ENV=production, or for a sandboxed org, only OUTBOUND_ALLOWLIST
// numbers are sent. See packages/observability/src/outbound-guard.ts.

import {
  OUTBOUND_BLOCKED_ERROR,
  guardRecipients,
} from '@homeowner-portal/observability/outbound-guard'
import type { OutboundSendOptions } from './email'
import { appUrl } from './app-origin'

const TWILIO_API = 'https://api.twilio.com/2010-04-01'
const SEND_TIMEOUT_MS = 10_000

/** The error a send returns when Twilio isn't fully configured. */
export const SMS_NOT_CONFIGURED = 'SMS not configured'

/** True only when every Twilio variable a send needs is present. Reads
 *  names only, never values, and logs nothing. */
export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_MESSAGING_SERVICE_SID,
  )
}

export interface SendSmsInput {
  /** E.164-formatted destination number, e.g. "+14045551234". */
  to: string
  /** Plain-text body. Carriers split at 160 chars (multipart for longer). */
  body: string
}

interface TwilioReply {
  sid?: unknown
  code?: unknown
}

/** Fetch seam so tests can pass a fake. */
export type SmsFetch = (url: string, init: RequestInit) => Promise<Response>

/**
 * A short, number-free reason for a failed Twilio call. Only the numeric
 * `code` from Twilio's JSON error is used (e.g. 21211 invalid To, 21610
 * recipient opted out); the message text, which can echo a number, is
 * never read. HTTP status is the fallback.
 */
export function twilioErrorMessage(status: number, code: unknown): string {
  if (typeof code === 'number' && Number.isInteger(code) && code > 0 && code < 1_000_000) {
    return `Twilio error ${code}`
  }
  return `Twilio HTTP ${status}`
}

export async function sendSms(
  input: SendSmsInput,
  opts: OutboundSendOptions & { fetchImpl?: SmsFetch } = {},
): Promise<
  | { ok: true; messageSid: string | null }
  | { ok: false; error: string }
> {
  const guard = guardRecipients('sms', [input], (i) => i.to, opts)
  if (guard.allowed.length === 0) {
    return { ok: false, error: OUTBOUND_BLOCKED_ERROR }
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!accountSid || !authToken || !serviceSid) {
    // Never report success for a text that did not go out: the recipient
    // row must read failed, not sent.
    return { ok: false, error: SMS_NOT_CONFIGURED }
  }

  const form = new URLSearchParams({
    To: input.to.trim(),
    Body: input.body,
    MessagingServiceSid: serviceSid,
    StatusCallback: appUrl('/api/webhooks/twilio/status'),
  })
  const doFetch: SmsFetch = opts.fetchImpl ?? ((url, init) => fetch(url, init))

  try {
    const res = await doFetch(`${TWILIO_API}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    let json: TwilioReply | null
    try {
      json = (await res.json()) as TwilioReply
    } catch {
      json = null
    }
    if (!res.ok) return { ok: false, error: twilioErrorMessage(res.status, json?.code) }
    return { ok: true, messageSid: typeof json?.sid === 'string' && json.sid ? json.sid : null }
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    return { ok: false, error: timedOut ? 'Twilio request timed out' : 'Twilio request failed' }
  }
}

/**
 * Replace anything that looks like a phone number with "[number]" before
 * it can land in a failed text's row (communication_recipients
 * .error_message). A number is 7 or more digits, either one contiguous
 * run or split by spaces, dashes, dots or parentheses, with or without a
 * leading +: "14045550100", "+1 404-555-0100", "(404) 555.0100". Security
 * review #3, SEC3-L7. It errs toward masking: a long digit group in an
 * error text is never worth keeping.
 */
export function maskPhoneNumbers(text: string): string {
  return text.replace(/\+?\(?\d(?:[ \t.()-]{0,3}\d){6,}\)?/g, '[number]')
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
