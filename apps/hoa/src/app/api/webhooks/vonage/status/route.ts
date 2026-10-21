import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { parseText, parseValue } from '@/lib/api/parse'
import { zIsoDateTime } from '@/lib/api/schemas'
import { MAX_JSON_BYTES } from '@/lib/api/limits'
import { verifyVonageSignedWebhook } from '@/lib/sms-inbound'
import { applySmsStatus, smsStatusMove } from '@/lib/sms-status'

/**
 * BL-146 — Vonage delivery receipts (Messages API status webhook) → the
 * text's row on communication_recipients: delivered_at / 'delivered', or
 * failed_at / 'failed' with a fixed reason. Logic: lib/sms-status.ts.
 *
 * Off unless SMS_STATUS_WEBHOOK_ENABLED is "true": while off the route
 * answers 404, as if absent. Owner setup: docs/specs/2026-10-21-sms-
 * delivery-receipts.md (owner action OA-27).
 *
 * Order (RC-3), the same as /api/webhooks/vonage/inbound: flag (404) →
 * secret configured (503 not_configured) → Authorization header present
 * (401, no body read) → body read, size-capped (413) → signed JWT verified
 * with VONAGE_SIGNATURE_SECRET, its payload_hash matching the exact bytes
 * (401) → parse (400) → work. The body is read before the signature check
 * only because the signature covers those bytes; nothing is parsed until
 * it verifies.
 *
 * The row is matched on Vonage's message id only. Persistence failures
 * answer 500 so Vonage retries (RC-6); retries are no-ops (first-write-
 * wins timestamps, forward-only status). Logs carry the message id, the
 * status and a count — never the number, the text or the error detail.
 */

const MAX_FIELD = 200

/** Provider-controlled strings never 400 a genuine signed receipt: clipped, or null. */
const lenient = z
  .string()
  .max(MAX_JSON_BYTES)
  .transform((s) => s.slice(0, MAX_FIELD))
  .nullish()
  .catch(null)

const StatusSchema = z.object({
  message_uuid: lenient,
  status: lenient,
  channel: lenient,
  // A malformed provider timestamp falls back to "now" rather than 400-ing.
  timestamp: zIsoDateTime.nullish().catch(undefined),
  error: z
    .object({ title: z.union([z.string().max(MAX_JSON_BYTES), z.number()]).nullish().catch(null) })
    .nullish()
    .catch(null),
})

export const POST = withRoute('webhooks.vonage_status', async (request: Request) => {
  if (process.env.SMS_STATUS_WEBHOOK_ENABLED !== 'true') throw new ApiRouteError('not_found')
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
  const receipt = parseValue(StatusSchema, json)

  const messageId = receipt.message_uuid?.trim() || null
  const status = receipt.status?.trim().toLowerCase() || null
  if (!messageId || !status || !smsStatusMove(status) || (receipt.channel && receipt.channel !== 'sms')) {
    // Deliberately ignored: no id to match on, or a status that changes nothing.
    return NextResponse.json({ ok: true, action: 'ignored' })
  }

  const errorTitle = receipt.error?.title
  const outcome = await applySmsStatus(createAdminClient(), {
    messageId,
    status,
    at: (receipt.timestamp ? new Date(receipt.timestamp) : new Date()).toISOString(),
    errorCode: errorTitle === null || errorTitle === undefined ? null : String(errorTitle),
  })
  console.info('[api:webhooks.vonage_status] receipt applied', { messageId, status, updated: outcome.updated })
  return NextResponse.json({ ok: true, action: status, updated: outcome.updated })
})
