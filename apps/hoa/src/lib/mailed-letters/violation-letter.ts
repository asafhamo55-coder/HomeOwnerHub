/**
 * BL-032: a violation's approved notice as plain blocks for the mailed PDF,
 * and the rule for when a violation notice may be mailed. Pure.
 *
 * A violation notice is the text the board approved in the notice wizard
 * (hoa_violations.approved_letter, the letter of record). It has no
 * approval_requests row, so it is mailed under its own violation id
 * (mailed_letters.violation_id, migration 0079). The mailed copy is that
 * exact text; nothing is added or reworded here.
 */

import type { DocBlock } from './letter-doc'

/** Statuses after which a notice is no longer sent: the case is over. */
const CLOSED_STATUSES = new Set(['resolved', 'dismissed', 'waived', 'cured'])

export interface MailableViolation {
  status: string
  approved_letter: string | null
  approved_at: string | null
  deleted_at?: string | null
}

/** Why this violation's notice cannot be mailed, or null when it can. */
export function violationMailBlock(v: MailableViolation): string | null {
  if (v.deleted_at) return 'This violation was deleted.'
  if (!v.approved_letter || v.approved_letter.trim().length === 0 || !v.approved_at) {
    return 'Only an approved notice can be mailed. This violation has no approved letter yet.'
  }
  if (CLOSED_STATUSES.has(v.status)) return 'This violation is closed, so its notice can’t be mailed.'
  return null
}

/** Paragraphs (split on blank lines) as text blocks, with a small gap between them. */
export function violationLetterBlocks(letter: string): DocBlock[] {
  const out: DocBlock[] = []
  const paragraphs = letter
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  for (const p of paragraphs) {
    if (out.length > 0) out.push({ kind: 'gap', height: 6 })
    out.push({ kind: 'text', text: p })
  }
  return out
}
