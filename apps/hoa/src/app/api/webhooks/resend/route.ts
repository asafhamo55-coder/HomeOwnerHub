import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { Database } from '@homeowner-portal/db/types'
import { createAdminClient } from '@homeowner-portal/db'

type RecipientUpdate =
  Database['public']['Tables']['communication_recipients']['Update']

/**
 * Resend webhook handler.
 *
 * Resend sends two kinds of events into the same endpoint:
 *
 *   1. Outbound delivery events for emails WE sent. Drives the
 *      delivery_status column on communication_recipients —
 *      email.sent → 'sent', email.delivered → 'delivered',
 *      email.opened → 'opened', email.clicked → 'clicked',
 *      email.bounced → 'bounced', email.complained → 'failed'.
 *
 *   2. Inbound emails (replies). Lands as a communication_replies row,
 *      linked to the parent communication via the In-Reply-To message
 *      id (matched against communication_recipients.external_id), with
 *      fallback to subject-line matching ("Re: ...").
 *
 * Signature verification uses Svix-style HMAC-SHA256 over
 * `${svix_id}.${svix_timestamp}.${rawBody}`. The secret comes from
 * RESEND_WEBHOOK_SECRET (set in the Resend dashboard). Without that env
 * var the endpoint rejects 401 — never silently accepts unverified
 * webhooks.
 */

interface ResendEventEnvelope {
  type: string                                    // e.g. 'email.delivered'
  created_at?: string
  data?: ResendEmailEventData & ResendInboundEventData
}

interface ResendEmailEventData {
  email_id?: string
  from?: string
  to?: string | string[]
  subject?: string
  click?: { link?: string; ip_address?: string; user_agent?: string }
}

interface ResendInboundEventData {
  inbound?: {
    message_id?: string
    from?: { email: string; name?: string }
    to?: { email: string }[]
    subject?: string
    text?: string
    html?: string
    in_reply_to?: string
    references?: string[]
  }
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'webhook_not_configured' },
      { status: 503 },
    )
  }

  const rawBody = await request.text()

  // 1. Verify signature. Skipping verification is unsafe — anyone can
  //    POST events and silently flip delivery_status.
  const sigHeader = request.headers.get('svix-signature') ?? ''
  const idHeader = request.headers.get('svix-id') ?? ''
  const tsHeader = request.headers.get('svix-timestamp') ?? ''
  if (!sigHeader || !idHeader || !tsHeader) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 401 })
  }
  if (!verifySvix(sigHeader, idHeader, tsHeader, rawBody, secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  // 2. Parse.
  let event: ResendEventEnvelope
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const db = createAdminClient()

  // 3. Route by event type.
  if (event.type?.startsWith('email.') && event.data?.email_id) {
    await handleDeliveryEvent(db, event)
  } else if (event.type === 'email.received' && event.data?.inbound) {
    await handleInboundReply(db, event)
  }
  // Unknown event types ack without action — Resend retries 4xx/5xx so we
  // always 200 on a verified payload.

  return NextResponse.json({ ok: true })
}

// ─── outbound delivery events ────────────────────────────────────────

type Db = ReturnType<typeof createAdminClient>

const DELIVERY_MAP: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'queued', // Resend retries; keep our status hopeful
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'failed',
}

const TIMESTAMP_FIELD: Record<string, string> = {
  'email.sent': 'sent_at',
  'email.delivered': 'delivered_at',
  'email.opened': 'opened_at',
  'email.clicked': 'clicked_at',
  'email.bounced': 'failed_at',
  'email.complained': 'failed_at',
}

async function handleDeliveryEvent(
  db: Db,
  event: ResendEventEnvelope,
): Promise<void> {
  const messageId = event.data?.email_id
  if (!messageId) return

  const newStatus = DELIVERY_MAP[event.type]
  if (!newStatus) return

  const update: RecipientUpdate = { delivery_status: newStatus }
  const ts = event.created_at ?? new Date().toISOString()
  switch (event.type) {
    case 'email.sent':
      update.sent_at = ts
      break
    case 'email.delivered':
      update.delivered_at = ts
      break
    case 'email.opened':
      update.opened_at = ts
      break
    case 'email.clicked':
      update.clicked_at = ts
      break
    case 'email.bounced':
    case 'email.complained':
      update.failed_at = ts
      break
  }

  // Don't downgrade: an 'opened' event arriving after 'clicked' shouldn't
  // overwrite the clicked state. Use a CASE expression via RPC if we ever
  // need ordering enforcement; for now the events come in roughly in order
  // and the table records every timestamp regardless.
  await db
    .from('communication_recipients')
    .update(update)
    .eq('external_id', messageId)
}

// ─── inbound replies ─────────────────────────────────────────────────

async function handleInboundReply(
  db: Db,
  event: ResendEventEnvelope,
): Promise<void> {
  const inbound = event.data?.inbound
  if (!inbound) return

  // Resolve which communication this is replying to. Strategy in order:
  //   1. in_reply_to header → matches communication_recipients.external_id
  //   2. References header → same join, different field name
  //   3. Subject "Re: <original subject>" → fuzzy match on the most
  //      recent comm to this sender. Cheap; not in v1 unless needed.
  const candidates = [
    inbound.in_reply_to,
    ...(inbound.references ?? []),
  ].filter((s): s is string => !!s)

  let recipientId: string | null = null
  let communicationId: string | null = null
  let orgId: string | null = null

  if (candidates.length > 0) {
    const { data: match } = await db
      .from('communication_recipients')
      .select('id, communication_id, organization_id')
      .in('external_id', candidates)
      .limit(1)
      .maybeSingle()
    if (match) {
      recipientId = match.id
      communicationId = match.communication_id
      orgId = match.organization_id
    }
  }

  // If we can't link it back, drop the reply rather than create an
  // orphan. The board hears about lost replies via the manager-queue
  // dashboard counts (built in a later phase).
  if (!communicationId || !orgId) {
    console.warn('[resend webhook] inbound reply without matching comm', {
      from: inbound.from?.email,
      in_reply_to: inbound.in_reply_to,
    })
    return
  }

  await db.from('communication_replies').insert({
    organization_id: orgId,
    communication_id: communicationId,
    recipient_id: recipientId,
    channel: 'email',
    from_email: inbound.from?.email ?? null,
    subject: inbound.subject ?? null,
    body: inbound.text ?? inbound.html ?? '(no body)',
    external_id: inbound.message_id ?? null,
  })

  // Mark the recipient as 'replied' so the activity feed shows it.
  if (recipientId) {
    await db
      .from('communication_recipients')
      .update({
        delivery_status: 'replied',
        replied_at: new Date().toISOString(),
      })
      .eq('id', recipientId)
  }
}

// ─── Svix signature verification ────────────────────────────────────
//
// Resend uses Svix for webhook signing. The signature header looks like
// `v1,<base64>` (potentially with multiple values, space-separated). We
// recompute the expected signature and timing-safe-compare against each
// candidate. The svix-id + svix-timestamp + raw body form the signing
// payload.

function verifySvix(
  sigHeader: string,
  idHeader: string,
  tsHeader: string,
  rawBody: string,
  secret: string,
): boolean {
  // Reject signatures too far in the past/future (replay protection).
  // Svix's recommendation is 5 minutes.
  const tsSec = Number.parseInt(tsHeader, 10)
  if (!Number.isFinite(tsSec)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - tsSec) > 60 * 5) return false

  // Svix secrets are base64-encoded after the `whsec_` prefix.
  const secretBody = secret.startsWith('whsec_') ? secret.slice(6) : secret
  let secretKey: Buffer
  try {
    secretKey = Buffer.from(secretBody, 'base64')
  } catch {
    return false
  }

  const signedPayload = `${idHeader}.${tsHeader}.${rawBody}`
  const expected = createHmac('sha256', secretKey)
    .update(signedPayload)
    .digest('base64')

  const candidates = sigHeader.split(' ')
  for (const c of candidates) {
    const [version, sig] = c.split(',')
    if (version !== 'v1' || !sig) continue
    if (sig.length !== expected.length) continue
    try {
      if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true
    } catch {
      // length mismatch surfaces as throw; ignore + continue
    }
  }
  return false
}
