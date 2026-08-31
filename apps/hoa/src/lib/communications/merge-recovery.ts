/**
 * Works out what a resend cannot render, and reconstructs what it can.
 *
 * `communications` persists the template, the audience and the status — but
 * NOT the wizard answers that filled the placeholders. So a resend rebuilds
 * the bag from the recipient row alone (name, unit, association) and any
 * campaign-wide field is simply gone. The 2026-08-31 yard-upkeep blast
 * needed deadline_date, season_context and upkeep_items; all 37 retries
 * died at "missing merge fields: deadline_date".
 *
 * Rather than fail, the resend flow asks for exactly the fields it cannot
 * resolve — pre-filled with anything recoverable, because
 * `communication_recipients.rendered_subject` IS stored, so a value that
 * appears in the subject survived even though the answer did not. There is
 * no rendered body column, so a body-only field cannot be recovered and has
 * to be retyped.
 *
 * Both functions are pure: no Supabase, no network, no clock.
 */

import { extractMergeFields } from './templates'
import type { MergeBag } from './templates'

export interface UnresolvedFieldsArgs {
  subject: string
  bodyHtml?: string | null
  bodyText?: string | null
  /** The bag a resend can build unaided — see buildRecipientBag. */
  known: MergeBag
}

/**
 * Placeholder names appearing anywhere in the message that `known` cannot
 * satisfy, in first-seen order. A key present but empty counts as satisfied:
 * `unit_id` is legitimately '' for association-wide recipients.
 */
export function unresolvedFields({
  subject,
  bodyHtml,
  bodyText,
  known,
}: UnresolvedFieldsArgs): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const source of [subject, bodyHtml ?? '', bodyText ?? '']) {
    for (const field of extractMergeFields(source)) {
      if (field in known) continue
      if (seen.has(field)) continue
      seen.add(field)
      out.push(field)
    }
  }
  return out
}

export interface RecoverArgs {
  subjectTemplate: string
  /** A delivered recipient's stored rendered_subject. */
  renderedSubject: string | null
  known: MergeBag
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Reverse the subject render to recover the values behind its unknown
 * placeholders.
 *
 * Known placeholders are substituted first, so in the normal case exactly
 * one unknown remains and the literal text either side pins it exactly.
 * Deliberately conservative — it returns {} rather than a guess when the
 * subject does not match, when a capture comes back empty, or when two
 * unknowns sit adjacent with nothing but whitespace between them. The form
 * these values feed is editable, so a blank field costs a moment of typing
 * while a plausible-but-wrong one goes out to residents unnoticed.
 */
export function recoverFromRenderedSubject({
  subjectTemplate,
  renderedSubject,
  known,
}: RecoverArgs): Record<string, string> {
  if (!renderedSubject) return {}

  const unknowns: string[] = []
  let pattern = ''
  let lastIndex = 0
  let sawAdjacentUnknowns = false

  PLACEHOLDER.lastIndex = 0
  for (let m = PLACEHOLDER.exec(subjectTemplate); m; m = PLACEHOLDER.exec(subjectTemplate)) {
    const literal = subjectTemplate.slice(lastIndex, m.index)
    const field = m[1]
    if (field in known) {
      pattern += escapeRegExp(literal + String(known[field] ?? ''))
    } else {
      // Only whitespace separating this unknown from the previous one means
      // the split point is arbitrary; refuse the whole subject.
      if (unknowns.length > 0 && literal.trim() === '') sawAdjacentUnknowns = true
      pattern += `${escapeRegExp(literal)}(.+?)`
      unknowns.push(field)
    }
    lastIndex = m.index + m[0].length
  }
  pattern += escapeRegExp(subjectTemplate.slice(lastIndex))

  if (unknowns.length === 0 || sawAdjacentUnknowns) return {}

  const match = new RegExp(`^${pattern}$`).exec(renderedSubject)
  if (!match) return {}

  const recovered: Record<string, string> = {}
  unknowns.forEach((field, i) => {
    const value = match[i + 1]?.trim()
    if (value) recovered[field] = value
  })
  return recovered
}
