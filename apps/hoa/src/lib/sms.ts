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
// If any of the three is unset, sendSms returns { ok: false, error:
// SMS_NOT_CONFIGURED }. It used to no-op and report success when the key
// or secret was missing, so a broadcast's text rows read "sent" while
// nothing went out (BL-102 finding 2). smsConfigured() lets the composer
// grey out the Text option up front instead.
//
// We use the `@vonage/server-sdk` package (the official Vonage Node SDK)
// and its Messages API (vonage.messages.send, BL-146b). It authenticates
// with Basic auth from the same API key + secret pair the legacy SMS API
// used, so no new keys are needed. The Messages API answers 202 with a
// `message_uuid`; sendSms returns it as `messageSid`, the callers store it
// in communication_recipients.external_id, and the signed status webhook
// (/api/webhooks/vonage/status, lib/sms-status.ts) matches receipts on it.
// The legacy SMS API's messageId never matched a receipt.
// The client is constructed lazily and cached at the module level so
// serverless cold starts amortize across requests in the same warm
// function instance.

//
// Every send passes the outbound safety guard (BL-004) first — outside
// VERCEL_ENV=production, or for a sandboxed org, only OUTBOUND_ALLOWLIST
// numbers are sent. See packages/observability/src/outbound-guard.ts.

import { Vonage } from '@vonage/server-sdk'
import {
  OUTBOUND_BLOCKED_ERROR,
  guardRecipients,
} from '@homeowner-portal/observability/outbound-guard'
import type { OutboundSendOptions } from './email'

let _client: Vonage | null = null

function getClient(): Vonage | null {
  if (_client) return _client
  const apiKey = process.env.VONAGE_API_KEY
  const apiSecret = process.env.VONAGE_API_SECRET
  if (!apiKey || !apiSecret) return null
  _client = new Vonage({ apiKey, apiSecret })
  return _client
}

/** The error a send returns when Vonage isn't fully configured. */
export const SMS_NOT_CONFIGURED = 'SMS not configured'

/** True only when every Vonage variable a send needs is present. Reads
 *  names only, never values, and logs nothing. */
export function smsConfigured(): boolean {
  return Boolean(process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET && process.env.VONAGE_FROM_NUMBER)
}

export interface SendSmsInput {
  /** E.164-formatted destination number, e.g. "+14045551234". */
  to: string
  /** Plain-text body. Carriers split at 160 chars (multipart for longer). */
  body: string
}

export async function sendSms(
  input: SendSmsInput,
  opts: OutboundSendOptions = {},
): Promise<
  | { ok: true; messageSid: string | null }
  | { ok: false; error: string }
> {
  const guard = guardRecipients('sms', [input], (i) => i.to, opts)
  if (guard.allowed.length === 0) {
    return { ok: false, error: OUTBOUND_BLOCKED_ERROR }
  }

  const from = process.env.VONAGE_FROM_NUMBER
  const client = from ? getClient() : null
  if (!from || !client) {
    // Never report success for a text that did not go out: the recipient
    // row must read failed, not sent.
    return { ok: false, error: SMS_NOT_CONFIGURED }
  }

  // Vonage expects E.164 *without* the leading + (digits only): country
  // code followed by the subscriber number. Strip anything else.
  const to = input.to.trim().replace(/[^\d]/g, '')

  try {
    const resp = await client.messages.send({
      channel: 'sms',
      messageType: 'text',
      to,
      from,
      text: input.body,
    })
    // The Messages API accepts a text with HTTP 202 and a message_uuid
    // (the SDK maps it to messageUUID). Any non-2xx makes the SDK *throw*
    // a VetchError rather than resolve, so the real error handling lives
    // in the catch below.
    return { ok: true, messageSid: resp?.messageUUID || null }
  } catch (err) {
    // A failed send throws a VetchError whose unread response carries an
    // RFC 7807 body ({ type, title, detail }), e.g. title "Invalid sender"
    // or "Non-Whitelisted Destination". Surface that specific reason
    // instead of the generic "Request failed with status code 422".
    const detail = await firstVonageErrorText(err)
    // The fallback is masked too: a non-RFC 7807 failure can echo the
    // number in its message (security review #3, SEC3-L7).
    const message =
      detail ??
      (err && typeof err === 'object' && 'message' in err
        ? maskPhoneNumbers(String((err as { message: unknown }).message)).slice(0, 200)
        : 'Vonage send failed.')
    return { ok: false, error: message }
  }
}

/**
 * Replace anything that looks like a phone number with "[number]" before
 * it can land in a failed text's row (communication_recipients
 * .error_message). A number is 7 or more digits, either one contiguous
 * run or split by spaces, dashes, dots or parentheses, with or without a
 * leading +: "14045550100", "+1 404-555-0100", "(404) 555.0100". Security
 * review #3, SEC3-L7 (before it, only contiguous runs were masked). It
 * errs toward masking: a long digit group in an error text is never
 * worth keeping.
 */
export function maskPhoneNumbers(text: string): string {
  return text.replace(/\+?\(?\d(?:[ \t.()-]{0,3}\d){6,}\)?/g, '[number]')
}

/**
 * Pull the reason out of a thrown Vonage Messages API error. The SDK's
 * VetchError keeps the raw fetch Response (body not yet read); its JSON
 * body is { type, title, detail, instance }. Returns the title (a short
 * reason, like the legacy SMS API's errorText), else the detail. Phone
 * numbers, contiguous or formatted, are masked (maskPhoneNumbers) so a
 * number echoed back by Vonage never lands in the row. Returns undefined for anything unrecognizable; never throws.
 */
async function firstVonageErrorText(err: unknown): Promise<string | undefined> {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined
  const response = (err as { response?: unknown }).response
  if (!response || typeof response !== 'object' || !('text' in response)) return undefined
  const read = (response as { text: unknown }).text
  if (typeof read !== 'function') return undefined
  try {
    const raw: unknown = await read.call(response)
    if (typeof raw !== 'string' || raw.length === 0) return undefined
    const body: unknown = JSON.parse(raw)
    if (!body || typeof body !== 'object') return undefined
    const { title, detail } = body as { title?: unknown; detail?: unknown }
    const reason =
      typeof title === 'string' && title.trim()
        ? title.trim()
        : typeof detail === 'string' && detail.trim()
          ? detail.trim()
          : undefined
    return reason ? maskPhoneNumbers(reason).slice(0, 200) : undefined
  } catch {
    return undefined
  }
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
