// Resend wrapper for transactional email.
//
// Env vars:
//   RESEND_API_KEY        - your Resend API key
//   EMAIL_FROM            - the verified sender address, e.g. "HomeownerHub <hello@yourdomain.com>"
//                           Its DISPLAY NAME is a fallback: callers that pass
//                           `senderName` send as the community instead (see
//                           email/sender-name.ts). The address is always the
//                           one here, because that domain is Resend-verified.
//   NEXT_PUBLIC_APP_URL   - the public base URL used to build links in email bodies
//
// If RESEND_API_KEY is unset we no-op and log instead — keeps dev/preview
// builds from failing when the key isn't configured yet.
//
// Every recipient passes the outbound safety guard (BL-004) FIRST, before
// the key check: outside VERCEL_ENV=production — or for an org whose
// compliance_settings.outbound_mode is 'sandbox' — only OUTBOUND_ALLOWLIST
// recipients are sent; the rest come back { ok: false } with
// OUTBOUND_BLOCKED_ERROR. See packages/observability/src/outbound-guard.ts.

import { Resend } from 'resend'
import {
  OUTBOUND_BLOCKED_ERROR,
  guardRecipients,
} from '@homeowner-portal/observability/outbound-guard'
import { formatFrom } from './email/sender-name'
import { recipientMessageId } from './email/message-id'

let _client: Resend | null = null

function getClient(): Resend | null {
  if (_client) return _client
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  _client = new Resend(key)
  return _client
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
  /**
   * Display name for the From header, e.g. "Madison Park HOA". Omit for
   * platform mail that really is from HomeownerHub — omitting leaves
   * EMAIL_FROM exactly as configured.
   */
  senderName?: string | null
  /**
   * The communication_recipients row this email is for. When set, the email
   * carries our own Message-ID (`<hoh-cr.{id}@{EMAIL_FROM domain}>`), so a
   * reply's In-Reply-To / References names the row (email/message-id.ts).
   */
  recipientRef?: string | null
}

/** `{ headers: { 'Message-ID' } }` for a payload that names its recipient row, else nothing. */
function threadingHeaders(input: SendEmailInput, envFrom: string): { headers?: Record<string, string> } {
  const id = input.recipientRef ? recipientMessageId(input.recipientRef, envFrom) : null
  return id ? { headers: { 'Message-ID': id } } : {}
}

/** Per-send context for the outbound guard. */
export interface OutboundSendOptions {
  /** The sending org's `compliance_settings.outbound_mode === 'sandbox'`
   *  (see fetchOrgSandbox). Omit when the org is unknown: the env rule
   *  still applies. */
  orgSandbox?: boolean
  /** An id for the guard's log line (communication id etc.). Never PII. */
  ref?: string
}

export async function sendEmail(
  input: SendEmailInput,
  opts: OutboundSendOptions = {},
): Promise<
  | { ok: true; messageId: string | null }
  | { ok: false; error: string }
> {
  const guard = guardRecipients('email', [input], (i) => i.to, opts)
  if (guard.allowed.length === 0) {
    return { ok: false, error: OUTBOUND_BLOCKED_ERROR }
  }

  const envFrom = process.env.EMAIL_FROM
  if (!envFrom) {
    return { ok: false, error: 'EMAIL_FROM is not configured.' }
  }
  const from = formatFrom(envFrom, input.senderName)
  const client = getClient()
  if (!client) {
    // No key configured — log so a developer can still trace the flow
    // without burning a real Resend send. NOT for prod.
    // Ids/counts only — no address or subject in logs.
    console.warn('[email] RESEND_API_KEY missing; skipping send')
    return { ok: true, messageId: null }
  }

  const result = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...threadingHeaders(input, envFrom),
  })

  if (result.error) {
    return { ok: false, error: result.error.message ?? 'Resend send failed.' }
  }
  return { ok: true, messageId: result.data?.id ?? null }
}

export function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

/** Resend accepts at most 100 emails per batch call. */
const BATCH_MAX = 100

export type BatchSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string }

/**
 * Send many emails as ceil(n/100) API calls instead of n.
 *
 * Resend's limit is 10 requests per second PER TEAM, and the communications
 * pipeline used to issue one request per recipient in a single Promise.all
 * burst. A real 47-recipient announcement on 2026-08-31 delivered exactly
 * 10 and failed 37, every failure "Too many requests" — the burst spent the
 * whole team's per-second budget in one go.
 *
 * Results are returned positionally: `results[i]` belongs to `inputs[i]`,
 * so callers keep the per-recipient audit trail they had before.
 *
 * Validation is 'permissive' deliberately. Resend defaults to 'strict',
 * where ONE malformed address fails the entire batch — that would be a
 * regression from the per-recipient loop this replaces, where "a single bad
 * address never blocks the others".
 *
 * No attachments: Resend's batch endpoint does not support them. This path
 * sends none, but that is why sendEmail still exists alongside this.
 */
export async function sendEmailBatch(
  allInputs: SendEmailInput[],
  opts: OutboundSendOptions = {},
): Promise<BatchSendResult[]> {
  if (allInputs.length === 0) return []

  // Guard first. Blocked recipients get a positional { ok: false } and are
  // never handed to Resend; the allowed ones go through the unchanged
  // batching below and are slotted back into their original positions.
  const guard = guardRecipients('email', allInputs, (i) => i.to, opts)
  const sent = guard.allowed.length > 0 ? await sendAllowedBatch(guard.allowed) : []
  let cursor = 0
  return guard.allowedMask.map((ok) =>
    ok
      ? (sent[cursor++] ?? { ok: false as const, error: 'no batch result returned' })
      : { ok: false as const, error: OUTBOUND_BLOCKED_ERROR },
  )
}

/** Resend batching for recipients the guard has already cleared. */
async function sendAllowedBatch(inputs: SendEmailInput[]): Promise<BatchSendResult[]> {

  const envFrom = process.env.EMAIL_FROM
  if (!envFrom) {
    return inputs.map(() => ({ ok: false, error: 'EMAIL_FROM is not configured.' }))
  }

  const client = getClient()
  if (!client) {
    // Same no-op as sendEmail: without a key, report success without
    // burning a real send. NOT for prod — see emailConfigured() callers.
    console.warn(`[email] RESEND_API_KEY missing; skipping batch of ${inputs.length}`)
    return inputs.map(() => ({ ok: true, messageId: null }))
  }

  const results: BatchSendResult[] = []

  for (let start = 0; start < inputs.length; start += BATCH_MAX) {
    const chunk = inputs.slice(start, start + BATCH_MAX)
    const payload = chunk.map((input) => ({
      from: formatFrom(envFrom, input.senderName),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...threadingHeaders(input, envFrom),
    }))

    let response
    try {
      response = await client.batch.send(payload, { batchValidation: 'permissive' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      for (const _ of chunk) results.push({ ok: false, error: message })
      continue
    }

    if (response.error || !response.data) {
      const message = response.error?.message ?? 'Resend batch send failed.'
      for (const _ of chunk) results.push({ ok: false, error: message })
      continue
    }

    results.push(...mapChunkResults(chunk.length, response.data))
  }

  return results
}

/**
 * Line up Resend's reply with the emails we sent it.
 *
 * Two response shapes are handled because the API contract is ambiguous on
 * this point: `data` may be index-aligned with the payload (including
 * placeholders for failures), or it may contain only the successes. Failed
 * indices come from `errors[].index` either way, so that is treated as
 * authoritative and `data` is consumed accordingly — guessing wrong would
 * silently attribute one resident's message id to another.
 */
function mapChunkResults(
  size: number,
  data: { data?: { id: string }[]; errors?: { index: number; message: string }[] },
): BatchSendResult[] {
  const ids = data.data ?? []
  const errorByIndex = new Map((data.errors ?? []).map((e) => [e.index, e.message]))
  const indexAligned = ids.length === size

  const out: BatchSendResult[] = []
  let cursor = 0
  for (let i = 0; i < size; i += 1) {
    const failure = errorByIndex.get(i)
    if (failure !== undefined) {
      out.push({ ok: false, error: failure })
      if (indexAligned) cursor += 1
      continue
    }
    out.push({ ok: true, messageId: ids[indexAligned ? i : cursor]?.id ?? null })
    cursor += 1
  }
  return out
}

export type ReceivedEmailResult =
  | {
      ok: true
      email: {
        /** Header names lower-cased; values as Resend returns them. */
        headers: Record<string, string>
        text: string | null
        html: string | null
      }
    }
  | { ok: false; reason: 'not_configured' | 'not_found' | 'upstream' }

/**
 * An inbound email's headers and body. Resend's `email.received` webhook
 * carries metadata only (resend 6.x `ReceivedEmailEventData`: email_id,
 * from, to, subject, message_id, attachments) — no In-Reply-To, References
 * or body — so the webhook reads them here (GET /emails/receiving/{id}).
 * Read-only; sends nothing. Never returns provider text.
 */
export async function getReceivedEmail(emailId: string): Promise<ReceivedEmailResult> {
  const client = getClient()
  if (!client) return { ok: false, reason: 'not_configured' }
  try {
    const res = await client.emails.receiving.get(emailId)
    if (res.error || !res.data) {
      return { ok: false, reason: res.error?.statusCode === 404 ? 'not_found' : 'upstream' }
    }
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(res.data.headers ?? {})) {
      if (typeof v === 'string') headers[k.toLowerCase()] = v
    }
    return { ok: true, email: { headers, text: res.data.text ?? null, html: res.data.html ?? null } }
  } catch {
    return { ok: false, reason: 'upstream' }
  }
}
