// Letter history for one home: pure row building, no server imports.
//
// A violation's letters of record are its approved first notice
// (hoa_violations.approved_at) and the W3 follow-up runs filed against it
// (ai_runs.input.followUp). Titles and dates only; bodies stay on the
// violation page.

import { FOLLOW_UP_LETTER_LABELS, type FollowUpLetterKind } from '../violation-follow-up'

export type LetterStep = 'first_notice' | 'second_notice' | 'hearing_notice' | 'fine_notice' | 'decision_letter' | 'follow_up'

export const LETTER_STEP_LABELS: Record<LetterStep, string> = {
  first_notice: 'First notice',
  second_notice: FOLLOW_UP_LETTER_LABELS.second_notice,
  hearing_notice: FOLLOW_UP_LETTER_LABELS.hearing_notice,
  fine_notice: FOLLOW_UP_LETTER_LABELS.fine_notice,
  decision_letter: FOLLOW_UP_LETTER_LABELS.decision_letter,
  follow_up: 'Follow-up letter',
}

/** A follow-up run's letter kind to a step; unknown or missing kinds read as a plain follow-up. */
export function stepOfFollowUp(kind: unknown): LetterStep {
  return typeof kind === 'string' && Object.hasOwn(FOLLOW_UP_LETTER_LABELS, kind) ? (kind as FollowUpLetterKind) : 'follow_up'
}

export interface HistoryViolation {
  id: string
  description: string
  violation_type?: string | null
  notice_sent_at: string | null
  approved_at: string | null
}

export interface HistoryRun {
  id: string
  human_approved: boolean | null
  approved_at: string | null
  created_at: string
  input: unknown
}

export interface LetterHistoryRow {
  key: string
  step: LetterStep
  stepLabel: string
  /** When it was sent or approved; for an unapproved follow-up, when it was drafted. */
  date: string
  approved: boolean
  violationId: string
  title: string
  href: string
}

export const LETTER_HISTORY_SHOWN = 20

const TITLE_MAX = 60

export function violationTitle(v: Pick<HistoryViolation, 'description' | 'violation_type'>): string {
  const text = (v.description || v.violation_type || 'Violation').replace(/\s+/g, ' ').trim()
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX).trimEnd()}…` : text
}

function followUpOf(input: unknown): { violationId?: unknown; letterKind?: unknown } {
  const f = input && typeof input === 'object' ? (input as { followUp?: unknown }).followUp : null
  return f && typeof f === 'object' ? (f as { violationId?: unknown; letterKind?: unknown }) : {}
}

/** Newest first, one row per letter. Runs for violations not in `violations` are ignored (org scoping is the loader's; this is the belt). */
export function buildLetterHistory(violations: HistoryViolation[], runs: HistoryRun[]): LetterHistoryRow[] {
  const byId = new Map(violations.map((v) => [v.id, v]))
  const rows: LetterHistoryRow[] = []
  for (const v of violations) {
    const date = v.notice_sent_at ?? v.approved_at
    if (!date) continue
    rows.push({
      key: `first-${v.id}`,
      step: 'first_notice',
      stepLabel: LETTER_STEP_LABELS.first_notice,
      date,
      approved: v.approved_at !== null,
      violationId: v.id,
      title: violationTitle(v),
      href: `/violations/${v.id}#letter-first`,
    })
  }
  for (const r of runs) {
    const fu = followUpOf(r.input)
    const v = typeof fu.violationId === 'string' ? byId.get(fu.violationId) : undefined
    if (!v) continue
    const step = stepOfFollowUp(fu.letterKind)
    const approved = r.human_approved === true
    rows.push({
      key: `run-${r.id}`,
      step,
      stepLabel: LETTER_STEP_LABELS[step],
      date: approved ? (r.approved_at ?? r.created_at) : r.created_at,
      approved,
      violationId: v.id,
      title: violationTitle(v),
      href: `/violations/${v.id}#letter-${r.id}`,
    })
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))
}
