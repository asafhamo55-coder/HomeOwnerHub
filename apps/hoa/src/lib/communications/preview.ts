/**
 * BL-102 A7: what one resident gets, rendered by the same functions the
 * send uses.
 *
 *   - email:  buildEmailPayloads (./email-payloads.ts), the exact payload
 *             handed to the guarded sendEmailBatch;
 *   - text:   renderSmsText (./sms-render.ts), shared with ./deliver.ts;
 *   - portal: the subject and body rendered with the same merge bag
 *             (buildRecipientBag), which is what ./deliver.ts stores.
 *
 * A merge field with no value would fail that recipient at send time
 * (strict render). Here it becomes a visible "[Due date]" marker and is
 * listed in `blanks`, so the board fixes it before pressing Send.
 *
 * Pure: no Supabase, no network, no clock. Nothing here logs; the preview
 * holds a resident's name and must never be written to a log.
 */

import { buildEmailPayloads } from './email-payloads'
import { buildRecipientBag, type RecipientIdentity } from './merge-bag'
import { humanizeFieldName } from './partial-render'
import { renderSmsText } from './sms-render'
import { SMS_MAX_CHARS } from './sms-body'
import { splitBilingualHtml } from './bilingual'
import { extractMergeFields, renderTemplateStrict, type MergeBag } from './templates'

/** Shown when the audience has nobody yet, or the sample is not a resident. */
export const SAMPLE_RESIDENT_NAME = 'Sample Resident'

export interface PreviewSource {
  subject: string
  /** The body exactly as the send stores it (bilingual already folded in). */
  bodyHtml: string
  bodyText?: string | null
  /** The template answers, as the send's `extraFields`. */
  extraFields?: MergeBag
  associationName: string
  senderName?: string | null
  /** The portal link a long text ends with. */
  portalLink: string
}

export interface MessagePreview {
  email: { subject: string; html: string }
  sms: { body: string; chars: number; max: number; shortened: boolean; englishOnly: boolean }
  portal: { subject: string; html: string }
  /** The Spanish section on its own, when the body has one. */
  spanish: { subject: string; html: string } | null
  /** Human names of merge fields that have no value ("due date"). */
  blanks: string[]
}

function isBlank(v: MergeBag[string]): boolean {
  return v === undefined || v === null || v === ''
}

export function blankMarker(field: string): string {
  const h = humanizeFieldName(field)
  return `[${h.charAt(0).toUpperCase()}${h.slice(1)}]`
}

export function buildPreview(recipient: RecipientIdentity, src: PreviewSource): MessagePreview {
  const bag = buildRecipientBag({ extraFields: src.extraFields, recipient, associationName: src.associationName })
  const fields = extractMergeFields(`${src.subject}\n${src.bodyHtml}\n${src.bodyText ?? ''}`)
  const missing = fields.filter((f) => isBlank(bag[f]))

  // Markers sit at the lowest precedence (extraFields), exactly where a
  // real answer would go, so the ambient fields are never shadowed.
  const extraFields: MergeBag = { ...src.extraFields }
  for (const f of missing) extraFields[f] = blankMarker(f)

  const { payloads } = buildEmailPayloads({
    recipients: [{ ...recipient, id: 'preview', email: recipient.email ?? 'preview@example.invalid' }],
    subject: src.subject,
    bodyHtml: src.bodyHtml,
    bodyText: src.bodyText,
    associationName: src.associationName,
    senderName: src.senderName,
    extraFields,
  })
  const email = payloads[0]
  // Every field now has a value, so the payload always builds; the guard is
  // for type narrowing only.
  const filledBag = buildRecipientBag({ extraFields, recipient, associationName: src.associationName })
  const subject = email?.subject ?? renderTemplateStrict(src.subject, filledBag)
  const html = email?.html ?? renderTemplateStrict(src.bodyHtml, filledBag)
  const text = src.bodyText ? renderTemplateStrict(src.bodyText, filledBag) : undefined

  const sms = renderSmsText({ subject, html, text, portalLink: src.portalLink })
  const parts = splitBilingualHtml(html)

  return {
    email: { subject, html },
    sms: { body: sms.body, chars: sms.body.length, max: SMS_MAX_CHARS, shortened: sms.shortened, englishOnly: sms.englishOnly },
    portal: { subject, html },
    spanish: parts.spanish ? { subject: parts.spanish.subject, html: parts.spanish.html } : null,
    blanks: missing.map(humanizeFieldName),
  }
}
