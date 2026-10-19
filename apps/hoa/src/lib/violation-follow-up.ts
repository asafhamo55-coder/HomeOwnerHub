// Follow-up letters for an EXISTING violation: a second notice, a hearing
// notice, a fine notice or the decision letter after a hearing.
//
// The violation page's "Draft follow-up letter" dialog builds a request for
// POST /api/ai/violations/draft with `violationId` and the W3 requested
// action for the letter the board picked. The route folds in what is
// recorded on the violation (CA § 5855(c)(2) commitment) and keeps
// `followUp` on the staged W3 run, so the existing approvals flow knows the
// draft belongs to that violation: approving it files the letter on the
// run, and never creates a second violation (lib/violation-drafts.ts).
//
// W3's state rules have four steps (first_notice, hearing_notice,
// impose_fine, impose_suspension). The board's four letter kinds map onto
// them; the kind itself is told to the model in the reporter notes.
//
// Pure and client-safe: zod only, no server imports.

import { z } from 'zod'

export const FOLLOW_UP_LETTER_KINDS = ['second_notice', 'hearing_notice', 'fine_notice', 'decision_letter'] as const
export type FollowUpLetterKind = (typeof FOLLOW_UP_LETTER_KINDS)[number]
export const FollowUpLetterKindSchema = z.enum(FOLLOW_UP_LETTER_KINDS)

export const FOLLOW_UP_LETTER_LABELS: Record<FollowUpLetterKind, string> = {
  second_notice: 'Second notice',
  hearing_notice: 'Hearing notice',
  fine_notice: 'Fine notice',
  decision_letter: 'Decision letter',
}

export const FOLLOW_UP_LETTER_DESCRIPTIONS: Record<FollowUpLetterKind, string> = {
  second_notice: 'A reminder that the violation is still not fixed. Proposes no fine.',
  hearing_notice: 'Tells the owner when the board will hear the violation and their right to attend.',
  fine_notice: 'Tells the owner the fine the board approved at the hearing.',
  decision_letter: 'The board’s written decision after the hearing: a fine or a suspension.',
}

/** Kinds that impose a penalty, so the state rules require a hearing first. */
export function isPenaltyLetter(kind: FollowUpLetterKind): boolean {
  return kind === 'fine_notice' || kind === 'decision_letter'
}

export type DecisionOutcome = 'fine' | 'suspension'

export type FollowUpStep = 'first_notice' | 'hearing_notice' | 'impose_fine' | 'impose_suspension'

export function stepForLetter(kind: FollowUpLetterKind, outcome: DecisionOutcome = 'fine'): FollowUpStep {
  switch (kind) {
    case 'second_notice':
      return 'first_notice'
    case 'hearing_notice':
      return 'hearing_notice'
    case 'fine_notice':
      return 'impose_fine'
    case 'decision_letter':
      return outcome === 'suspension' ? 'impose_suspension' : 'impose_fine'
  }
}

const KIND_INSTRUCTION: Record<FollowUpLetterKind, string> = {
  second_notice:
    'This is a SECOND NOTICE for a violation the owner was already notified about. Say it is a second notice, that the violation is still not cured, and repeat what the owner must do to cure it. Do not impose a fine.',
  hearing_notice:
    'This is a HEARING NOTICE for a violation the owner was already notified about. Tell the owner the board will hold a hearing on it and that they may attend and be heard. Do not say a fine has been imposed.',
  fine_notice:
    'This is a FINE NOTICE. The hearing was held and the board approved the fine. Say so and state the fine and when it is due.',
  decision_letter:
    'This is the board’s DECISION LETTER after the hearing on this violation. State the board’s decision and the penalty it imposed.',
}

export interface FollowUpViolation {
  id: string
  unitId: string
  violationType: string
  description: string
  status: string
  /** When the first notice was sent (ISO), if recorded. */
  noticeSentAt: string | null
}

export interface FollowUpChoice {
  kind: FollowUpLetterKind
  /** Decision letters only. */
  outcome?: DecisionOutcome
  /** Fine and decision letters: the board says the hearing was held. */
  hearingHeld?: boolean
  /** Fine and decision letters (fine outcome): dollars, per violation. */
  fineDollars?: number | null
  /** Hearing notices: days between this notice and the hearing. */
  hearingNoticeDays?: number | null
  /** The board's own notes for the drafter. */
  notes?: string | null
}

export interface FollowUpDraftRequest {
  unitId: string
  violationType: string
  description: string
  reporterNotes: string
  violationId: string
  letterKind: FollowUpLetterKind
  requestedAction: {
    step: FollowUpStep
    hearingHeld?: boolean
    violationCured?: boolean
    fineAmountCents?: number
    hearingNoticeDays?: number
  }
}

// Bounds of the draft route's DraftSchema.
const TYPE_MAX = 120
const DESCRIPTION_MIN = 10
const DESCRIPTION_MAX = 4000
const NOTES_MAX = 2000

export function buildFollowUpDraftRequest(v: FollowUpViolation, choice: FollowUpChoice): FollowUpDraftRequest {
  const step = stepForLetter(choice.kind, choice.outcome)
  const requestedAction: FollowUpDraftRequest['requestedAction'] = { step }
  if (isPenaltyLetter(choice.kind)) {
    requestedAction.hearingHeld = choice.hearingHeld === true
    if (step === 'impose_fine' && typeof choice.fineDollars === 'number' && Number.isFinite(choice.fineDollars) && choice.fineDollars >= 0) {
      requestedAction.fineAmountCents = Math.round(choice.fineDollars * 100)
    }
  }
  if (choice.kind === 'hearing_notice' && typeof choice.hearingNoticeDays === 'number' && Number.isInteger(choice.hearingNoticeDays)) {
    requestedAction.hearingNoticeDays = choice.hearingNoticeDays
  }
  // A cured violation is a fact the state rules check (no penalty after a cure).
  if (v.status === 'cured') requestedAction.violationCured = true

  const lines = [KIND_INSTRUCTION[choice.kind]]
  if (v.noticeSentAt) lines.push(`The first notice was sent on ${v.noticeSentAt.slice(0, 10)}.`)
  const notes = choice.notes?.trim()
  if (notes) lines.push(`Board notes: ${notes}`)

  let description = v.description.trim()
  if (description.length < DESCRIPTION_MIN) description = `Violation: ${description || v.violationType}`.padEnd(DESCRIPTION_MIN, '.')

  return {
    unitId: v.unitId,
    violationType: (v.violationType.trim() || 'general').padEnd(2, '.').slice(0, TYPE_MAX),
    description: description.slice(0, DESCRIPTION_MAX),
    reporterNotes: lines.join('\n').slice(0, NOTES_MAX),
    violationId: v.id,
    letterKind: choice.kind,
    requestedAction,
  }
}

// ─── Responses from the draft route ─────────────────────────────────

export interface FollowUpDraft {
  runId: string
  notice: string
  warnings: string[]
}

export interface StatuteRefusal {
  jurisdiction: string | null
  reasons: string[]
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []
}

/** A successful route body as a draft, or null when it carries no letter. */
export function readFollowUpDraft(body: unknown): FollowUpDraft | null {
  const b = obj(body)
  if (typeof b.runId !== 'string' || typeof b.notice !== 'string' || !b.notice.trim()) return null
  return { runId: b.runId, notice: b.notice, warnings: strings(obj(b.stateRules).warnings) }
}

/** The state-law refusal in a failed route body, or null when it is another error. */
export function readStatuteRefusal(body: unknown): StatuteRefusal | null {
  const e = obj(obj(body).error)
  if (e.reason !== 'statute_refusal') return null
  const reasons = strings(e.reasons)
  if (reasons.length === 0) return null
  return { jurisdiction: typeof e.jurisdiction === 'string' ? e.jurisdiction : null, reasons }
}

// ─── The follow-up recorded on a staged W3 run ───────────────────────

export const FollowUpRunSchema = z.object({
  violationId: z.string().uuid(),
  letterKind: FollowUpLetterKindSchema.optional(),
  /** Set by the draft route on a dialog draft (one with `letterKind`) and
   *  removed when the board selects "Save to approvals". Until then the
   *  draft is the board's private working copy: every Approvals read and
   *  the violation page's letter list skip it, and it cannot be approved.
   *  A draft the board closes without saving stays hidden for good. No
   *  migration: the flag lives in ai_runs.input, a JSON column. */
  awaitingSave: z.literal(true).optional(),
})
export type FollowUpRun = z.infer<typeof FollowUpRunSchema>

/**
 * The PostgREST path of the flag above. Reads that list drafts for the
 * board filter `.is(FOLLOW_UP_AWAITING_SAVE_PATH, null)`: new-violation
 * drafts (no followUp), saved follow-ups and follow-ups drafted before the
 * flag existed all read null, so only unsaved dialog drafts drop out.
 */
export const FOLLOW_UP_AWAITING_SAVE_PATH = 'input->followUp->>awaitingSave'

/** True when a W3 run's input is a follow-up draft the board has not saved yet. */
export function isFollowUpAwaitingSave(input: unknown): boolean {
  return obj(obj(input).followUp).awaitingSave === true
}

/** The run input with the awaiting-save flag removed (what "Save to approvals" writes). */
export function withFollowUpSaved(input: unknown): Record<string, unknown> {
  const i = obj(input)
  const { awaitingSave: _drop, ...followUp } = obj(i.followUp)
  void _drop
  return { ...i, followUp }
}

/** The follow-up a W3 run's input carries, or null for a new-violation draft. */
export function followUpOfRunInput(input: unknown): FollowUpRun | null {
  const parsed = FollowUpRunSchema.safeParse(obj(input).followUp)
  return parsed.success ? parsed.data : null
}

export function followUpLabel(run: FollowUpRun): string {
  return run.letterKind ? FOLLOW_UP_LETTER_LABELS[run.letterKind] : 'Follow-up letter'
}

export const FOLLOW_UP_NOTICE_MIN = 10
export const FOLLOW_UP_NOTICE_MAX = 20_000
