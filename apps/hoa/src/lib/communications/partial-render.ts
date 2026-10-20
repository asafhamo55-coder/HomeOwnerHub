/**
 * Schedule-time rendering (BL-102 A1).
 *
 * A scheduled message is delivered later by the Inngest dispatcher, which
 * has only what is stored on the communications row. The wizard's template
 * answers (`extraFields`) are not stored anywhere (no migration in Phase A),
 * so they are substituted into the subject and body at schedule time.
 *
 * Only keys the bag actually holds a value for are replaced. Everything
 * else — the ambient per-recipient fields like {{recipient_name}} — is left
 * exactly as written, for the strict render at delivery time.
 *
 * Pure: no Supabase, no clock.
 */

import { unresolvedFields } from './merge-recovery'
import { buildRecipientBag } from './merge-bag'
import type { MergeBag } from './templates'

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function renderKnownFields(source: string, bag: MergeBag): string {
  return source.replace(PLACEHOLDER_RE, (match, name: string) => {
    const value = bag[name]
    if (value === undefined || value === null || value === '') return match
    return String(value)
  })
}

export interface ScheduleRenderInput {
  subject: string
  bodyHtml: string
  bodyText?: string | null
  /** Campaign-wide answers: the template questions and server-resolved
   *  fields like the lease-cap figures. */
  fields: MergeBag
  associationName: string
}

export type ScheduleRenderResult =
  | { ok: true; subject: string; bodyHtml: string; bodyText: string | null }
  | { ok: false; missing: string[] }

/**
 * Bake the answers in, then check that what's left is only fields the
 * delivery can fill for every recipient on its own. Anything else means a
 * question was left blank — refuse, because the dispatcher would fail every
 * recipient on it.
 */
export function renderForSchedule(input: ScheduleRenderInput): ScheduleRenderResult {
  const subject = renderKnownFields(input.subject, input.fields)
  const bodyHtml = renderKnownFields(input.bodyHtml, input.fields)
  const bodyText = input.bodyText ? renderKnownFields(input.bodyText, input.fields) : null
  const known = buildRecipientBag({
    recipient: { email: null, recipient_name: null, unit_id: null },
    associationName: input.associationName,
  })
  const missing = unresolvedFields({ subject, bodyHtml, bodyText, known })
  if (missing.length > 0) return { ok: false, missing }
  return { ok: true, subject, bodyHtml, bodyText }
}

/** deadline_date → "deadline date", for the refusal message. */
export function humanizeFieldName(name: string): string {
  return name.replace(/_/g, ' ')
}
