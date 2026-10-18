// BL-024 / BL-027 — ARC review view model. Pure: type-only imports from the
// workflow (client components import this file, and the workflow module
// pulls in the model client and the service-role DB), no Next, no `@/`.
//
// The W37 run is advisory. The board decides with the existing ARC actions
// (lib/board-review.ts respondToArcRequest / requestArcInfo); this module
// only reads runs, labels them, and drafts the text a board member can
// edit before deciding.

import type {
  ArcMissingInfo,
  ArcPhotoFinding,
  ArcReviewOutput,
  ArcRule,
  ArcSuggestedDecision,
  ArcSuggestion,
} from '@homeowner-portal/workflows/W37'

export type { ArcMissingInfo, ArcPhotoFinding, ArcReviewOutput, ArcRule, ArcSuggestedDecision, ArcSuggestion }

export const W37 = 'W37'

/** The three things the board can do from an AI review. */
export type BoardArcDecision = 'approved' | 'denied' | 'more_info'

export const SUGGESTION_LABEL: Record<ArcSuggestedDecision, string> = {
  approve: 'Approve',
  approve_with_conditions: 'Approve with conditions',
  deny: 'Deny',
  need_more_info: 'Need more info',
}

export const SUGGESTION_TONE: Record<ArcSuggestedDecision, 'success' | 'warning' | 'danger' | 'info'> = {
  approve: 'success',
  approve_with_conditions: 'success',
  deny: 'danger',
  need_more_info: 'warning',
}

export const MISSING_INFO_LABEL: Record<ArcMissingInfo, string> = {
  dimensions: 'Dimensions — height, length or size, and where on the lot it goes',
  materials: 'Materials — what it is made of (for example wood, vinyl, aluminum)',
  colors: 'Colors — the exact color or stain, ideally the maker’s name and code',
  contractor: 'Who does the work — the contractor and license, or that you’ll do it yourself',
  dates: 'When — the planned start and finish dates',
}

/** The short form the board sees in a request-for-info draft. */
const MISSING_INFO_ASK: Record<ArcMissingInfo, string> = {
  dimensions: 'the dimensions (height, length or size) and where on the lot it goes',
  materials: 'the materials',
  colors: 'the exact colors (maker and color code)',
  contractor: 'who will do the work (contractor name and license, or that you will do it yourself)',
  dates: 'the planned start and finish dates',
}

const DOC_TYPE_LABEL: Record<string, string> = {
  declaration: 'Declaration',
  ccr: 'CC&Rs',
  bylaws: 'Bylaws',
  rules: 'Rules',
  amendment: 'Amendment',
  policy: 'Policy',
  state_statute: 'Statute',
  minutes: 'Minutes',
}

/** "Rules § 4.2" — what a citation badge says. */
export function citationLabel(r: Pick<ArcRule, 'docType' | 'section'>): string {
  const doc = DOC_TYPE_LABEL[r.docType] ?? r.docType.charAt(0).toUpperCase() + r.docType.slice(1)
  if (!r.section) return doc
  return /^p\.\s?\d/.test(r.section) ? `${doc}, ${r.section}` : `${doc} § ${r.section}`
}

// ─── Agreement (what ai_runs.human_approved records) ─────────────────

/** True when the board did what the AI suggested. Null when there was no suggestion. */
export function agreesWithSuggestion(board: BoardArcDecision, ai: ArcSuggestedDecision | null): boolean | null {
  if (!ai) return null
  if (board === 'approved') return ai === 'approve' || ai === 'approve_with_conditions'
  if (board === 'denied') return ai === 'deny'
  return ai === 'need_more_info'
}

const BOARD_LABEL: Record<BoardArcDecision, string> = {
  approved: 'approved',
  denied: 'denied',
  more_info: 'asked the resident for more information',
}

/** ai_runs.human_feedback: the board's decision against the suggestion. No application text. */
export function decisionFeedback(board: BoardArcDecision, ai: ArcSuggestedDecision | null): string {
  const suggested = ai ? SUGGESTION_LABEL[ai].toLowerCase() : 'no suggestion'
  return `Board ${BOARD_LABEL[board]}. AI suggested: ${suggested}.`
}

// ─── Decision letters the board can edit (BL-079) ────────────────────

/**
 * The four letters the board can start from. Approve and approve-with-
 * conditions both decide 'approved' through respondToArcRequest; deny
 * decides 'denied'; need_more_info goes through requestArcInfo.
 */
export type ArcLetterKind = ArcSuggestedDecision
export const ARC_LETTER_KINDS: readonly ArcLetterKind[] = ['approve', 'approve_with_conditions', 'deny', 'need_more_info']

/** The board response / message limit (lib/board-review: max 4000). */
export const ARC_LETTER_MAX = 4000

export interface ArcLetterContext {
  associationName: string | null
  /** The application's one-line summary, as the resident wrote it. */
  title: string | null
}

/**
 * Same marker the inbox reply drafts use (lib/inbox/draft/blanks), so one
 * predicate blocks sending while any is left: the letter never invents a
 * reason or a condition the review did not give.
 */
const BLANK = (what: 'condition' | 'reason' | 'details') => `[[BLANK: ${what}]]`

const MAX_TITLE = 120

function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Up to `n` items of a list, with "and N more" when it was cut. */
function bullets(items: string[], n: number, mark: (i: number) => string): string {
  const shown = items.slice(0, n).map((s, i) => `${mark(i)} ${s}`)
  const rest = items.length - shown.length
  if (rest > 0) shown.push(`${mark(shown.length)} …and ${rest} more (see the governing documents).`)
  return shown.join('\n')
}

const dash = () => '-'
const numbered = (i: number) => `${i + 1}.`

function cited(rules: ArcRule[]): string[] {
  return rules.map((r) => `${citationLabel(r)}: ${r.point}`)
}

/**
 * The letter, given how many list items fit. Plain text in the shape the
 * violation letters use: greeting, a reference line, the decision in the
 * first sentence, the reasons, what happens next, a fixed footer added by
 * code (never the model), and a signature block. No date line — the portal
 * stamps the decision.
 */
function compose(out: ArcReviewOutput, kind: ArcLetterKind, ctx: ArcLetterContext, n: number): string {
  const answered = out.status === 'answered'
  const rules = answered ? out.rules : []
  const committee = 'The Architectural Review Committee'
  const body: string[] = []
  const checked = rules.length > 0 ? `We checked it against these parts of the governing documents:\n${bullets(cited(rules), n, dash)}` : null
  const changes =
    'Please build what you described in your application. If you want to change the design, size, materials, colors or location, send a new application before doing that work.'
  const permit =
    'Approval under the association’s governing documents is not a building permit. Please get any permits your city or county requires before work starts.'

  if (kind === 'approve') {
    body.push(`${committee} has reviewed your application and approves it as submitted.`)
    if (checked) body.push(checked)
    body.push(changes, permit)
  } else if (kind === 'approve_with_conditions') {
    const conditions = answered ? (out.suggestion?.conditions ?? []) : []
    body.push(`${committee} has reviewed your application and approves it, subject to the conditions below.`)
    body.push(`Conditions of approval:\n${conditions.length > 0 ? bullets(conditions, n, numbered) : `1. ${BLANK('condition')}`}`)
    body.push('These conditions are part of the approval. Work that does not meet them is not approved.')
    if (checked) body.push(checked)
    body.push(
      'Please build what you described in your application, as changed by the conditions above. If you want to change anything else, send a new application before doing that work.',
      permit,
    )
  } else if (kind === 'deny') {
    const conflicts = rules.filter((r) => r.status === 'possible_conflict')
    body.push(`${committee} has reviewed your application and cannot approve it as submitted.`)
    body.push(`The reasons are:\n${conflicts.length > 0 ? bullets(cited(conflicts), n, dash) : `- ${BLANK('reason')}`}`)
    body.push(
      'Please do not start this work. You are welcome to send a revised application that addresses the reasons above. If you think we have misread your application, reply in your portal and ask the board to reconsider.',
    )
    body.push('This decision is based only on the governing documents cited above.')
  } else {
    const asks = [...out.missingInfo.map((m) => MISSING_INFO_ASK[m]), ...(answered ? out.questions : [])]
    body.push(`${committee} has started reviewing your application but needs more information before it can decide.`)
    body.push(`Please send:\n${asks.length > 0 ? bullets(asks, n, dash) : `- ${BLANK('details')}`}`)
    body.push('You can reply and attach drawings, photos or samples in your portal. We will continue the review as soon as we have them.')
    body.push('No decision has been made on your application yet.')
  }

  const title = ctx.title?.trim() ? ` — ${shorten(ctx.title, MAX_TITLE)}` : ''
  const association = ctx.associationName?.trim()
  const signature = ['Sincerely,', '', 'Architectural Review Committee', 'On behalf of the Board of Directors', ...(association ? [association] : [])].join('\n')
  return ['Dear Homeowner,', `Re: Your architectural review application${title}`, ...body, signature].join('\n\n')
}

/**
 * A full, editable decision letter for one action, built from the review's
 * cited rules, conditions and open questions. Deterministic — no model call,
 * so nothing in it can cite a rule the review did not. Photo findings are
 * never quoted: they are low-confidence notes for the board. The board edits
 * the letter before anything is sent; the resident sees the final text
 * verbatim. Empty when there is no review.
 */
export function decisionLetter(out: ArcReviewOutput | null, kind: ArcLetterKind, ctx: ArcLetterContext): string {
  if (!out) return ''
  // Shrink the lists until the letter fits the board response limit.
  for (let n = 8; n >= 1; n--) {
    const letter = compose(out, kind, ctx, n)
    if (letter.length <= ARC_LETTER_MAX) return letter
  }
  // Pathological input (very long items): shorten each item instead.
  const clipped: ArcReviewOutput = {
    ...out,
    rules: out.rules.map((r) => ({ ...r, point: shorten(r.point, 200) })),
    questions: out.questions.map((q) => shorten(q, 200)),
    suggestion: out.suggestion ? { ...out.suggestion, conditions: out.suggestion.conditions.map((c) => shorten(c, 200)) } : null,
  }
  return compose(clipped, kind, { ...ctx, title: ctx.title ? shorten(ctx.title, 60) : null }, 1)
}

/** All four letters, for the decision dialog. */
export function decisionLetters(out: ArcReviewOutput | null, ctx: ArcLetterContext): Record<ArcLetterKind, string> {
  return {
    approve: decisionLetter(out, 'approve', ctx),
    approve_with_conditions: decisionLetter(out, 'approve_with_conditions', ctx),
    deny: decisionLetter(out, 'deny', ctx),
    need_more_info: decisionLetter(out, 'need_more_info', ctx),
  }
}

// ─── Reading runs ────────────────────────────────────────────────────

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []
}

const DECISIONS = new Set<string>(['approve', 'approve_with_conditions', 'deny', 'need_more_info'])
const STATUSES = new Set<string>(['fits', 'possible_conflict', 'unclear'])
const MISSING = new Set<string>(['dimensions', 'materials', 'colors', 'contractor', 'dates'])

function photoFindings(v: unknown): ArcPhotoFinding[] {
  return (Array.isArray(v) ? v : []).flatMap((x) => {
    const f = obj(x)
    const attachmentId = str(f.attachmentId)
    const photo = str(f.photo)
    const finding = str(f.finding)
    if (!attachmentId || !photo || !finding) return []
    // Never shown as more than medium, whatever was stored.
    const confidence: ArcPhotoFinding['confidence'] = f.confidence === 'medium' || f.confidence === 'high' ? 'medium' : 'low'
    return [{ attachmentId, photo, finding, confidence }]
  })
}

/**
 * A stored W37 output, or null when it isn't one (a failed run stores
 * `{ _error }`). Defensive: ai_runs.output is JSON from an older version
 * as easily as from this one.
 */
export function readArcReviewOutput(v: unknown): ArcReviewOutput | null {
  const o = obj(v)
  if (o.mode !== 'precheck' && o.mode !== 'review') return null
  if (o.status !== 'answered' && o.status !== 'no_rules') return null
  const rules: ArcRule[] = (Array.isArray(o.rules) ? o.rules : []).flatMap((x) => {
    const r = obj(x)
    const chunkId = str(r.chunkId)
    const documentId = str(r.documentId)
    const point = str(r.point)
    if (!chunkId || !documentId || !point) return []
    return [
      {
        chunkId,
        documentId,
        docType: str(r.docType) ?? 'document',
        section: str(r.section),
        point,
        status: STATUSES.has(r.status as string) ? (r.status as ArcRule['status']) : 'unclear',
      },
    ]
  })
  const s = obj(o.suggestion)
  const suggestion: ArcSuggestion | null = DECISIONS.has(s.decision as string)
    ? { decision: s.decision as ArcSuggestedDecision, reasoning: str(s.reasoning) ?? '', conditions: strings(s.conditions) }
    : null
  return {
    mode: o.mode,
    status: o.status,
    summary: str(o.summary) ?? '',
    confidence: o.confidence === 'HIGH' || o.confidence === 'MEDIUM' ? o.confidence : 'LOW',
    rules,
    questions: strings(o.questions),
    missingInfo: strings(o.missingInfo).filter((m): m is ArcMissingInfo => MISSING.has(m)),
    suggestion,
    warnings: strings(o.warnings),
    photoFindings: photoFindings(o.photoFindings),
    disclaimer: str(o.disclaimer) ?? '',
  }
}

export interface ArcReviewRunRow {
  id: string
  status: string
  created_at: string | null
  input: unknown
  output: unknown
  human_approved: boolean | null
  human_feedback: string | null
}

export interface ArcReviewView {
  runId: string
  /** pending = waiting on the board; decided = the board acted; failed = the AI run failed. */
  state: 'pending' | 'decided' | 'failed'
  createdAt: string | null
  output: ArcReviewOutput | null
  humanApproved: boolean | null
  humanFeedback: string | null
  arcRequestId: string | null
  precheckRunId: string | null
  /** BL-079: the attachment ids this review read (input.photos). Empty for older runs. */
  photoIds: string[]
}

export function readReviewRun(row: ArcReviewRunRow): ArcReviewView {
  const input = obj(row.input)
  const output = row.status === 'failed' ? null : readArcReviewOutput(row.output)
  return {
    runId: row.id,
    state: row.status === 'failed' || !output ? 'failed' : row.status === 'pending_human_approval' ? 'pending' : 'decided',
    createdAt: row.created_at,
    output,
    humanApproved: row.human_approved,
    humanFeedback: row.human_feedback,
    arcRequestId: str(input.arcRequestId),
    precheckRunId: str(input.precheckRunId),
    photoIds: (Array.isArray(input.photos) ? input.photos : []).flatMap((p) => {
      const id = str(obj(p).attachmentId)
      return id ? [id] : []
    }),
  }
}

/** The request's one-line summary as stored on the run (already redacted). */
export function runSummary(input: unknown): string | null {
  return str(obj(obj(input).facts).summary)
}

/**
 * A board member may run a new review unless one is already waiting — or
 * the waiting one is out of date because photos were added or removed
 * since it ran (BL-079: residents attach photos after submitting).
 */
export function canRunReview(review: ArcReviewView | null, arcStatus: string, opts: { photosChanged?: boolean } = {}): boolean {
  if (arcStatus !== 'submitted' && arcStatus !== 'in_review') return false
  return review?.state !== 'pending' || opts.photosChanged === true
}

/** True when the photos a review read differ from the ones it would read now. */
export function photosChanged(reviewed: string[], current: string[]): boolean {
  if (reviewed.length !== current.length) return true
  const set = new Set(reviewed)
  return current.some((id) => !set.has(id))
}
