/**
 * BL-102 A8: "Email again to the homes that haven't opened" / "Text them".
 *
 * A follow-up never sends by itself. It opens the composer pre-filled —
 * subject "Reminder: …", the original English body, the non-opening homes as
 * the audience — and the board reviews it, sees the phone preview and
 * presses Send. That send is an ordinary sendCommunication: the same
 * resolver, preferences, outbound guard and audit trail. It is a NEW
 * communication, linked to the original through the existing
 * `related_resource` jsonb ({ type: 'follow_up', id }), so no migration.
 *
 * Template answers are not stored on a message (Phase B, B1), so the
 * original subject and body may still carry {{ due_date }}-style fields.
 * Values that can be read back from a delivered subject line are filled
 * in; anything left is listed so the board fills it before Send (the
 * preview shows it as a [Blank]).
 *
 * Pure. Nothing here logs.
 */

import { splitBilingualHtml } from './bilingual'
import { buildRecipientBag } from './merge-bag'
import { recoverFromRenderedSubject, unresolvedFields } from './merge-recovery'
import { humanizeFieldName, renderKnownFields } from './partial-render'
import { followUpAudience, reminderSubject, rollupByHome, type ResultRow } from './results'

export type FollowUpVia = 'email' | 'text'

export interface FollowUpSource {
  id: string
  status: string
  subject: string
  body_html: string
  body_text: string | null
  audience_definition: unknown
  recipients: Array<ResultRow & { rendered_subject?: string | null }>
}

export interface FollowUpDraft {
  originalId: string
  originalSubject: string
  via: FollowUpVia
  subject: string
  /** English body only; see `spanishDropped`. */
  bodyHtml: string
  unitIds: string[]
  ownersOnly: boolean
  /** The original had a Spanish section, which is not copied. */
  spanishDropped: boolean
  /** Fields the board still has to fill ("due date"). */
  missing: string[]
}

export function parseFollowUpVia(v: string | undefined): FollowUpVia | null {
  return v === 'email' || v === 'text' ? v : null
}

const RENDERED = new Set(['sent', 'delivered', 'opened', 'clicked', 'replied'])

export function buildFollowUpDraft(
  comm: FollowUpSource,
  opts: { associationName: string; via: FollowUpVia },
): FollowUpDraft | null {
  if (comm.status !== 'sent') return null
  const audience = followUpAudience(comm.audience_definition, rollupByHome(comm.recipients))
  if (!audience) return null

  const parts = splitBilingualHtml(comm.body_html)
  const known = buildRecipientBag({
    recipient: { email: null, recipient_name: null, unit_id: null },
    associationName: opts.associationName,
  })
  const rendered =
    comm.recipients.find((r) => r.channel === 'email' && RENDERED.has(r.delivery_status) && r.rendered_subject)
      ?.rendered_subject ?? null
  const recovered = recoverFromRenderedSubject({ subjectTemplate: comm.subject, renderedSubject: rendered, known })

  const subject = renderKnownFields(comm.subject, recovered)
  const bodyHtml = renderKnownFields(parts.englishHtml, recovered)
  const missing = unresolvedFields({ subject, bodyHtml, known }).map(humanizeFieldName)

  return {
    originalId: comm.id,
    originalSubject: comm.subject,
    via: opts.via,
    subject: reminderSubject(subject),
    bodyHtml,
    unitIds: audience.unitIds,
    ownersOnly: audience.ownersOnly,
    spanishDropped: parts.spanish !== null,
    missing,
  }
}
