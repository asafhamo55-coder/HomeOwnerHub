import { createAdminClient } from '@homeowner-portal/db'
import {
  fetchOrgSandbox,
  OUTBOUND_BLOCKED_ERROR,
} from '@homeowner-portal/observability/outbound-guard'
import { finalSendStatus } from '@homeowner-portal/observability/send-status'
import { logRouteFailure } from '@/lib/api/log'
import type { OutboundSendOptions } from '@/lib/email'
import { sendEmail, appUrl } from '@/lib/email'
import { buildSenderName } from '@/lib/email/sender-name'
import { sendSms, htmlToSmsBody } from '@/lib/sms'
import { SMS_MAX_CHARS, composeSmsBody } from '@/lib/communications/sms-body'
import {
  resolveAudience,
  fetchBoardMembers,
  stripAudienceForPersist,
  type AudienceDefinition,
  type ResolvedRecipient,
} from '@/lib/communications/audience'
import type { NotifyChannel, RecurringEvent } from '@/lib/events'
import { calendarDaysBetween } from '@/lib/association-time'

// Fires a recurring-event alert to the event's configured audience on its
// configured channels (email / SMS / portal — migration 0021). Called from:
//   • /api/cron/recurring-events (daily walk)
//   • lib/events.ts → sendTestAlert (manual fire from detail page)
//
// Both run with the service-role admin client: the cron has no user
// session, and resolving board/community/resident audiences reads
// profiles / auth emails that RLS hides from user-bound clients.
//
// When the event resolves to an association, the alert is routed through
// the communications tables (a communications row + communication_recipients
// rows) so the in-app *portal* channel has a surface to render and every
// send is auditable — the same plumbing the manual communications wizard
// uses. Org-wide board events with no association fall back to a direct
// email/SMS send (no portal surface without an association to attach to).

export interface SendEventAlertInput {
  event: RecurringEvent
  organizationId: string
  /**
   * The event's association day, 'YYYY-MM-DD' (BL-065), that "is today" /
   * "in N days" is counted from — the same day the cron judged the window
   * on (association-zone-index.ts), never the UTC day.
   */
  today: string
}

export interface SendEventAlertResult {
  sent: number
  failed: Array<{ email: string; reason: string }>
  /** Held back by the outbound safety guard (BL-004) — not a failure, and
   *  not in `failed`. The row is `suppressed` (BL-109). */
  held: number
}

type Admin = ReturnType<typeof createAdminClient>

export async function sendEventAlertEmail(
  input: SendEventAlertInput,
): Promise<SendEventAlertResult> {
  const { event, organizationId, today } = input
  const admin = createAdminClient()

  const channels: NotifyChannel[] =
    event.notify_channels?.length ? event.notify_channels : ['email']
  const audienceDef: AudienceDefinition =
    event.notify_audience && 'kind' in event.notify_audience
      ? event.notify_audience
      : { kind: 'board' }

  // 1. Resolve an association to scope community/resident audiences and to
  //    satisfy communications.association_id (NOT NULL). Org-wide events
  //    fall back to the org's first association.
  const associationId = await resolveAssociationId(admin, event, organizationId)

  // 1b. From-header name, resolved once and shared by both delivery paths.
  //     '' is a deliberate answer, not a failure: an org-wide board event has
  //     no community to speak for, and sendEmail reads '' as "leave
  //     EMAIL_FROM alone", so those notices keep arriving as HomeownerHub.
  const senderName = await resolveSenderName(admin, associationId)

  // 2. Resolve recipients.
  let recipients: ResolvedRecipient[]
  let summary: string
  if (associationId) {
    const resolved = await resolveAudience(admin, associationId, audienceDef)
    recipients = resolved.recipients
    summary = resolved.summary
  } else if (audienceDef.kind === 'board') {
    // No association on file, but the board lives at the org level — we can
    // still reach them directly. A hand-picked subset may include admins,
    // so pull both roles and filter; otherwise the board role only.
    const picked = audienceDef.boardUserIds
    const hasSubset = !!(picked && picked.length > 0)
    let members = await fetchBoardMembers(
      organizationId,
      hasSubset ? ['board', 'admin'] : ['board'],
    )
    if (hasSubset) {
      const allow = new Set(picked)
      members = members.filter((m) => allow.has(m.userId))
    }
    recipients = members.map((m) => ({
      unitId: `board:${m.userId}`,
      unitAddress: null,
      unitNumber: null,
      recipientName: m.fullName,
      email: m.email,
      phone: null,
      userId: m.userId,
    }))
    summary = `HOA board (${recipients.length})`
  } else {
    return {
      sent: 0,
      failed: [
        {
          email: '-',
          reason:
            'This event has no association, so a community/resident audience can’t be resolved. Pin it to an association or target the board.',
        },
      ],
      held: 0,
    }
  }

  if (recipients.length === 0) {
    return { sent: 0, failed: [], held: 0 }
  }

  // 3. Build the message body.
  const { subject, html, text } = buildEventMessage(event, today)

  // 4. Deliver — through the communications tables when we have an
  //    association (enables portal + audit), else a direct send. Both go
  //    through the outbound safety guard (BL-004) with the org's mode.
  const outbound: OutboundSendOptions = {
    orgSandbox: await fetchOrgSandbox(admin, organizationId),
    ref: event.id,
  }
  const result = associationId
    ? await deliverViaCommunications({
        admin,
        organizationId,
        associationId,
        eventId: event.id,
        channels,
        audienceDef,
        summary,
        recipients,
        subject,
        html,
        text,
        senderName,
        outbound,
      })
    : await deliverDirect({ channels, recipients, subject, html, text, senderName, outbound })

  // 5. Stamp the event so the cron skips this occurrence next run — only
  //    when at least one message went out (unchanged from before).
  if (result.sent > 0) {
    const { error: stampErr } = await admin
      .from('hoa_recurring_events' as never)
      .update({
        last_alert_sent_at: new Date().toISOString(),
        last_alert_sent_for: event.event_date,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', event.id)
    // The cron stamps again with its own check; a manual test send has no
    // other stamp, so the event page keeps showing "due". Logged, not thrown:
    // the messages already went out.
    if (stampErr) logRouteFailure('events-alerts.stamp', stampErr, { eventId: event.id, organizationId })
  }

  return result
}

// ─── Recipient resolution helpers ────────────────────────────────────

async function resolveAssociationId(
  admin: Admin,
  event: RecurringEvent,
  organizationId: string,
): Promise<string | null> {
  if (event.association_id) return event.association_id
  const { data } = await admin
    .from('associations')
    .select('id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// The community's display name for the From header ("Madison Park HOA").
// Returns '' when there is no association, or none is found under that id —
// both mean "no community to send as", which sendEmail turns back into the
// unchanged EMAIL_FROM rather than a half-built sender.
async function resolveSenderName(
  admin: Admin,
  associationId: string | null,
): Promise<string> {
  if (!associationId) return ''
  const { data } = await admin
    .from('associations')
    .select('name, type')
    .eq('id', associationId)
    .maybeSingle()
  const row = data as { name: string | null; type: string | null } | null
  return row?.name ? buildSenderName(row.name, row.type) : ''
}

// ─── Delivery: through the communications pipeline ───────────────────

interface DeliverViaCommsArgs {
  admin: Admin
  organizationId: string
  associationId: string
  eventId: string
  channels: NotifyChannel[]
  audienceDef: AudienceDefinition
  summary: string
  recipients: ResolvedRecipient[]
  subject: string
  html: string
  text: string
  senderName: string
  outbound: OutboundSendOptions
}

async function deliverViaCommunications(
  args: DeliverViaCommsArgs,
): Promise<SendEventAlertResult> {
  const {
    admin,
    organizationId,
    associationId,
    eventId,
    channels,
    audienceDef,
    summary,
    recipients,
    subject,
    html,
    text,
    senderName,
    outbound,
  } = args

  // Audit row. source='cron' is the closest allowed enum value for an
  // automated, event-driven send (migration 0018 CHECK).
  const { data: comm, error: commErr } = await admin
    .from('communications')
    .insert({
      organization_id: organizationId,
      association_id: associationId,
      category: 'meeting',
      subject,
      body_html: html,
      body_text: text,
      channels,
      // stripAudienceForPersist drops the recipient array for a
      // 'precomputed' audience before it hits the jsonb column (the same
      // helper send.ts uses) — unreachable today since audienceDef here is
      // always 'board' or a resolveAudience() kind, never 'precomputed',
      // but the privacy guarantee belongs to the column, not to each
      // writer having to remember it. Every other kind passes through
      // unchanged.
      audience_definition: stripAudienceForPersist(audienceDef) as never,
      audience_summary: summary,
      status: 'sending',
      source: 'cron',
      related_resource: { type: 'recurring_event', id: eventId } as never,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (commErr || !comm) {
    // Couldn't persist the audit row — still try a direct send so the
    // alert isn't silently dropped. Code and ids only (RC-2).
    logRouteFailure('events-alerts.communication_insert', commErr, { eventId, organizationId })
    return deliverDirect({ channels, recipients, subject, html, text, senderName, outbound })
  }

  // One recipient row per (person × channel) the person can receive on.
  const recipientRows = recipients.flatMap((r) =>
    channels
      .filter((channel) => {
        if (channel === 'email') return !!r.email
        if (channel === 'sms') return !!r.phone
        if (channel === 'portal') return !!r.userId
        return false
      })
      .map((channel) => ({
        organization_id: organizationId,
        communication_id: comm.id,
        unit_id: isSyntheticUnit(r.unitId) ? null : r.unitId,
        user_id: r.userId,
        recipient_name: r.recipientName,
        email: r.email,
        phone: r.phone,
        channel,
        delivery_status: 'queued',
      })),
  )

  if (recipientRows.length === 0) {
    await setCommunicationStatus(admin, comm.id, { status: 'failed' }, eventId)
    return {
      sent: 0,
      failed: [
        {
          email: '-',
          reason: 'No recipient had a deliverable address on the selected channels.',
        },
      ],
      held: 0,
    }
  }

  const { data: inserted, error: insertErr } = await admin
    .from('communication_recipients')
    .insert(recipientRows as never)
    .select('id, channel, email, phone')

  if (insertErr) {
    // Without recipient rows there is nothing to deliver against or audit.
    // Mark the audit row failed (it is not "sending" forever) and fall back
    // to a direct send, as for a failed communications insert above.
    logRouteFailure('events-alerts.recipients_insert', insertErr, {
      eventId,
      communicationId: comm.id,
      count: recipientRows.length,
    })
    await setCommunicationStatus(admin, comm.id, { status: 'failed' }, eventId)
    return deliverDirect({ channels, recipients, subject, html, text, senderName, outbound })
  }

  type Row = { id: string; channel: string; email: string | null; phone: string | null }
  const rows = (inserted ?? []) as unknown as Row[]

  const portalLink = appUrl(`/communications/${comm.id}`)
  let sent = 0
  let held = 0
  const failed: SendEventAlertResult['failed'] = []

  await Promise.all(
    rows.map(async (row) => {
      if (row.channel === 'email') {
        if (!row.email) return
        // recipientRef: our Message-ID names this row, so a reply links back to it.
        const res = await sendEmail({ to: row.email, subject, html, text, senderName, recipientRef: row.id }, outbound)
        if (res.ok) {
          sent += 1
          await markRecipient(admin, row.id, 'sent', res.messageId)
        } else if (res.error === OUTBOUND_BLOCKED_ERROR) {
          held += 1
          await markRecipientHeld(admin, row.id)
        } else {
          const code = deliveryErrorCode('email', res.error)
          failed.push({ email: row.email, reason: code })
          await markRecipientFailed(admin, row.id, code)
        }
        return
      }
      if (row.channel === 'sms') {
        if (!row.phone) return
        const body = buildSmsBody(subject, text, html, portalLink)
        const res = await sendSms({ to: row.phone, body }, outbound)
        if (res.ok) {
          sent += 1
          await markRecipient(admin, row.id, 'sent', res.messageSid)
        } else if (res.error === OUTBOUND_BLOCKED_ERROR) {
          held += 1
          await markRecipientHeld(admin, row.id)
        } else {
          const code = deliveryErrorCode('sms', res.error)
          failed.push({ email: row.phone, reason: code })
          await markRecipientFailed(admin, row.id, code)
        }
        return
      }
      if (row.channel === 'portal') {
        // No external send — the resident portal reads communication_recipients.
        sent += 1
        await markRecipient(admin, row.id, 'sent', null)
      }
    }),
  )

  // All held by the guard → `cancelled` ("Held by safety guard (N)") with
  // no sent_at; any delivery → `sent`; a real failure with nothing
  // delivered stays `failed` (finalSendStatus, BL-109).
  const status = finalSendStatus({ sent, failed: failed.length, held })
  await setCommunicationStatus(
    admin,
    comm.id,
    status === 'cancelled' ? { status } : { status, sent_at: new Date().toISOString() },
    eventId,
  )

  return { sent, failed, held }
}

// ─── Delivery: direct (no association → no portal/audit surface) ─────

interface DeliverDirectArgs {
  channels: NotifyChannel[]
  recipients: ResolvedRecipient[]
  subject: string
  html: string
  text: string
  senderName: string
  outbound: OutboundSendOptions
}

async function deliverDirect(args: DeliverDirectArgs): Promise<SendEventAlertResult> {
  const { channels, recipients, subject, html, text, senderName, outbound } = args
  let sent = 0
  let held = 0
  const failed: SendEventAlertResult['failed'] = []

  for (const r of recipients) {
    if (channels.includes('email') && r.email) {
      const res = await sendEmail({ to: r.email, subject, html, text, senderName }, outbound)
      if (res.ok) sent += 1
      else if (res.error === OUTBOUND_BLOCKED_ERROR) held += 1
      else failed.push({ email: r.email, reason: deliveryErrorCode('email', res.error) })
    }
    if (channels.includes('sms') && r.phone) {
      const res = await sendSms({ to: r.phone, body: buildSmsBody(subject, text, html, null) }, outbound)
      if (res.ok) sent += 1
      else if (res.error === OUTBOUND_BLOCKED_ERROR) held += 1
      else failed.push({ email: r.phone, reason: deliveryErrorCode('sms', res.error) })
    }
    // 'portal' has no surface without a communications row — silently
    // unsupported on the direct path (org-wide board-only events).
  }

  return { sent, failed, held }
}

// ─── Recipient status writers ────────────────────────────────────────

// Status writes are logged (code + ids, RC-2), not thrown: the send they
// describe has already happened, and one failed bookkeeping write must not
// abandon the remaining recipients.

async function markRecipient(
  admin: Admin,
  recipientId: string,
  status: 'sent',
  externalId: string | null,
): Promise<void> {
  const { error } = await admin
    .from('communication_recipients')
    .update({
      delivery_status: status,
      sent_at: new Date().toISOString(),
      ...(externalId ? { external_id: externalId } : {}),
    } as never)
    .eq('id', recipientId)
  if (error) logRouteFailure('events-alerts.mark_recipient_sent', error, { recipientId })
}

async function markRecipientFailed(
  admin: Admin,
  recipientId: string,
  errorCode: string,
): Promise<void> {
  const { error } = await admin
    .from('communication_recipients')
    .update({
      delivery_status: 'failed',
      failed_at: new Date().toISOString(),
      // A short code (deliveryErrorCode), never provider text: the board
      // reads this column on the communication page, and provider text can
      // carry the recipient's address.
      error_message: errorCode,
    } as never)
    .eq('id', recipientId)
  if (error) logRouteFailure('events-alerts.mark_recipient_failed', error, { recipientId })
}

/** The guard held this recipient back: `suppressed` with the guard's own
 *  message (no address in it), which the communications screens read as
 *  "Held by safety guard" (isHeldRecipient). Not a failure (BL-109). */
async function markRecipientHeld(admin: Admin, recipientId: string): Promise<void> {
  const { error } = await admin
    .from('communication_recipients')
    .update({ delivery_status: 'suppressed', error_message: OUTBOUND_BLOCKED_ERROR } as never)
    .eq('id', recipientId)
  if (error) logRouteFailure('events-alerts.mark_recipient_held', error, { recipientId })
}

async function setCommunicationStatus(
  admin: Admin,
  communicationId: string,
  patch: { status: 'sent' | 'failed' | 'cancelled'; sent_at?: string },
  eventId: string,
): Promise<void> {
  const { error } = await admin.from('communications').update(patch).eq('id', communicationId)
  if (error) logRouteFailure('events-alerts.communication_status', error, { communicationId, eventId })
}

/**
 * The short code stored for a failed delivery, in place of the provider's
 * text. Provider text (Resend, Vonage) can name the recipient's address.
 */
export function deliveryErrorCode(channel: 'email' | 'sms', providerError: string): string {
  if (providerError === OUTBOUND_BLOCKED_ERROR) return 'outbound_blocked'
  if (/not configured/i.test(providerError)) return `${channel}_not_configured`
  return `${channel}_provider_error`
}

// ─── Retry cap support (used by /api/cron/recurring-events) ─────────

/** notifications.kind for "this event's reminder was given up on". */
export const ALERT_FAILED_NOTIFICATION_KIND = 'event_alert.failed'

/**
 * How many alert attempts for this event's current occurrence ended with
 * nothing delivered: its `communications` rows (related_resource marks the
 * event) with status 'failed' — or 'cancelled', a day the outbound guard
 * held every recipient (BL-109: not a failure on screen, but still a day
 * nothing went out, so the cap is unchanged; these rows are never
 * board-cancelled, since alerts are never scheduled) — created on or after the day the occurrence's
 * alert window opened. Each daily retry that reaches the communications
 * pipeline writes exactly one such row, and a delivered attempt stamps the
 * occurrence and ends the retries, so this is the count of failed days.
 * No migration needed: it reads existing columns only.
 */
export async function countFailedAlertAttempts(
  admin: Admin,
  /** `sinceAt`: the instant the occurrence's window opened — midnight of
   *  its open day in the association's zone (BL-065), not UTC midnight. */
  args: { eventId: string; organizationId: string; sinceAt: string },
): Promise<{ ok: true; count: number } | { ok: false; error: unknown }> {
  const { count, error } = await admin
    .from('communications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', args.organizationId)
    .eq('related_resource->>type', 'recurring_event')
    .eq('related_resource->>id', args.eventId)
    .in('status', ['failed', 'cancelled'])
    .gte('created_at', args.sinceAt)
  if (error) return { ok: false, error }
  return { ok: true, count: count ?? 0 }
}

/**
 * Tell the board (bell notifications, every board member and admin) that
 * this occurrence's reminder was given up on. Once per occurrence: a member
 * already notified on or after `sinceAt` is skipped; one notified for an
 * earlier occurrence has that row re-surfaced as unread, because the
 * (user_id, kind, entity_id) unique index allows one row per event. That
 * index is partial, so PostgREST cannot upsert against it — read first,
 * and treat a concurrent 23505 as the end state we wanted.
 */
export async function notifyBoardAlertGaveUp(
  admin: Admin,
  args: { event: RecurringEvent; organizationId: string; attempts: number; sinceAt: string },
): Promise<{ ok: true; notified: number } | { ok: false; error: unknown }> {
  const { event, organizationId, attempts, sinceAt } = args

  const { data: members, error: membersErr } = await admin
    .from('org_members')
    .select('user_id')
    .eq('org_id', organizationId)
    .in('role', ['board', 'admin'])
  if (membersErr) return { ok: false, error: membersErr }
  const userIds = [
    ...new Set(
      ((members ?? []) as Array<{ user_id: string | null }>)
        .map((m) => m.user_id)
        .filter((id): id is string => !!id),
    ),
  ]
  if (userIds.length === 0) return { ok: true, notified: 0 }

  const { data: existing, error: existingErr } = await admin
    .from('notifications' as never)
    .select('id, user_id, created_at')
    .eq('kind', ALERT_FAILED_NOTIFICATION_KIND)
    .eq('entity_id', event.id)
    .in('user_id', userIds)
  if (existingErr) return { ok: false, error: existingErr }

  const sinceMs = Date.parse(sinceAt)
  const byUser = new Map(
    ((existing ?? []) as Array<{ id: string; user_id: string; created_at: string }>).map((r) => [r.user_id, r]),
  )
  const content = {
    title: `Reminder for “${event.title}” couldn’t be delivered`,
    body: `We tried on ${attempts} days and nothing went out, so we stopped retrying. Check this event’s audience and channels, then send a test alert.`,
    link: `/events/${event.id}`,
  }

  let notified = 0
  const fresh: string[] = []
  for (const userId of userIds) {
    const prior = byUser.get(userId)
    if (!prior) {
      fresh.push(userId)
      continue
    }
    if (Date.parse(prior.created_at) >= sinceMs) continue // this occurrence: already told
    const { error } = await admin
      .from('notifications' as never)
      .update({ ...content, read_at: null, created_at: new Date().toISOString() } as never)
      .eq('id', prior.id)
    if (error) return { ok: false, error }
    notified += 1
  }

  if (fresh.length > 0) {
    const { error } = await admin.from('notifications' as never).insert(
      fresh.map((userId) => ({
        organization_id: organizationId,
        user_id: userId,
        kind: ALERT_FAILED_NOTIFICATION_KIND,
        ...content,
        entity_type: 'recurring_event',
        entity_id: event.id,
      })) as never,
    )
    if (error && (error as { code?: string }).code !== '23505') return { ok: false, error }
    notified += fresh.length
  }

  return { ok: true, notified }
}

// ─── Message builders ────────────────────────────────────────────────

function buildSmsBody(
  subject: string,
  text: string,
  html: string,
  portalLink: string | null,
): string {
  const raw = text || htmlToSmsBody(html, 200)
  // The same one-message rule as announcements (BL-072): shortened with a
  // whole portal link, never a link cut off at character 279.
  if (portalLink) return composeSmsBody({ subject, body: raw, portalLink })
  return `${subject}: ${raw}`.slice(0, SMS_MAX_CHARS)
}

function buildEventMessage(event: RecurringEvent, today: string): {
  subject: string
  html: string
  text: string
} {
  const daysUntil = calendarDaysBetween(today, event.event_date)
  const subject =
    daysUntil <= 0
      ? `Reminder: ${event.title} is today`
      : `Reminder: ${event.title} is in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`

  const dateLabel = formatEventDate(event.event_date)
  const link = appUrl(`/events/${event.id}`)
  const descriptionBlock = event.description
    ? `<p style="margin:12px 0;color:#444;white-space:pre-wrap;">${escapeHtml(event.description)}</p>`
    : ''
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 8px 0;font-size:20px;">${escapeHtml(event.title)}</h2>
  <p style="margin:0 0 16px 0;color:#555;">
    ${escapeHtml(dateLabel)} ·
    ${daysUntil <= 0 ? 'today' : `${daysUntil} day${daysUntil === 1 ? '' : 's'} away`}
  </p>
  ${descriptionBlock}
  <p style="margin:20px 0;">
    <a href="${link}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">
      Open in HomeownerHub
    </a>
  </p>
  <p style="margin-top:24px;font-size:12px;color:#888;">
    You're receiving this reminder from your HOA.
    ${event.recurrence === 'annual' ? 'It repeats annually.' : ''}
  </p>
</div>`.trim()

  const text = [
    event.title,
    `${dateLabel} — ${daysUntil <= 0 ? 'today' : `${daysUntil} days away`}`,
    event.description ? `\n${event.description}\n` : '',
    `Open: ${link}`,
  ]
    .filter(Boolean)
    .join('\n')

  return { subject, html, text }
}

function isSyntheticUnit(unitId: string | null): boolean {
  return !unitId || unitId.startsWith('manual:') || unitId.startsWith('board:')
}

// ─── Date helpers ────────────────────────────────────────────────────

function formatEventDate(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
