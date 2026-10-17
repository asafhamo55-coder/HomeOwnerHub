import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { parseText, parseValue } from '@/lib/api/parse'
import { zIsoDateTime, zText } from '@/lib/api/schemas'
import { MAX_ARRAY_ITEMS, MAX_JSON_BYTES, MAX_LONG_TEXT } from '@/lib/api/limits'
import { checkWrite } from '@/lib/api/db'
import { getReceivedEmail } from '@/lib/email'
import { messageIdsIn, recipientIdsFromMessageIds } from '@/lib/email/message-id'

type RecipientUpdate = Database['public']['Tables']['communication_recipients']['Update']
type DeliveryStatus = NonNullable<RecipientUpdate['delivery_status']>

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
 *      email.delivery_delayed changes nothing (Resend keeps retrying).
 *      A status only ever moves forward (RC-6): each update is filtered
 *      to rows whose current status is earlier, so a late 'delivered'
 *      cannot overwrite 'clicked'. Each event's timestamp column is
 *      first-write-wins, so a retried delivery is a no-op.
 *
 *   2. Inbound emails (`email.received`, replies). Dispatched BEFORE the
 *      delivery branch — it also starts with `email.` and carries an
 *      `email_id`, which used to route it into the delivery handler where
 *      it was silently dropped (R-09 / C-04). Resend's real payload is
 *      flat metadata (resend 6.x ReceivedEmailEventData: email_id, from,
 *      to, subject, message_id — no headers, no body), so the threading
 *      headers and text are read with GET /emails/receiving/{id} unless
 *      the payload already carries them (`data.inbound` or flat fields).
 *      Lands as a communication_replies row, linked through OUR
 *      Message-ID named in In-Reply-To / References. See
 *      handleInboundReply for how the link is made and authorised.
 *
 * Persistence failures answer 500 `internal`, and a failed read of the
 * inbound email 503, so Resend retries (RC-6);
 * 2xx means persisted, or deliberately ignored (unknown event type, an
 * unlinkable reply, a duplicate delivery).
 *
 * Order (RC-3): secret configured (503) → signature headers present (401,
 * no body read) → body read, size-capped (413) → HMAC verified (401) →
 * parse (400) → work. RC-3 exception: the body is read BEFORE the HMAC
 * check because the Svix HMAC is computed over those exact bytes; it is
 * not parsed or validated until the signature verifies.
 *
 * Validation (RC-8) never refuses a genuine signed event over a field the
 * outside emailer controls (display name, subject length, a long
 * References chain): a 4xx would make Svix retry until it gives up and the
 * reply would be lost. Every such string is bounded by the 1 MB body cap
 * and then clipped to its column budget; a field of an unexpected type
 * reads as absent.
 *
 * Signature verification uses Svix-style HMAC-SHA256 over
 * `${svix_id}.${svix_timestamp}.${rawBody}` (RC-7: provider HMAC, timing
 * safe). The secret comes from RESEND_WEBHOOK_SECRET; unset → 503
 * not_configured, never silently accepting unverified webhooks.
 */

const MAX_ID = 1000
const MAX_EMAIL = 320

/**
 * A provider-controlled string: bounded by the body cap (a body that passed
 * parseText can never exceed it, so this never 400s), then clipped.
 */
const clipped = (max: number) =>
  z
    .string()
    .max(MAX_JSON_BYTES)
    .transform((s) => s.slice(0, max))

/** Optional provider field: wrong type or absent reads as null, never a 400. */
const lenient = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().catch(null)

const Sender = z.union([
  z.object({ email: z.string().max(MAX_JSON_BYTES) }),
  z.string().max(MAX_JSON_BYTES),
])

/** The inbound fields we read. Accepted nested under `data.inbound` or flat on `data`. */
const InboundFields = {
  message_id: lenient(clipped(MAX_ID)),
  from: lenient(Sender),
  subject: lenient(clipped(MAX_LONG_TEXT)),
  text: lenient(clipped(MAX_JSON_BYTES)),
  html: lenient(clipped(MAX_JSON_BYTES)),
  in_reply_to: lenient(clipped(MAX_ID)),
  // References lists oldest first; the nearest parents are at the end.
  references: lenient(
    z
      .array(z.unknown())
      .max(MAX_JSON_BYTES)
      .transform((a) =>
        a
          .filter((v): v is string => typeof v === 'string')
          .slice(-MAX_ARRAY_ITEMS)
          .map((v) => v.slice(0, MAX_ID)),
      ),
  ),
}

const EventSchema = z.object({
  type: zText(100, 1),
  // A malformed provider timestamp falls back to "now" rather than
  // 400-ing (and retry-looping) an otherwise valid, signed event.
  created_at: zIsoDateTime.nullish().catch(undefined),
  data: lenient(
    z.object({
      email_id: lenient(clipped(MAX_ID)),
      inbound: lenient(z.object(InboundFields)),
      ...InboundFields,
    }),
  ),
})

type ResendEvent = z.output<typeof EventSchema>

export const POST = withRoute('webhooks.resend', async (request: Request) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) throw new ApiRouteError('not_configured')

  // 1. Signature headers present — needs no body, so an unsigned caller
  //    gets 401 whatever it sends (RC-3).
  const sigHeader = request.headers.get('svix-signature') ?? ''
  const idHeader = request.headers.get('svix-id') ?? ''
  const tsHeader = request.headers.get('svix-timestamp') ?? ''
  if (!sigHeader || !idHeader || !tsHeader) {
    throw new ApiRouteError('unauthenticated', 'Missing webhook signature.', { reason: 'missing_signature' })
  }

  // 2. Verify signature over the exact (size-capped) bytes. Skipping
  //    verification is unsafe — anyone could POST events and flip
  //    delivery_status.
  const rawBody = await parseText(request)
  if (!verifySvix(sigHeader, idHeader, tsHeader, rawBody, secret)) {
    throw new ApiRouteError('unauthenticated', 'Invalid webhook signature.', { reason: 'invalid_signature' })
  }

  // 3. Parse + validate.
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    throw new ApiRouteError('invalid_json')
  }
  const event = parseValue(EventSchema, json)

  const db = createAdminClient()
  // svix-id is the provider's delivery id: stable across Svix retries.
  const ctx = { deliveryId: idHeader.slice(0, 200) }

  // 4. Route by event type. Inbound first: it also matches `email.*`.
  if (event.type === 'email.received') {
    await handleInboundReply(db, event, ctx)
  } else if (event.type.startsWith('email.') && event.data?.email_id) {
    await handleDeliveryEvent(db, event, event.data.email_id, ctx)
  }
  // Unknown event types ack without action (deliberately ignored).

  return NextResponse.json({ ok: true })
})

// ─── outbound delivery events ────────────────────────────────────────

type Db = ReturnType<typeof createAdminClient>
type Ctx = { deliveryId: string }

const DELIVERY_MAP: Record<string, DeliveryStatus> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'failed',
  // email.delivery_delayed: Resend retries; the status stays where it is.
}

/**
 * The statuses each new status may overwrite. Anything not listed is
 * "later" and is left alone: 'replied' and 'suppressed' are never
 * overwritten by a delivery event, nor is a bounce or failure.
 * A complaint (→ 'failed') arrives after delivery/open/click by nature.
 */
const MAY_OVERWRITE: Record<DeliveryStatus, DeliveryStatus[]> = {
  queued: [],
  sent: ['queued'],
  delivered: ['queued', 'sent'],
  opened: ['queued', 'sent', 'delivered'],
  clicked: ['queued', 'sent', 'delivered', 'opened'],
  bounced: ['queued', 'sent', 'delivered'],
  failed: ['queued', 'sent', 'delivered', 'opened', 'clicked'],
  replied: ['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'],
  suppressed: [],
}

type TimestampField = 'sent_at' | 'delivered_at' | 'opened_at' | 'clicked_at' | 'failed_at'

const TIMESTAMP_FIELD: Partial<Record<string, TimestampField>> = {
  'email.sent': 'sent_at',
  'email.delivered': 'delivered_at',
  'email.opened': 'opened_at',
  'email.clicked': 'clicked_at',
  'email.bounced': 'failed_at',
  'email.complained': 'failed_at',
}

async function handleDeliveryEvent(db: Db, event: ResendEvent, messageId: string, ctx: Ctx): Promise<void> {
  const newStatus = DELIVERY_MAP[event.type]
  if (!newStatus) return

  // Record the event's timestamp, first-write-wins (idempotent on retry),
  // whether or not the status moves.
  const tsField = TIMESTAMP_FIELD[event.type]
  if (tsField) {
    const ts = event.created_at ?? new Date().toISOString()
    const tsUpdate: RecipientUpdate = { [tsField]: ts }
    const { error } = await db
      .from('communication_recipients')
      .update(tsUpdate)
      .eq('external_id', messageId)
      .eq('channel', 'email')
      .is(tsField, null)
    checkWrite({ error }, 'webhooks.resend.timestamp', ctx)
  }

  // Move the status forward only (never backwards).
  const { error } = await db
    .from('communication_recipients')
    .update({ delivery_status: newStatus })
    .eq('external_id', messageId)
    .eq('channel', 'email')
    .in('delivery_status', MAY_OVERWRITE[newStatus])
  checkWrite({ error }, 'webhooks.resend.status', ctx)
}

// ─── inbound replies ─────────────────────────────────────────────────

/** The bare, lower-cased sender address, or null. Accepts `{email}` or `Name <a@b>`. */
function senderEmail(from: z.output<typeof Sender> | null | undefined): string | null {
  if (!from) return null
  const raw = typeof from === 'string' ? (from.match(/<([^<>]+)>\s*$/)?.[1] ?? from) : from.email
  const email = raw.trim().toLowerCase()
  return email && email.length <= MAX_EMAIL && email.includes('@') ? email : null
}

/** Header values and body of the reply: from the payload when it carries them, else from Resend. */
async function inboundContent(
  inbound: NonNullable<ResendEvent['data']>,
  emailId: string | null | undefined,
  ctx: Ctx,
): Promise<{ threadIds: string[]; text: string | null; html: string | null }> {
  const fromPayload = [inbound.in_reply_to ?? null, ...(inbound.references ?? [])].flatMap(messageIdsIn)
  if (fromPayload.length > 0 || !emailId) {
    return { threadIds: fromPayload, text: inbound.text ?? null, html: inbound.html ?? null }
  }
  // The real `email.received` payload is metadata only (resend 6.x
  // ReceivedEmailEventData has no headers or body): read them from Resend.
  const got = await getReceivedEmail(emailId)
  if (!got.ok) {
    if (got.reason === 'not_found') return { threadIds: [], text: null, html: null }
    console.warn('[api:webhooks.resend] inbound fetch failed', { ...ctx, reason: got.reason })
    // Non-2xx so Svix retries once Resend (or the key) is back (RC-6).
    throw new ApiRouteError(got.reason === 'not_configured' ? 'not_configured' : 'upstream_unavailable')
  }
  const h = got.email.headers
  const threadIds = [h['in-reply-to'] ?? null, h['references'] ?? null]
    .flatMap(messageIdsIn)
    .slice(-MAX_ARRAY_ITEMS)
    .map((v) => v.slice(0, MAX_ID))
  return {
    threadIds,
    text: got.email.text?.slice(0, MAX_JSON_BYTES) ?? null,
    html: got.email.html?.slice(0, MAX_JSON_BYTES) ?? null,
  }
}

/**
 * Store an inbound reply.
 *
 * Linking. Every communication email we send carries our own Message-ID,
 * `<hoh-cr.{communication_recipients.id}@{EMAIL_FROM domain}>`
 * (lib/email/message-id.ts, set in lib/email.ts). A reply names it in
 * In-Reply-To / References, so the row id is read straight out of those
 * headers. external_id is NOT used for linking: it holds Resend's API id,
 * which delivery events key on and which never appears in a reply's
 * headers.
 *
 * Authorisation (RC-4, service-role work). The lookup runs with the service
 * role across every org, keyed on headers the sender writes, so a header
 * alone is not enough:
 *   - only ids in our exact Message-ID shape count;
 *   - only `channel = 'email'` recipients match;
 *   - the sender's address must equal the matched recipient's address.
 *     A reply from any other address is dropped (logged by ids only).
 *
 * Dedupe (RC-6). The reply's external_id is the inbound Message-ID, else
 * Resend's inbound email id, else `svix:<svix-id>` (stable across Svix
 * retries), so a retried delivery finds the row and inserts nothing. This
 * is check-then-insert: communication_replies.external_id has no unique
 * index yet, so two overlapping deliveries of one reply could both insert.
 * A 23505 from a future unique index is already treated as a duplicate.
 */
async function handleInboundReply(db: Db, event: ResendEvent, ctx: Ctx): Promise<void> {
  const data = event.data
  const inbound = data?.inbound ?? data
  if (!inbound) return

  const from = senderEmail(inbound.from)
  if (!from) {
    console.warn('[api:webhooks.resend] inbound reply not linkable', { ...ctx, hasSender: false })
    return
  }

  const content = await inboundContent(inbound, data?.email_id, ctx)
  const recipientIds = recipientIdsFromMessageIds(content.threadIds)
  if (recipientIds.length === 0) {
    console.warn('[api:webhooks.resend] inbound reply not linkable', {
      ...ctx,
      threadIdCount: content.threadIds.length,
      ourIdCount: 0,
    })
    return
  }

  const { data: rows, error: lookupError } = await db
    .from('communication_recipients')
    .select('id, communication_id, organization_id, email')
    .in('id', recipientIds)
    .eq('channel', 'email')
    .order('id')
    .limit(MAX_ARRAY_ITEMS)
  // A failed read is a retry, not a silent drop.
  checkWrite({ error: lookupError }, 'webhooks.resend.reply_lookup', ctx)

  const match = (rows ?? []).find((r) => (r.email ?? '').trim().toLowerCase() === from) ?? null

  // Not linkable (or the sender is not that recipient): drop rather than
  // create an orphan or attach it to someone else's thread — deliberately
  // ignored, 200. Ids and counts only, never sender/subject/body (RC-2).
  if (!match) {
    console.warn('[api:webhooks.resend] inbound reply without matching recipient', {
      ...ctx,
      ourIdCount: recipientIds.length,
      rowMatches: rows?.length ?? 0,
    })
    return
  }

  const orgCtx = { ...ctx, orgId: match.organization_id, recipientId: match.id }
  const externalId =
    inbound.message_id?.trim() || data?.email_id?.trim() || `svix:${ctx.deliveryId}`

  const { data: existing, error: dedupeError } = await db
    .from('communication_replies')
    .select('id')
    .eq('organization_id', match.organization_id)
    .eq('external_id', externalId)
    .limit(1)
    .maybeSingle()
  checkWrite({ error: dedupeError }, 'webhooks.resend.reply_dedupe', orgCtx)

  if (!existing) {
    const { error } = await db.from('communication_replies').insert({
      organization_id: match.organization_id,
      communication_id: match.communication_id,
      recipient_id: match.id,
      channel: 'email',
      from_email: from,
      subject: inbound.subject ?? null,
      body: content.text ?? content.html ?? '(no body)',
      external_id: externalId,
    })
    // 23505 = the same reply stored by a parallel delivery: a duplicate, acked.
    if (String(error?.code) !== '23505') checkWrite({ error }, 'webhooks.resend.reply_insert', orgCtx)
  }

  // Mark the recipient as 'replied' so the activity feed shows it. Runs on
  // a duplicate delivery too, so a retry after a failed update completes.
  const { error: tsError } = await db
    .from('communication_recipients')
    .update({ replied_at: new Date().toISOString() })
    .eq('id', match.id)
    .is('replied_at', null)
  checkWrite({ error: tsError }, 'webhooks.resend.replied_at', orgCtx)

  const { error: statusError } = await db
    .from('communication_recipients')
    .update({ delivery_status: 'replied' })
    .eq('id', match.id)
    .in('delivery_status', MAY_OVERWRITE.replied)
  checkWrite({ error: statusError }, 'webhooks.resend.replied_status', orgCtx)
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
  const expected = createHmac('sha256', secretKey).update(signedPayload).digest('base64')

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
