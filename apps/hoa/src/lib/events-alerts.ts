import { createAdminClient } from '@homeowner-portal/db'
import { sendEmail, appUrl } from '@/lib/email'
import { sendSms, htmlToSmsBody } from '@/lib/sms'
import {
  resolveAudience,
  fetchBoardMembers,
  type AudienceDefinition,
  type ResolvedRecipient,
} from '@/lib/communications/audience'
import type { NotifyChannel, RecurringEvent } from '@/lib/events'

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
}

export interface SendEventAlertResult {
  sent: number
  failed: Array<{ email: string; reason: string }>
}

type Admin = ReturnType<typeof createAdminClient>

export async function sendEventAlertEmail(
  input: SendEventAlertInput,
): Promise<SendEventAlertResult> {
  const { event, organizationId } = input
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

  // 2. Resolve recipients.
  let recipients: ResolvedRecipient[]
  let summary: string
  if (associationId) {
    const resolved = await resolveAudience(admin, associationId, audienceDef)
    recipients = resolved.recipients
    summary = resolved.summary
  } else if (audienceDef.kind === 'board') {
    // No association on file, but the board lives at the org level — we can
    // still reach them directly.
    const members = await fetchBoardMembers(organizationId)
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
    }
  }

  if (recipients.length === 0) {
    return { sent: 0, failed: [] }
  }

  // 3. Build the message body.
  const { subject, html, text } = buildEventMessage(event)

  // 4. Deliver — through the communications tables when we have an
  //    association (enables portal + audit), else a direct send.
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
      })
    : await deliverDirect({ channels, recipients, subject, html, text })

  // 5. Stamp the event so the cron skips this occurrence next run — only
  //    when at least one message went out (unchanged from before).
  if (result.sent > 0) {
    await admin
      .from('hoa_recurring_events' as never)
      .update({
        last_alert_sent_at: new Date().toISOString(),
        last_alert_sent_for: event.event_date,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', event.id)
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
      audience_definition: audienceDef as never,
      audience_summary: summary,
      status: 'sending',
      source: 'cron',
      related_resource: { type: 'recurring_event', id: eventId } as never,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (commErr || !comm) {
    // Couldn't persist the audit row — still try a direct send so the
    // alert isn't silently dropped.
    return deliverDirect({ channels, recipients, subject, html, text })
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
    await admin.from('communications').update({ status: 'failed' }).eq('id', comm.id)
    return {
      sent: 0,
      failed: [
        {
          email: '-',
          reason: 'No recipient had a deliverable address on the selected channels.',
        },
      ],
    }
  }

  const { data: inserted } = await admin
    .from('communication_recipients')
    .insert(recipientRows as never)
    .select('id, channel, email, phone')

  type Row = { id: string; channel: string; email: string | null; phone: string | null }
  const rows = (inserted ?? []) as unknown as Row[]

  const portalLink = appUrl(`/communications/${comm.id}`)
  let sent = 0
  const failed: SendEventAlertResult['failed'] = []

  await Promise.all(
    rows.map(async (row) => {
      if (row.channel === 'email') {
        if (!row.email) return
        const res = await sendEmail({ to: row.email, subject, html, text })
        if (res.ok) {
          sent += 1
          await markRecipient(admin, row.id, 'sent', res.messageId)
        } else {
          failed.push({ email: row.email, reason: res.error })
          await markRecipientFailed(admin, row.id, res.error)
        }
        return
      }
      if (row.channel === 'sms') {
        if (!row.phone) return
        const body = buildSmsBody(subject, text, html, portalLink)
        const res = await sendSms({ to: row.phone, body })
        if (res.ok) {
          sent += 1
          await markRecipient(admin, row.id, 'sent', res.messageSid)
        } else {
          failed.push({ email: row.phone, reason: res.error })
          await markRecipientFailed(admin, row.id, res.error)
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

  await admin
    .from('communications')
    .update({ status: sent > 0 ? 'sent' : 'failed', sent_at: new Date().toISOString() })
    .eq('id', comm.id)

  return { sent, failed }
}

// ─── Delivery: direct (no association → no portal/audit surface) ─────

interface DeliverDirectArgs {
  channels: NotifyChannel[]
  recipients: ResolvedRecipient[]
  subject: string
  html: string
  text: string
}

async function deliverDirect(args: DeliverDirectArgs): Promise<SendEventAlertResult> {
  const { channels, recipients, subject, html, text } = args
  let sent = 0
  const failed: SendEventAlertResult['failed'] = []

  for (const r of recipients) {
    if (channels.includes('email') && r.email) {
      const res = await sendEmail({ to: r.email, subject, html, text })
      if (res.ok) sent += 1
      else failed.push({ email: r.email, reason: res.error })
    }
    if (channels.includes('sms') && r.phone) {
      const res = await sendSms({ to: r.phone, body: buildSmsBody(subject, text, html, null) })
      if (res.ok) sent += 1
      else failed.push({ email: r.phone, reason: res.error })
    }
    // 'portal' has no surface without a communications row — silently
    // unsupported on the direct path (org-wide board-only events).
  }

  return { sent, failed }
}

// ─── Recipient status writers ────────────────────────────────────────

async function markRecipient(
  admin: Admin,
  recipientId: string,
  status: 'sent',
  externalId: string | null,
): Promise<void> {
  await admin
    .from('communication_recipients')
    .update({
      delivery_status: status,
      sent_at: new Date().toISOString(),
      ...(externalId ? { external_id: externalId } : {}),
    } as never)
    .eq('id', recipientId)
}

async function markRecipientFailed(
  admin: Admin,
  recipientId: string,
  error: string,
): Promise<void> {
  await admin
    .from('communication_recipients')
    .update({
      delivery_status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: error,
    } as never)
    .eq('id', recipientId)
}

// ─── Message builders ────────────────────────────────────────────────

function buildSmsBody(
  subject: string,
  text: string,
  html: string,
  portalLink: string | null,
): string {
  const raw = text || htmlToSmsBody(html, 200)
  const truncated = raw.length >= 200
  const combined = `${subject}: ${raw}`
  if (truncated && portalLink) {
    return `${combined.slice(0, 240)}… see ${portalLink}`.slice(0, 279)
  }
  return combined.slice(0, 279)
}

function buildEventMessage(event: RecurringEvent): {
  subject: string
  html: string
  text: string
} {
  const daysUntil = daysUntilDate(event.event_date)
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

// Days until a date in YYYY-MM-DD form. Negative if past.
// Computed in UTC to match the cron's UTC schedule.
function daysUntilDate(yyyyMmDd: string): number {
  const target = new Date(`${yyyyMmDd}T00:00:00Z`)
  const today = new Date()
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  )
  const targetUtc = target.getTime()
  return Math.round((targetUtc - todayUtc) / (24 * 60 * 60 * 1000))
}

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
