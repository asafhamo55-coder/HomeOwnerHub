'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { sendEmail } from '@/lib/email'
import { sendSms, htmlToSmsBody } from '@/lib/sms'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { resolveAudience, type AudienceDefinition } from './audience'
import { renderTemplate } from './templates'

type CommInsert = Database['public']['Tables']['communications']['Insert']
type RecipientInsert = Database['public']['Tables']['communication_recipients']['Insert']

export type SendCommunicationResult =
  | {
      ok: true
      communicationId: string
      recipientCount: number
      sentCount: number
      failedCount: number
      skippedCount: number
    }
  | { ok: false; error: string }

const CATEGORY_VALUES = [
  'welcome',
  'dues',
  'meeting',
  'violation',
  'arc',
  'financial',
  'emergency',
  'announcement',
  'custom',
] as const
const CHANNEL_VALUES = ['email', 'sms', 'portal', 'mail'] as const

const SendSchema = z.object({
  category: z.enum(CATEGORY_VALUES),
  subject: z.string().min(1).max(255),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  channels: z.array(z.enum(CHANNEL_VALUES)).min(1),
  audience: z.object({
    kind: z.enum([
      'everyone',
      'owners_only',
      'tenants_only',
      'late_on_dues',
      'open_violations',
      'specific_units',
      'specific_residents',
      'manual_emails',
    ]),
    unitIds: z.array(z.string().uuid()).optional(),
    residentIds: z.array(z.string().uuid()).optional(),
    emails: z.array(z.string()).optional(),
    emailNames: z.array(z.string().max(120)).optional(),
    phones: z.array(z.string().max(20)).optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  templateId: z.string().uuid().optional(),
  scheduledFor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'scheduledFor must be ISO datetime')
    .optional(),
  threadId: z.string().uuid().optional(),
  relatedResource: z
    .object({
      type: z.string(),
      id: z.string(),
    })
    .optional(),
})

export type SendCommunicationInput = z.infer<typeof SendSchema>

/**
 * Resolve audience → create communications row → fan out to recipients →
 * call Resend (email) or just persist (portal). One server action covers
 * both "send now" and "schedule for later" — the scheduled path lands in
 * `status='scheduled'` and the cron picks it up at `scheduled_for`.
 *
 * Errors during per-recipient delivery don't fail the whole send. Each
 * recipient's `delivery_status` reflects what happened; the manager sees
 * the breakdown in /communications/[id].
 */
export async function sendCommunication(
  input: SendCommunicationInput,
): Promise<SendCommunicationResult> {
  const parsed = SendSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const value = parsed.data

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: assocRow } = await supabase
    .from('associations')
    .select('organization_id, name')
    .eq('id', assoc.id)
    .single()
  if (!assocRow) return { ok: false, error: 'Association not found.' }

  // 1. Resolve audience.
  const audience = await resolveAudience(
    supabase,
    assoc.id,
    value.audience as AudienceDefinition,
  )
  if (audience.recipients.length === 0) {
    return { ok: false, error: `Audience resolved to zero recipients (${audience.summary}).` }
  }

  // 2. Insert communications row. scheduled_for > now() ⇒ status='scheduled';
  //    otherwise 'sending' for the duration of the fan-out, flipped to
  //    'sent' / 'failed' at the end.
  const scheduledForFuture =
    value.scheduledFor && new Date(value.scheduledFor) > new Date()
  const initialStatus: CommInsert['status'] = scheduledForFuture ? 'scheduled' : 'sending'

  const commPayload: CommInsert = {
    organization_id: assocRow.organization_id,
    association_id: assoc.id,
    thread_id: value.threadId ?? null,
    template_id: value.templateId ?? null,
    category: value.category,
    subject: value.subject,
    body_html: value.bodyHtml,
    body_text: value.bodyText ?? null,
    channels: value.channels,
    // Cast to satisfy Supabase's strict `Json` type — `audience.extra` is
    // typed `Record<string, unknown>` which TS doesn't narrow to Json
    // automatically. Runtime payload is JSON-safe.
    audience_definition: value.audience as never,
    audience_summary: audience.summary,
    status: initialStatus,
    source: 'manual',
    related_resource: value.relatedResource ?? null,
    scheduled_for: value.scheduledFor ?? null,
  }
  const { data: comm, error: commErr } = await supabase
    .from('communications')
    .insert(commPayload)
    .select('id')
    .single()
  if (commErr || !comm) {
    return { ok: false, error: `communications insert: ${commErr?.message}` }
  }

  // 3. Insert one communication_recipients row per (audience × channel).
  //    Each row tracks delivery for its channel independently.
  const recipientInserts: RecipientInsert[] = []
  for (const r of audience.recipients) {
    for (const channel of value.channels) {
      // Skip channels the recipient can't receive on.
      if (channel === 'email' && !r.email) continue
      if (channel === 'sms' && !r.phone) continue
      if (channel === 'portal' && !r.userId) continue
      recipientInserts.push({
        organization_id: assocRow.organization_id,
        communication_id: comm.id,
        unit_id: r.unitId?.startsWith('manual:') ? null : r.unitId,
        user_id: r.userId,
        recipient_name: r.recipientName,
        email: r.email,
        phone: r.phone,
        channel,
        delivery_status: 'queued',
      })
    }
  }

  if (recipientInserts.length === 0) {
    // Audience had units but none on any selected channel — bail with
    // status='failed' so the manager sees it didn't deliver.
    await supabase
      .from('communications')
      .update({ status: 'failed' })
      .eq('id', comm.id)
    return {
      ok: false,
      error: 'No recipients had a deliverable contact for the selected channels.',
    }
  }

  const { data: insertedRecipients, error: recErr } = await supabase
    .from('communication_recipients')
    .insert(recipientInserts)
    .select('id, channel, email, phone, recipient_name, unit_id')
  if (recErr || !insertedRecipients) {
    await supabase
      .from('communications')
      .update({ status: 'failed' })
      .eq('id', comm.id)
    return { ok: false, error: `recipient insert: ${recErr?.message}` }
  }

  // 4. Scheduled? Stop here; the cron picks up the queued rows at
  //    scheduled_for.
  if (scheduledForFuture) {
    revalidatePath('/communications')
    return {
      ok: true,
      communicationId: comm.id,
      recipientCount: insertedRecipients.length,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
    }
  }

  // 5. Send-now: per-recipient delivery, parallelized via Promise.all
  //    so a 20-recipient blast finishes in ~500ms wall-clock (slowest
  //    single provider call) instead of N × 500ms sequential. Each
  //    recipient resolves to a 'sent' | 'failed' | 'skipped' outcome
  //    independently — a single bad address never blocks the others.
  type Outcome = 'sent' | 'failed' | 'skipped'
  type RecipientRow = {
    id: string
    channel: string
    email: string | null
    phone: string | null
    recipient_name: string | null
    unit_id: string | null
  }
  const recipientRows: RecipientRow[] = insertedRecipients as RecipientRow[]
  // Capture closed-over values OUTSIDE the async fn so TS doesn't lose
  // the prior null-narrowing across the await boundary.
  const associationName = assocRow.name
  const commId = comm.id

  async function deliverOne(recipient: RecipientRow): Promise<Outcome> {
    const bag = {
      owner_name: recipient.recipient_name ?? 'Resident',
      recipient_name: recipient.recipient_name ?? 'Resident',
      association_name: associationName,
      unit_id: recipient.unit_id ?? '',
    }
    const subject = renderTemplate(value.subject, bag).rendered
    const html = renderTemplate(value.bodyHtml, bag).rendered
    const text = value.bodyText
      ? renderTemplate(value.bodyText, bag).rendered
      : undefined

    if (recipient.channel === 'email') {
      if (!recipient.email) {
        await markFailed(supabase, recipient.id, 'no email address')
        return 'skipped'
      }
      const result = await sendEmail({ to: recipient.email, subject, html, text })
      if (result.ok) {
        await supabase
          .from('communication_recipients')
          .update({
            delivery_status: 'sent',
            sent_at: new Date().toISOString(),
            external_id: result.messageId,
          })
          .eq('id', recipient.id)
        return 'sent'
      }
      await markFailed(supabase, recipient.id, result.error)
      return 'failed'
    }

    if (recipient.channel === 'sms') {
      const phone = recipient.phone
      if (!phone) {
        await markFailed(supabase, recipient.id, 'no phone number')
        return 'skipped'
      }
      // SMS body — squash to plain text and cap aggressively (one or
      // two Twilio segments at most). Long-form SMS triggers US-carrier
      // filtering for unregistered A2P traffic. If the message is long,
      // truncate and append a "more in portal" link rather than blasting
      // 10 segments to a carrier that will drop them.
      const PORTAL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.homeownerledger.com'
      const portalLink = `${PORTAL.replace(/\/$/, '')}/communications/${commId}`
      const rawBody = text ?? htmlToSmsBody(html, 200)
      const truncated = rawBody.length >= 200
      const combined = `${subject}: ${rawBody}`
      const smsBody = truncated
        ? `${combined.slice(0, 240)}… see ${portalLink}`.slice(0, 279)
        : combined.slice(0, 279)
      const result = await sendSms({ to: phone, body: smsBody })
      if (result.ok) {
        await supabase
          .from('communication_recipients')
          .update({
            delivery_status: 'sent',
            sent_at: new Date().toISOString(),
            external_id: result.messageSid,
          })
          .eq('id', recipient.id)
        return 'sent'
      }
      await markFailed(supabase, recipient.id, result.error)
      return 'failed'
    }

    if (recipient.channel === 'portal') {
      // No external send — the portal reads from communication_recipients
      // to show unread comms to the resident.
      await supabase
        .from('communication_recipients')
        .update({
          delivery_status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', recipient.id)
      return 'sent'
    }

    // 'mail' (physical) not yet wired — skip with a clear marker.
    await markFailed(
      supabase,
      recipient.id,
      `${recipient.channel} channel not yet implemented`,
    )
    return 'skipped'
  }

  const outcomes = await Promise.all(recipientRows.map(deliverOne))
  let sentCount = 0
  let failedCount = 0
  let skippedCount = 0
  for (const o of outcomes) {
    if (o === 'sent') sentCount += 1
    else if (o === 'failed') failedCount += 1
    else skippedCount += 1
  }

  // 6. Finalize the parent row. 'failed' only when EVERY recipient failed;
  //    partial success stays 'sent' with per-recipient detail.
  const finalStatus: CommInsert['status'] = sentCount > 0 ? 'sent' : 'failed'
  await supabase
    .from('communications')
    .update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
    })
    .eq('id', comm.id)

  revalidatePath('/communications')
  revalidatePath(`/communications/${comm.id}`)
  return {
    ok: true,
    communicationId: comm.id,
    recipientCount: insertedRecipients.length,
    sentCount,
    failedCount,
    skippedCount,
  }
}

async function markFailed(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  recipientId: string,
  error: string,
): Promise<void> {
  await supabase
    .from('communication_recipients')
    .update({
      delivery_status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: error,
    })
    .eq('id', recipientId)
}
