import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { applySmsStatus, smsStatusMove } from '@/lib/sms-status'
import { readTwilioWebhook } from '@/lib/twilio-webhook'

/**
 * BL-146 — Twilio delivery receipts (StatusCallback) → the text's row on
 * communication_recipients: delivered_at / 'delivered', or failed_at /
 * 'failed' with a fixed reason. Logic: lib/sms-status.ts.
 *
 * Off unless SMS_STATUS_WEBHOOK_ENABLED is "true": while off the route
 * answers 404, as if absent. Owner setup: docs/specs/2026-10-21-sms-
 * delivery-receipts.md (owner action OA-27).
 *
 * Order (RC-3), the same as /api/webhooks/twilio/inbound: flag (404) →
 * TWILIO_AUTH_TOKEN configured (503 not_configured) → X-Twilio-Signature
 * present (403, no body read) → form body read, size-capped (413) →
 * signature verified (403) → work. Form body and 403 instead of JSON and
 * 401 are the Twilio differences; see lib/twilio-webhook.ts.
 *
 * Fields: MessageSid, MessageStatus, ErrorCode. The row is matched on the
 * MessageSid only. Persistence failures answer 500 so Twilio retries
 * (RC-6); retries and out-of-order callbacks are no-ops (first-write-wins
 * timestamps, forward-only status, so a late "sent" never downgrades
 * "delivered"). Logs carry the message id, the status and a count, never
 * the number, the text or the error detail.
 */
export const POST = withRoute('webhooks.twilio_status', async (request: Request) => {
  if (process.env.SMS_STATUS_WEBHOOK_ENABLED !== 'true') throw new ApiRouteError('not_found')
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) throw new ApiRouteError('not_configured')

  const f = await readTwilioWebhook(request, '/api/webhooks/twilio/status', authToken)

  const messageId = f.get('MessageSid')?.trim() || null
  const status = (f.get('MessageStatus') ?? f.get('SmsStatus'))?.trim().toLowerCase() || null
  if (!messageId || !status || !smsStatusMove(status)) {
    // Deliberately ignored: no id to match on, or a status that changes nothing.
    return NextResponse.json({ ok: true, action: 'ignored' })
  }

  const outcome = await applySmsStatus(createAdminClient(), {
    messageId,
    status,
    at: new Date().toISOString(),
    errorCode: f.get('ErrorCode') ?? null,
  })
  console.info('[api:webhooks.twilio_status] receipt applied', { messageId, status, updated: outcome.updated })
  return NextResponse.json({ ok: true, action: status, updated: outcome.updated })
})
