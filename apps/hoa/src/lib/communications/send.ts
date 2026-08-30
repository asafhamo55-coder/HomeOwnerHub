'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { sendEmail } from '@/lib/email'
import { buildSenderName } from '@/lib/email/sender-name'
import { sendSms, htmlToSmsBody } from '@/lib/sms'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getLeaseStats } from '@/lib/leases'
import { buildLeaseCapFields, buildLeaseCapMeterHtml } from '@/lib/community-templates/lease-cap'
import { getTemplate } from '@/lib/community-templates/registry'
import { resolveAudience, stripAudienceForPersist, type AudienceDefinition } from './audience'
import { buildRecipientBag } from './merge-bag'
import { renderTemplateStrict, type MergeBag } from './templates'

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
  'community',
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
      'board',
      'manual_emails',
      'precomputed',
    ]),
    unitIds: z.array(z.string().uuid()).optional(),
    residentIds: z.array(z.string().uuid()).optional(),
    boardUserIds: z.array(z.string().uuid()).optional(),
    emails: z.array(z.string()).optional(),
    emailNames: z.array(z.string().max(120)).optional(),
    phones: z.array(z.string().max(20)).optional(),
    recipients: z
      .array(
        z.object({
          unitId: z.string(),
          unitIds: z.array(z.string()).optional(),
          unitAddress: z.string().nullable(),
          unitNumber: z.string().nullable(),
          recipientName: z.string().nullable(),
          email: z.string().nullable(),
          phone: z.string().nullable(),
          userId: z.string().nullable(),
        }),
      )
      .optional(),
    summary: z.string().max(200).optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  templateId: z.string().uuid().optional(),
  // Merge fields the caller already resolved — e.g. the wizard's declared-
  // question answers. Merged underneath the ambient per-recipient fields
  // in deliverOne, which is the precedence that makes {{association_name}}
  // etc. survive: ambient always wins, so a question can't shadow it.
  // Value union matches MergeBag exactly (./templates.ts) so this schema's
  // inferred type and MergeBag stay structurally identical.
  extraFields: z
    .record(z.string(), z.union([z.string(), z.number(), z.null(), z.undefined()]))
    .optional(),
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
  /** Per-recipient merge values, keyed by recipient email. Lets a caller
   *  give every recipient a different body — dues reminders send each
   *  owner their own charge table through {{dues_table}}. */
  extraMergeFields: z
    .record(z.string(), z.record(z.string(), z.union([z.string(), z.number()])))
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
    .select('organization_id, name, type')
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

  // 1.5. Lease-cap-status special case. This template's occupancy meter and
  //      six text fields (leased_count, total_units, leased_pct, cap_pct,
  //      remaining_slots, waiting_phrase) come from live lease data, not a
  //      board-entered answer — they are declared as `providedFields`, not
  //      `questions`, precisely because nobody types "how many homes are
  //      leased" into a form. Resolve them here, before any row is written,
  //      so a missing cap policy (requireCap throws) fails the whole send
  //      with its message intact rather than leaving a half-sent
  //      communication behind.
  let leaseCapExtra: MergeBag = {}
  if (value.templateId) {
    const { data: templateRow } = await supabase
      .from('communication_templates')
      .select('topic_slug')
      .eq('id', value.templateId)
      .maybeSingle()
    if (templateRow?.topic_slug === 'lease-cap-status') {
      const leaseCapTemplate = getTemplate('lease-cap-status')
      if (!leaseCapTemplate) {
        return { ok: false, error: 'lease-cap-status template is not registered.' }
      }
      const stats = await getLeaseStats(assoc.id)
      const { count: waitingCount, error: waitingErr } = await supabase
        .from('lease_waiting_list')
        .select('id', { count: 'exact', head: true })
        .eq('association_id', assoc.id)
        .eq('status', 'waiting')
      if (waitingErr) {
        return { ok: false, error: `waiting list lookup: ${waitingErr.message}` }
      }
      try {
        leaseCapExtra = {
          ...buildLeaseCapFields(stats, waitingCount ?? 0),
          lease_meter_html: buildLeaseCapMeterHtml(stats, leaseCapTemplate.accentColor),
        }
      } catch (err) {
        // requireCap's "lease cap is not set" message, propagated verbatim —
        // refusing to send rather than guessing or blanking the field.
        return { ok: false, error: (err as Error).message }
      }
    }
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
    //
    // stripAudienceForPersist drops the recipient array for precomputed
    // audiences — names and emails live in communication_recipients, and
    // copying them here would scatter PII across two tables for no benefit.
    audience_definition: stripAudienceForPersist(value.audience as AudienceDefinition) as never,
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
        // Synthetic ids ('manual:…', 'board:…') aren't real unit UUIDs —
        // null them so the FK/uuid column stays valid.
        unit_id:
          !r.unitId || r.unitId.startsWith('manual:') || r.unitId.startsWith('board:')
            ? null
            : r.unitId,
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
  // From-header name only — merge fields keep the bare `associationName`, so
  // "Madison Park HOA" in the inbox doesn't leak into {{association_name}}.
  const senderName = buildSenderName(associationName, assocRow.type)
  const commId = comm.id

  // extraFields is the caller-supplied bag built from the template's
  // declared questions via buildMergeBag. Ambient recipient fields are
  // merged in per recipient, then rendering is strict — a template whose
  // fields are not all supplied must fail loudly before Resend is called.
  async function deliverOne(recipient: RecipientRow, extraFields: MergeBag): Promise<Outcome> {
    const bag = buildRecipientBag({
      extraFields,
      recipient,
      associationName,
      extraMergeFields: value.extraMergeFields,
    })

    let subject: string
    let html: string
    let text: string | undefined
    try {
      subject = renderTemplateStrict(value.subject, bag)
      html = renderTemplateStrict(value.bodyHtml, bag)
      text = value.bodyText ? renderTemplateStrict(value.bodyText, bag) : undefined
    } catch (err) {
      await markFailed(supabase, recipient.id, (err as Error).message)
      return 'failed'
    }

    if (recipient.channel === 'email') {
      if (!recipient.email) {
        await markFailed(supabase, recipient.id, 'no email address', subject)
        return 'skipped'
      }
      const result = await sendEmail({ to: recipient.email, subject, html, text, senderName })
      if (result.ok) {
        await supabase
          .from('communication_recipients')
          .update({
            delivery_status: 'sent',
            sent_at: new Date().toISOString(),
            external_id: result.messageId,
            rendered_subject: subject,
          })
          .eq('id', recipient.id)
        return 'sent'
      }
      await markFailed(supabase, recipient.id, result.error, subject)
      return 'failed'
    }

    if (recipient.channel === 'sms') {
      const phone = recipient.phone
      if (!phone) {
        await markFailed(supabase, recipient.id, 'no phone number', subject)
        return 'skipped'
      }
      // SMS body — squash to plain text and cap aggressively (one or
      // two SMS segments at most). Long-form SMS triggers US-carrier
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
            rendered_subject: subject,
          })
          .eq('id', recipient.id)
        return 'sent'
      }
      await markFailed(supabase, recipient.id, result.error, subject)
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
          rendered_subject: subject,
        })
        .eq('id', recipient.id)
      return 'sent'
    }

    // 'mail' (physical) not yet wired — skip with a clear marker.
    await markFailed(
      supabase,
      recipient.id,
      `${recipient.channel} channel not yet implemented`,
      subject,
    )
    return 'skipped'
  }

  // The wizard's declared-question answers (value.extraFields) and, for the
  // lease-cap-status template, the server-resolved occupancy fields both
  // flow in here — merged once, ahead of the per-recipient fan-out, rather
  // than re-merged inside deliverOne per recipient.
  const mergedExtraFields: MergeBag = { ...value.extraFields, ...leaseCapExtra }
  const outcomes = await Promise.all(
    recipientRows.map((r) => deliverOne(r, mergedExtraFields)),
  )
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

/**
 * `renderedSubject` is optional because there are two kinds of failure:
 * one where the merge fields resolved and the provider refused, and one
 * where rendering itself threw. Only the first has a subject to record.
 * Omitting it leaves the column NULL, which migration 0050 defines as
 * "unknown" — distinct from an empty subject.
 */
async function markFailed(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  recipientId: string,
  error: string,
  renderedSubject?: string,
): Promise<void> {
  await supabase
    .from('communication_recipients')
    .update({
      delivery_status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: error,
      ...(renderedSubject === undefined ? {} : { rendered_subject: renderedSubject }),
    })
    .eq('id', recipientId)
}
