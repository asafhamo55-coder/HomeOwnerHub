/**
 * Builds the array of email payloads handed to `sendEmailBatch`.
 *
 * Extracted from send.ts so the resend path produces byte-identical
 * payloads rather than a second copy of the same render that can drift
 * out of step with the first. It lives in its own module for the same
 * reason merge-bag.ts does: send.ts is a `'use server'` file, so every
 * export there must be an async server action and a synchronous helper
 * cannot be exported from it — nor tested if it stays an inner closure.
 *
 * Pure and synchronous: no Supabase, no network, no clock.
 */

import type { SendEmailInput } from '@/lib/email'
import { buildRecipientBag, type RecipientIdentity } from './merge-bag'
import { renderTemplateStrict, type MergeBag } from './templates'

/** A persisted `communication_recipients` row, narrowed to what a render
 *  needs plus the id that ties a batch result back to the row. */
export interface PayloadRecipient extends RecipientIdentity {
  id: string
}

export interface BuildEmailPayloadsArgs {
  /** Email-channel recipients only. Rows with a null email are dropped. */
  recipients: PayloadRecipient[]
  subject: string
  bodyHtml: string
  bodyText?: string | null
  associationName: string
  /** From-header display name. Merge fields keep the bare
   *  `associationName`, so "Madison Park HOA" in the inbox does not leak
   *  into `{{association_name}}`. */
  senderName?: string | null
  /** Campaign-wide fields — the wizard's declared-question answers. */
  extraFields?: MergeBag
  /** Per-recipient fields keyed by recipient email. */
  extraMergeFields?: Record<string, MergeBag>
}

export interface EmailPayloads {
  payloads: SendEmailInput[]
  /** `owners[i]` is the recipient row id that `payloads[i]` belongs to.
   *  `sendEmailBatch` returns its results positionally, so this array is
   *  the only thing tying a provider result back to a resident. */
  owners: string[]
  /** Recipients left out of the batch because their merge fields did not
   *  resolve. Returned rather than thrown so one unrenderable recipient
   *  cannot stop the other 46 from going out. */
  failures: { recipientId: string; error: string }[]
}

export function buildEmailPayloads({
  recipients,
  subject,
  bodyHtml,
  bodyText,
  associationName,
  senderName,
  extraFields,
  extraMergeFields,
}: BuildEmailPayloadsArgs): EmailPayloads {
  const payloads: SendEmailInput[] = []
  const owners: string[] = []
  const failures: { recipientId: string; error: string }[] = []

  for (const recipient of recipients) {
    if (!recipient.email) continue
    const bag = buildRecipientBag({
      extraFields,
      recipient,
      associationName,
      extraMergeFields,
    })
    try {
      payloads.push({
        to: recipient.email,
        subject: renderTemplateStrict(subject, bag),
        html: renderTemplateStrict(bodyHtml, bag),
        text: bodyText ? renderTemplateStrict(bodyText, bag) : undefined,
        senderName,
      })
      owners.push(recipient.id)
    } catch (err) {
      failures.push({ recipientId: recipient.id, error: (err as Error).message })
    }
  }

  return { payloads, owners, failures }
}
