'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { sendEmailBatch, type BatchSendResult } from '@/lib/email'
import { buildSenderName } from '@/lib/email/sender-name'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { sendSms, htmlToSmsBody } from '@/lib/sms'
import { requireBoardOrAdmin } from '@/lib/auth'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getLeaseStats } from '@/lib/leases'
import { loadEmailConsent } from '@/lib/email-consent'
import { buildLeaseCapFields, buildLeaseCapMeterHtml } from '@/lib/community-templates/lease-cap'
import { getTemplate } from '@/lib/community-templates/registry'
import { resolveAudience, stripAudienceForPersist, type AudienceDefinition, type ResolvedRecipient } from './audience'
import { deliverableChannels, planOfficialNotice, type PaperNoticeSummary } from './official-notice'
import { buildEmailPayloads } from './email-payloads'
import { buildRecipientBag } from './merge-bag'
import { recoverFromRenderedSubject, unresolvedFields } from './merge-recovery'
import { normalizeSuppliedFields } from './supplied-fields'
import { composeSmsBody } from './sms-body'
import { composeBilingualHtml, composeBilingualSms, htmlToPlainText, splitBilingualHtml } from './bilingual'
import { extractMergeFields, renderTemplateStrict, type MergeBag } from './templates'

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
      /** BL-020: present only for an official notice to a CA association
       *  with M1 applied — who this send did not email and so needs a
       *  paper notice. Absent on every other send. */
      paperNotice?: PaperNoticeSummary
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
  /** BL-025: the board-reviewed Spanish version (W31 translation, edited
   *  in the wizard). Stored inside body_html after the English — see
   *  ./bilingual.ts. `reviewed` must be true: the wizard only sets it once
   *  the board has viewed the Spanish text, and the server refuses
   *  otherwise rather than trusting the button state alone. */
  spanish: z
    .object({
      subject: z.string().trim().min(1).max(255),
      bodyHtml: z.string().trim().min(1).max(40_000),
      reviewed: z.boolean(),
    })
    .optional(),
  /** BL-020: the board marked this an official notice (CA Civ. Code
   *  §4040). Only consenting members get it by email; see
   *  ./official-notice.ts. Ignored until M1_APPLIED, and outside CA. */
  officialNotice: z.boolean().optional(),
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
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = SendSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const value = parsed.data

  // BL-025: fold the reviewed Spanish version into the stored body.
  let bodyHtml = value.bodyHtml
  let bodyText = value.bodyText
  if (value.spanish) {
    if (!value.spanish.reviewed) {
      return { ok: false, error: 'Review the Spanish version before sending.' }
    }
    // A merge field only the Spanish uses would fail the strict render for
    // every recipient — refuse up front and name it instead.
    const englishFields = new Set(extractMergeFields(`${value.subject}\n${value.bodyHtml}`))
    const extra = extractMergeFields(`${value.spanish.subject}\n${value.spanish.bodyHtml}`).filter(
      (f) => !englishFields.has(f),
    )
    if (extra.length > 0) {
      return {
        ok: false,
        error: `The Spanish version uses merge fields the English one doesn't: ${extra.join(', ')}.`,
      }
    }
    bodyHtml = composeBilingualHtml({
      englishHtml: value.bodyHtml,
      spanishSubject: value.spanish.subject,
      spanishHtml: value.spanish.bodyHtml,
    })
    bodyText = htmlToPlainText(bodyHtml)
  }

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

  // 1.25. BL-020 official notice. Only when the board marked it one AND M1
  //       is applied — with the flag off this block never runs, so the
  //       send is exactly what it was. For a CA association, email rows go
  //       only to members whose latest consent event is a grant; everyone
  //       else is reported back as needing a paper notice. Consent that
  //       can't be read refuses the send before anything is written.
  let emailKeep: ReadonlySet<ResolvedRecipient> | null = null
  let paperNotice: PaperNoticeSummary | undefined
  if (value.officialNotice && M1_APPLIED) {
    const { data: stateRow, error: stateErr } = await supabase
      .from('associations')
      .select('state')
      .eq('id', assoc.id)
      .single()
    if (stateErr || !stateRow) {
      return { ok: false, error: 'Couldn’t check e-consent for this official notice. Nothing was sent.' }
    }
    const consent = (stateRow.state ?? '').trim().toUpperCase() === 'CA'
      ? await loadEmailConsent(supabase, assocRow.organization_id, { m1: true })
      : null
    const plan = planOfficialNotice(audience.recipients, {
      channels: value.channels,
      state: stateRow.state,
      officialNotice: true,
      m1: true,
      consent,
    })
    if (plan.applies && !plan.ok) {
      return { ok: false, error: 'Couldn’t check e-consent for this official notice. Nothing was sent.' }
    }
    if (plan.applies && plan.ok) {
      emailKeep = plan.emailKeep
      paperNotice = plan.paper
    }
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
    body_html: bodyHtml,
    body_text: bodyText ?? null,
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
    // Only channels the recipient can receive on — and, for an official
    // notice, email only with consent (emailKeep is null otherwise).
    for (const channel of deliverableChannels(r, value.channels, emailKeep)) {
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
      error: paperNotice
        ? `No one in this audience can receive this official notice on the selected channels. All ${paperNotice.count} need a paper notice.`
        : 'No recipients had a deliverable contact for the selected channels.',
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
      ...(paperNotice ? { paperNotice } : {}),
    }
  }

  // 5. Send-now: per-recipient delivery. Each recipient still resolves to a
  //    'sent' | 'failed' | 'skipped' outcome independently — a single bad
  //    address never blocks the others.
  //
  //    Email is sent as ONE batched call per 100 recipients, ahead of the
  //    fan-out below, because Resend's limit is 10 requests/second per team.
  //    This used to be a Promise.all of one request per recipient, and a
  //    real 47-recipient announcement on 2026-08-31 delivered 10 and failed
  //    37 — the burst spent the whole team's per-second budget at once.
  //    SMS still goes one at a time: different provider, different limits.
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
  // Filled by the batched pre-send below; deliverOne reads its recipient's
  // outcome out of here instead of issuing its own request.
  const emailBatchResults = new Map<string, BatchSendResult>()
  const commId = comm.id
  // Outbound safety guard (BL-004): a sandboxed org only reaches
  // OUTBOUND_ALLOWLIST recipients, even in production. Read once per send.
  const outbound = {
    orgSandbox: await fetchOrgSandbox(supabase, assocRow.organization_id),
    ref: commId,
  }

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
      html = renderTemplateStrict(bodyHtml, bag)
      text = bodyText ? renderTemplateStrict(bodyText, bag) : undefined
    } catch (err) {
      await markFailed(supabase, recipient.id, (err as Error).message)
      return 'failed'
    }

    if (recipient.channel === 'email') {
      if (!recipient.email) {
        await markFailed(supabase, recipient.id, 'no email address', subject)
        return 'skipped'
      }
      // Already sent by the batched pre-send. A missing entry means the
      // batch never saw this recipient, which only happens when rendering
      // threw — and the same throw above has already returned 'failed'.
      const result = emailBatchResults.get(recipient.id) ?? {
        ok: false as const,
        error: 'not included in the send batch',
      }
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
      // SMS body — squash to plain text, then one message of at most 279
      // characters; a longer one is shortened and links to the full
      // message in the portal (composeSmsBody, which the wizard's hint
      // describes).
      const PORTAL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.homeownerledger.com'
      const portalLink = `${PORTAL.replace(/\/$/, '')}/communications/${commId}`
      // BL-025: a bilingual body sends both languages only when both fit
      // whole in one text; otherwise English only (the portal link carries
      // the Spanish). The wizard warns the board when that will happen.
      const parts = splitBilingualHtml(html)
      const smsBody = parts.spanish
        ? composeBilingualSms({
            subject,
            englishText: htmlToPlainText(parts.englishHtml),
            spanish: { subject: parts.spanish.subject, text: htmlToPlainText(parts.spanish.html) },
            portalLink,
          }).body
        : composeSmsBody({ subject, body: text ?? htmlToSmsBody(html, 200), portalLink })
      const result = await sendSms({ to: phone, body: smsBody }, outbound)
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

  // Batched email pre-send. Rendering is repeated inside deliverOne rather
  // than threaded through: it is pure and deterministic, so the second pass
  // produces identical output, and keeping deliverOne's own render means the
  // failure path and its error message stay in one place. A recipient whose
  // render throws is simply left out of the batch here.
  const emailTargets = recipientRows.filter((r) => r.channel === 'email' && r.email)
  if (emailTargets.length > 0) {
    const { payloads, owners } = buildEmailPayloads({
      recipients: emailTargets,
      subject: value.subject,
      bodyHtml,
      bodyText,
      associationName,
      senderName,
      extraFields: mergedExtraFields,
      extraMergeFields: value.extraMergeFields,
    })
    // `failures` is ignored here on purpose: deliverOne re-renders, throws
    // identically, and records the real message against the row.
    const batchResults = await sendEmailBatch(payloads, outbound)
    batchResults.forEach((result, i) => emailBatchResults.set(owners[i], result))
  }

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
    ...(paperNotice ? { paperNotice } : {}),
  }
}

export interface ResendPreflightField {
  /** Placeholder name exactly as the template spells it, e.g. deadline_date. */
  name: string
  /** Recovered from the stored rendered subject, or '' when nothing could
   *  be reconstructed and the user has to retype it. */
  value: string
}

export type ResendPreflightResult =
  | { ok: true; failedCount: number; fields: ResendPreflightField[] }
  | { ok: false; error: string }

/** Statuses that mean the row actually reached the provider, so its
 *  `rendered_subject` holds a fully substituted subject line. 'queued' and
 *  'suppressed' never rendered; 'failed' sometimes did (markFailed records
 *  it when the provider, not the render, was the problem) but is excluded
 *  so a recovered value always comes from a subject a resident really saw. */
const RENDERED_DELIVERY_STATUSES = ['sent', 'delivered', 'opened', 'clicked', 'replied']

/**
 * Work out what `resendFailedRecipients` will not be able to render, and
 * pre-fill whatever can be reconstructed.
 *
 * The resend rebuilds each recipient's merge bag from the recipient row
 * alone, because `extraFields` — the wizard's answers — were never
 * persisted anywhere on the communication. For the yard-upkeep blast that
 * meant deadline_date, season_context and upkeep_items were simply gone,
 * and all 37 retries died at "missing merge fields: deadline_date".
 *
 * So the UI asks first. This returns the exact field list the resend cannot
 * satisfy, with `deadline_date` already filled in: it appears in the
 * subject, and `communication_recipients.rendered_subject` IS stored for the
 * 10 recipients who received the original. There is no rendered-body
 * column, so a body-only field comes back '' and has to be retyped.
 *
 * An empty `fields` array means the resend needs nothing and the caller can
 * fire it straight away — the common case, since a plain announcement uses
 * only ambient fields.
 */
export async function getResendPreflight(
  communicationId: string,
): Promise<ResendPreflightResult> {
  // Same org discipline as resendFailedRecipients below: the id is
  // browser-supplied, so every statement repeats the filter, and every
  // "not found" message is identical whether the row is missing or belongs
  // to someone else. A preflight that answered differently would turn this
  // into an existence oracle for other orgs' communications.
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: comm, error: commErr } = await supabase
    .from('communications')
    .select('id, association_id, subject, body_html, body_text')
    .eq('id', communicationId)
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (commErr) return { ok: false, error: `communication lookup: ${commErr.message}` }
  if (!comm) return { ok: false, error: 'Communication not found.' }

  const { data: assocRow } = await supabase
    .from('associations')
    .select('name, type')
    .eq('id', comm.association_id)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!assocRow) return { ok: false, error: 'Association not found.' }

  const { data: failedRows, error: recErr } = await supabase
    .from('communication_recipients')
    .select('id, email, recipient_name, unit_id')
    .eq('communication_id', comm.id)
    .eq('organization_id', org.id)
    .eq('channel', 'email')
    .eq('delivery_status', 'failed')
  if (recErr) return { ok: false, error: `recipient lookup: ${recErr.message}` }

  // Mirrors the resend's own filter and refusal, so the button never opens
  // a form for a send that would then be rejected as having no targets.
  const targets = (failedRows ?? []).filter((r) => r.email)
  if (targets.length === 0) {
    return { ok: false, error: 'No failed email recipients to resend to.' }
  }

  // Any target will do: unresolvedFields only asks which KEYS the bag
  // carries, and buildRecipientBag gives every recipient the same ambient
  // key set. Building it through buildRecipientBag rather than listing the
  // keys here is what keeps this answer honest — the resend renders against
  // that same function, so the two cannot drift apart.
  const known = buildRecipientBag({
    recipient: targets[0],
    associationName: assocRow.name,
  })

  const fields = unresolvedFields({
    subject: comm.subject,
    bodyHtml: comm.body_html,
    bodyText: comm.body_text,
    known,
  })
  if (fields.length === 0) return { ok: true, failedCount: targets.length, fields: [] }

  const { data: renderedRow } = await supabase
    .from('communication_recipients')
    .select('rendered_subject')
    .eq('communication_id', comm.id)
    .eq('organization_id', org.id)
    .eq('channel', 'email')
    .in('delivery_status', RENDERED_DELIVERY_STATUSES)
    .not('rendered_subject', 'is', null)
    .limit(1)
    .maybeSingle()

  // One row is enough: the subject template is campaign-wide, so every
  // delivered copy pins the same values for the fields it contains.
  const recovered = recoverFromRenderedSubject({
    subjectTemplate: comm.subject,
    renderedSubject: renderedRow?.rendered_subject ?? null,
    known,
  })

  return {
    ok: true,
    failedCount: targets.length,
    fields: fields.map((name) => ({ name, value: recovered[name] ?? '' })),
  }
}

export type ResendFailedResult =
  | { ok: true; sentCount: number; failedCount: number }
  | { ok: false; error: string }

/**
 * Retry delivery to only the email recipients of `communicationId` that are
 * currently sitting in `delivery_status = 'failed'`.
 *
 * Exists because of the 47-recipient announcement on 2026-08-31: Resend's
 * limit is 10 requests/second per team, the old fan-out issued one request
 * per recipient at once, and 37 came back "Too many requests". The burst is
 * fixed (sendEmailBatch), but those 37 rows stayed failed with no way to
 * retry that did not also re-mail the 10 residents who had already read it.
 * Selecting on 'failed' is what makes the retry safe to press twice: a row
 * that succeeded is no longer in the set.
 *
 * Email only. SMS is excluded because a Twilio failure is usually a carrier
 * or landline rejection that a blind retry simply re-earns, and 'portal'
 * rows have no external send to retry at all — a failed one failed at
 * render, which re-running with the same inputs reproduces exactly.
 *
 * Merge-field caveat: `extraFields` / `extraMergeFields` are send-time
 * arguments and are never persisted, so a resend rebuilds the bag from what
 * the recipient row itself carries (name, unit, association). For a body
 * that only used ambient fields — every plain announcement — the render is
 * identical and `suppliedFields` can be left empty. For one that used a
 * wizard answer, the caller runs getResendPreflight first and hands the
 * answers back here; anything still unresolved is refused up front rather
 * than thrown per recipient, because a resend must never quietly deliver a
 * body with the personalized parts blanked out. Per-recipient values (a
 * dues table) remain unrecoverable — they are not campaign-wide, so there
 * is nothing a single form could ask for.
 */
export async function resendFailedRecipients(
  communicationId: string,
  /** The wizard answers retyped on the resend form, keyed by placeholder
   *  name — see getResendPreflight. Defaults to none so the messages that
   *  need nothing keep their original one-argument call. */
  suppliedFields: Record<string, string> = {},
): Promise<ResendFailedResult> {
  // `communicationId` arrives straight from the browser, so the org gate is
  // repeated on every statement below rather than established once and
  // trusted downstream. RLS is the backstop, not the first line of defense.
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: comm, error: commErr } = await supabase
    .from('communications')
    .select('id, association_id, subject, body_html, body_text')
    .eq('id', communicationId)
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (commErr) return { ok: false, error: `communication lookup: ${commErr.message}` }
  // Deliberately the same message whether the id is unknown or belongs to
  // another org — the response must not confirm that someone else's
  // communication exists.
  if (!comm) return { ok: false, error: 'Communication not found.' }

  const { data: assocRow } = await supabase
    .from('associations')
    .select('name, type')
    .eq('id', comm.association_id)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!assocRow) return { ok: false, error: 'Association not found.' }

  const { data: failedRows, error: recErr } = await supabase
    .from('communication_recipients')
    .select('id, email, recipient_name, unit_id')
    .eq('communication_id', comm.id)
    .eq('organization_id', org.id)
    // email only — SMS and portal are out of scope (see the doc comment).
    .eq('channel', 'email')
    // 'failed' only, never 'bounced': a hard bounce means the address is
    // wrong, and re-mailing it damages the sending domain's reputation.
    .eq('delivery_status', 'failed')
  if (recErr) return { ok: false, error: `recipient lookup: ${recErr.message}` }

  // A row with no address failed for a reason a resend cannot fix; leave it
  // as it is rather than churning it through the batch to fail again.
  const targets = (failedRows ?? []).filter((r) => r.email)
  if (targets.length === 0) {
    return { ok: false, error: 'No failed email recipients to resend to.' }
  }

  // Blank answers are dropped here, not treated as values: an empty string
  // satisfies unresolvedFields (the key exists) but throws in
  // renderTemplateStrict (the value is empty), so keeping one would let a
  // half-filled form pass the check below and fail every row instead.
  const supplied = normalizeSuppliedFields(suppliedFields)

  // Campaign-wide check before anything is sent. buildEmailPayloads would
  // catch an unresolved field too, but only per recipient and only after
  // the batch call — leaving all 37 rows marked failed again with the same
  // "missing merge fields: …" they already carried. Refusing here names the
  // fields back to the form and leaves the rows untouched.
  const stillMissing = unresolvedFields({
    subject: comm.subject,
    bodyHtml: comm.body_html,
    bodyText: comm.body_text,
    // `supplied` goes in as extraFields, the lowest precedence in
    // buildRecipientBag, so a supplied value can never shadow
    // {{association_name}} or {{recipient_name}}. Same representative-row
    // reasoning as getResendPreflight.
    known: buildRecipientBag({
      extraFields: supplied,
      recipient: targets[0],
      associationName: assocRow.name,
    }),
  })
  if (stillMissing.length > 0) {
    return {
      ok: false,
      error: `Still missing ${stillMissing.join(', ')}. Fill every field in — a blank one would send with that part of the message missing.`,
    }
  }

  const { payloads, owners, failures } = buildEmailPayloads({
    recipients: targets,
    subject: comm.subject,
    bodyHtml: comm.body_html,
    bodyText: comm.body_text,
    associationName: assocRow.name,
    senderName: buildSenderName(assocRow.name, assocRow.type),
    extraFields: supplied,
  })

  const results = await sendEmailBatch(payloads, {
    orgSandbox: await fetchOrgSandbox(supabase, org.id),
    ref: comm.id,
  })

  let sentCount = 0
  let failedCount = 0

  await Promise.all([
    ...owners.map(async (recipientId, i) => {
      const result = results[i] ?? {
        ok: false as const,
        error: 'no batch result returned for this recipient',
      }
      if (!result.ok) {
        failedCount += 1
        await markFailed(supabase, recipientId, result.error, payloads[i].subject, org.id)
        return
      }
      sentCount += 1
      await supabase
        .from('communication_recipients')
        .update({
          delivery_status: 'sent',
          sent_at: new Date().toISOString(),
          external_id: result.messageId,
          rendered_subject: payloads[i].subject,
          // Clear the failure the retry just undid. sendCommunication never
          // needs this (its rows go queued → sent), but here the row already
          // carries "Too many requests" and a failed_at, and the detail page
          // renders both underneath the status badge — a 'sent' row still
          // showing a red error reads like the resend didn't work.
          error_message: null,
          failed_at: null,
        })
        .eq('id', recipientId)
        .eq('organization_id', org.id)
    }),
    // Recipients whose merge fields no longer resolve. They never reached
    // the provider, so overwrite the stale error with the render failure —
    // that, not the original rate-limit message, is why they are still red.
    ...failures.map(async ({ recipientId, error }) => {
      failedCount += 1
      await markFailed(supabase, recipientId, error, undefined, org.id)
    }),
  ])

  // Lift the parent row out of 'failed' when the retry landed. Guarded on
  // the current status so a partial resend on an already-'sent' parent
  // doesn't rewrite it; sent_at is left alone so the page keeps showing
  // when the message originally went out.
  if (sentCount > 0) {
    await supabase
      .from('communications')
      .update({ status: 'sent' })
      .eq('id', comm.id)
      .eq('organization_id', org.id)
      .eq('status', 'failed')
  }

  revalidatePath('/communications')
  revalidatePath(`/communications/${comm.id}`)
  return { ok: true, sentCount, failedCount }
}

/**
 * `renderedSubject` is optional because there are two kinds of failure:
 * one where the merge fields resolved and the provider refused, and one
 * where rendering itself threw. Only the first has a subject to record.
 * Omitting it leaves the column NULL, which migration 0050 defines as
 * "unknown" — distinct from an empty subject.
 *
 * `organizationId` is likewise optional. sendCommunication owns the rows it
 * just inserted and omits it; resendFailedRecipients passes it so that every
 * statement it issues off a client-supplied id carries the org filter, even
 * though the id came out of an already-scoped select.
 */
async function markFailed(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  recipientId: string,
  error: string,
  renderedSubject?: string,
  organizationId?: string,
): Promise<void> {
  let q = supabase
    .from('communication_recipients')
    .update({
      delivery_status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: error,
      ...(renderedSubject === undefined ? {} : { rendered_subject: renderedSubject }),
    })
    .eq('id', recipientId)
  if (organizationId) q = q.eq('organization_id', organizationId)
  await q
}
