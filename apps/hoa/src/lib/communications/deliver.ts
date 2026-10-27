/**
 * Delivery of a communication's queued recipient rows — shared by the
 * send-now path (send.ts sendCommunication) and the scheduled dispatcher
 * (./scheduled-dispatch.ts, run by the Inngest job in packages/jobs).
 *
 * Not a 'use server' file on purpose: nothing here may be callable from a
 * browser. Callers pass the database client — the signed-in board member's
 * RLS client for send-now, the service-role client for the dispatcher.
 *
 * Every send goes through the guarded senders (BL-004): `sendEmailBatch`
 * and `sendSms` apply the outbound guard, with the org's sandbox flag read
 * once per delivery via fetchOrgSandbox.
 *
 * Nothing here logs. Per-recipient outcomes are written to the row.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { OUTBOUND_BLOCKED_ERROR } from '@homeowner-portal/observability/send-status'
import { sendEmailBatch, type BatchSendResult } from '@/lib/email'
import { buildSenderName } from '@/lib/email/sender-name'
import { sendSms } from '@/lib/sms'
import { SMS_ALLOWANCE_REACHED_MESSAGE } from '@homeowner-portal/billing'
import { smsAllowanceGate } from '@/lib/sms-allowance'
import { appUrl } from '@/lib/app-origin'
import { buildEmailPayloads } from './email-payloads'
import { buildRecipientBag } from './merge-bag'
import { renderSmsText } from './sms-render'
import { isBilingual, type LanguagePreference } from './bilingual'
import { loadLanguagePreferences } from './recipient-language'
import { renderTemplateStrict, type MergeBag } from './templates'

type Db = SupabaseClient<Database>

export interface QueuedRecipientRow {
  id: string
  channel: string
  email: string | null
  phone: string | null
  recipient_name: string | null
  unit_id: string | null
  /** Lets the resident's preferred language be looked up (BL-025). */
  user_id?: string | null
}

export interface DeliverInput {
  communicationId: string
  organizationId: string
  associationName: string
  associationType: string | null
  subject: string
  bodyHtml: string
  bodyText?: string | null
  /** Campaign-wide merge fields, merged under the ambient ones. */
  extraFields: MergeBag
  /** Per-recipient fields keyed by email (dues tables). */
  extraMergeFields?: Record<string, MergeBag>
  recipients: QueuedRecipientRow[]
}

export interface DeliverCounts {
  sentCount: number
  failedCount: number
  skippedCount: number
  /** Held back by the outbound safety guard (BL-004) — not a failure. The
   *  row is marked `suppressed` (BL-044). */
  heldCount: number
}

type Outcome = 'sent' | 'failed' | 'skipped' | 'held'

/**
 * Per-recipient delivery. Each recipient resolves to 'sent' | 'failed' |
 * 'skipped' independently — a single bad address never blocks the others.
 *
 * Email is sent as ONE batched call per 100 recipients, ahead of the
 * fan-out, because Resend's limit is 10 requests/second per team. This used
 * to be a Promise.all of one request per recipient, and a real 47-recipient
 * announcement on 2026-08-31 delivered 10 and failed 37 — the burst spent
 * the whole team's per-second budget at once. SMS still goes one at a time:
 * different provider, different limits.
 */
export async function deliverToRecipients(db: Db, input: DeliverInput): Promise<DeliverCounts> {
  const { communicationId: commId, associationName, subject: subjectSource, bodyHtml, extraFields } = input
  const bodyText = input.bodyText ?? undefined
  // From-header name only — merge fields keep the bare `associationName`, so
  // "Madison Park HOA" in the inbox doesn't leak into {{association_name}}.
  const senderName = buildSenderName(associationName, input.associationType)
  // Filled by the batched pre-send below; deliverOne reads its recipient's
  // outcome out of here instead of issuing its own request.
  const emailBatchResults = new Map<string, BatchSendResult>()
  // Outbound safety guard (BL-004): a sandboxed org only reaches
  // OUTBOUND_ALLOWLIST recipients, even in production. Read once per send.
  const outbound = {
    orgSandbox: await fetchOrgSandbox(db, input.organizationId),
    ref: commId,
  }
  // BL-104 §4: the plan's monthly text allowance. null (no limit) before
  // PRICING_V2, for orgs not on the new plans, and when the read fails.
  const smsGate = input.recipients.some((r) => r.channel === 'sms')
    ? await smsAllowanceGate(db, input.organizationId)
    : null

  // Preferred languages, one batched read, and only for a bilingual body.
  const languages = isBilingual(bodyHtml)
    ? await loadLanguagePreferences(db, input.recipients.map((r) => r.user_id))
    : new Map<string, 'en' | 'es'>()
  const languageOf = (r: QueuedRecipientRow): LanguagePreference =>
    (r.user_id ? languages.get(r.user_id) : undefined) ?? null

  async function deliverOne(recipient: QueuedRecipientRow): Promise<Outcome> {
    const bag = buildRecipientBag({
      extraFields,
      recipient,
      associationName,
      extraMergeFields: input.extraMergeFields,
    })

    let subject: string
    let html: string
    let text: string | undefined
    try {
      subject = renderTemplateStrict(subjectSource, bag)
      html = renderTemplateStrict(bodyHtml, bag)
      text = bodyText ? renderTemplateStrict(bodyText, bag) : undefined
    } catch (err) {
      await markFailed(db, recipient.id, (err as Error).message)
      return 'failed'
    }

    if (recipient.channel === 'email') {
      if (!recipient.email) {
        await markFailed(db, recipient.id, 'no email address', subject)
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
        await db
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
      if (result.error === OUTBOUND_BLOCKED_ERROR) {
        await markHeld(db, recipient.id, subject)
        return 'held'
      }
      await markFailed(db, recipient.id, result.error, subject)
      return 'failed'
    }

    if (recipient.channel === 'sms') {
      const phone = recipient.phone
      if (!phone) {
        await markFailed(db, recipient.id, 'no phone number', subject)
        return 'skipped'
      }
      // Allowance used up: no text; this recipient's email and portal rows
      // still go. The row tells the board why (shown on the message page).
      if (smsGate && !smsGate.take()) {
        await markFailed(db, recipient.id, SMS_ALLOWANCE_REACHED_MESSAGE, subject)
        return 'skipped'
      }
      // SMS body — squash to plain text, then one message of at most 279
      // characters; a longer one is shortened and links to the full
      // message in the portal (composeSmsBody, which the wizard's hint
      // describes).
      const portalLink = appUrl(`/communications/${commId}`)
      // BL-025: a resident who chose a language gets just that one. Otherwise
      // a bilingual body sends both languages only when both fit whole in one text; otherwise English only (the portal link carries
      // the Spanish). The wizard warns the board when that will happen.
      // Shared with the phone preview (BL-102 A7), so the two cannot drift.
      const smsBody = renderSmsText({ subject, html, text, portalLink, language: languageOf(recipient) }).body
      const result = await sendSms({ to: phone, body: smsBody }, outbound)
      if (result.ok) {
        await db
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
      if (result.error === OUTBOUND_BLOCKED_ERROR) {
        await markHeld(db, recipient.id, subject)
        return 'held'
      }
      await markFailed(db, recipient.id, result.error, subject)
      return 'failed'
    }

    if (recipient.channel === 'portal') {
      // No external send — the portal reads from communication_recipients
      // to show unread comms to the resident.
      await db
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
    await markFailed(db, recipient.id, `${recipient.channel} channel not yet implemented`, subject)
    return 'skipped'
  }

  // Batched email pre-send. Rendering is repeated inside deliverOne rather
  // than threaded through: it is pure and deterministic, so the second pass
  // produces identical output, and keeping deliverOne's own render means the
  // failure path and its error message stay in one place. A recipient whose
  // render throws is simply left out of the batch here.
  const emailTargets = input.recipients.filter((r) => r.channel === 'email' && r.email)
  if (emailTargets.length > 0) {
    const { payloads, owners } = buildEmailPayloads({
      recipients: emailTargets.map((r) => ({ ...r, language: languageOf(r) })),
      subject: subjectSource,
      bodyHtml,
      bodyText,
      associationName,
      senderName,
      extraFields,
      extraMergeFields: input.extraMergeFields,
    })
    // `failures` is ignored here on purpose: deliverOne re-renders, throws
    // identically, and records the real message against the row.
    const batchResults = await sendEmailBatch(payloads, outbound)
    batchResults.forEach((result, i) => emailBatchResults.set(owners[i], result))
  }

  const outcomes = await Promise.all(input.recipients.map((r) => deliverOne(r)))
  const counts: DeliverCounts = { sentCount: 0, failedCount: 0, skippedCount: 0, heldCount: 0 }
  for (const o of outcomes) {
    if (o === 'sent') counts.sentCount += 1
    else if (o === 'failed') counts.failedCount += 1
    else if (o === 'held') counts.heldCount += 1
    else counts.skippedCount += 1
  }
  return counts
}

/** The guard held this recipient back (sandboxed org, or off the allowlist
 *  outside production). Recorded as `suppressed`, not `failed`: nothing is
 *  broken, and resend must not offer to retry it (BL-044).
 *
 *  `organizationId` as for markFailed: resendFailedRecipients passes it.
 *  `failed_at` is cleared because a resent row arrives here still carrying
 *  its earlier failure time (BL-109); a fresh row has none to clear. */
export async function markHeld(
  db: Db,
  recipientId: string,
  renderedSubject: string,
  organizationId?: string,
): Promise<void> {
  let q = db
    .from('communication_recipients')
    .update({
      delivery_status: 'suppressed',
      error_message: OUTBOUND_BLOCKED_ERROR,
      rendered_subject: renderedSubject,
      failed_at: null,
    })
    .eq('id', recipientId)
  if (organizationId) q = q.eq('organization_id', organizationId)
  await q
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
export async function markFailed(
  db: Db,
  recipientId: string,
  error: string,
  renderedSubject?: string,
  organizationId?: string,
): Promise<void> {
  let q = db
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
