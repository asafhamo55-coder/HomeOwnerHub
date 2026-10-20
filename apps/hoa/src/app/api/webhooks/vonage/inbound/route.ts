import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { parseText, parseValue } from '@/lib/api/parse'
import { MAX_JSON_BYTES } from '@/lib/api/limits'
import { applyStart, applyStop, classifyKeyword, verifyVonageSignedWebhook } from '@/lib/sms-inbound'

/**
 * BL-111 — Vonage inbound SMS (Messages API) → STOP / START / HELP.
 *
 * Off unless SMS_INBOUND_ENABLED is "true": while off the route answers
 * 404, as if absent. Spec and dashboard setup:
 * docs/specs/2026-10-20-sms-inbound.md.
 *
 * Order (RC-3, the resend/stripe webhook pattern): flag (404) → secret
 * configured (503 not_configured) → Authorization header present (401, no
 * body read) → body read, size-capped (413) → signed JWT verified, its
 * payload_hash matching the exact bytes (401) → parse (400) → work. The
 * body is read before the signature check only because the signature
 * covers those bytes; nothing is parsed until it verifies.
 *
 *   STOP-family → sms_opt_in = false + an `sms_consent_revoked` row for
 *                 every resident whose consent names the sender's number.
 *   START       → back on only where a prior consent row names the number.
 *   HELP / other → acknowledged, nothing written. Vonage's keyword
 *                 auto-reply answers HELP; we never send a text from here.
 *
 * Persistence failures answer 500 so Vonage retries (RC-6); retries are
 * idempotent (see lib/sms-inbound.ts). Logs carry the message id, keyword
 * and counts — never the number, its hash or the text.
 */

const MAX_FIELD = 2000

/** Provider-controlled strings never 400 a genuine signed message: clipped, or null. */
const lenient = z
  .string()
  .max(MAX_JSON_BYTES)
  .transform((s) => s.slice(0, MAX_FIELD))
  .nullish()
  .catch(null)

const InboundSchema = z.object({
  message_uuid: lenient,
  channel: lenient,
  text: lenient,
  // Messages API v1 sends a digits-only string; older payloads an object.
  from: z
    .union([z.string().max(MAX_FIELD), z.object({ number: z.string().max(MAX_FIELD) }).transform((o) => o.number)])
    .nullish()
    .catch(null),
})

export const POST = withRoute('webhooks.vonage_inbound', async (request: Request) => {
  if (process.env.SMS_INBOUND_ENABLED !== 'true') throw new ApiRouteError('not_found')
  const secret = process.env.VONAGE_SIGNATURE_SECRET
  if (!secret) throw new ApiRouteError('not_configured')

  const authorization = request.headers.get('authorization')
  if (!authorization) {
    throw new ApiRouteError('unauthenticated', 'Missing webhook signature.', { reason: 'missing_signature' })
  }

  const rawBody = await parseText(request)
  const check = verifyVonageSignedWebhook({
    authorization,
    rawBody,
    secret,
    nowSeconds: Math.floor(Date.now() / 1000),
    apiKey: process.env.VONAGE_API_KEY ?? null,
  })
  if (!check.ok) {
    throw new ApiRouteError('unauthenticated', 'Invalid webhook signature.', { reason: check.reason })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    throw new ApiRouteError('invalid_json')
  }
  const msg = parseValue(InboundSchema, json)

  const keyword = classifyKeyword(msg.text)
  const messageId = msg.message_uuid?.trim() || null
  if (!keyword || keyword === 'help' || !msg.from || (msg.channel && msg.channel !== 'sms')) {
    // Deliberately ignored: not a keyword we act on (HELP is Vonage's).
    return NextResponse.json({ ok: true, action: keyword === 'help' ? 'help' : 'ignored' })
  }
  if (!messageId) {
    // No id to dedupe on: refusing would make Vonage retry forever, so ack.
    console.warn('[api:webhooks.vonage_inbound] keyword without message id', { keyword })
    return NextResponse.json({ ok: true, action: 'ignored' })
  }

  const db = createAdminClient()
  // The word the resident sent (e.g. UNSUBSCRIBE), recorded on the audit row.
  const word = (msg.text ?? '').trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '')
  const args = { fromRaw: msg.from, messageId, keyword: word, now: new Date() }
  const outcome = keyword === 'stop' ? await applyStop(db, args) : await applyStart(db, args)
  console.info('[api:webhooks.vonage_inbound] keyword applied', {
    messageId,
    keyword,
    matched: outcome.matched,
    changed: outcome.changed,
  })
  return NextResponse.json({ ok: true, action: keyword, matched: outcome.matched, changed: outcome.changed })
})
