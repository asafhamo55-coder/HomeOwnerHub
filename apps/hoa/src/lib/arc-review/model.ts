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
  ArcReviewOutput,
  ArcRule,
  ArcSuggestedDecision,
  ArcSuggestion,
} from '@homeowner-portal/workflows/W37'

export type { ArcMissingInfo, ArcReviewOutput, ArcRule, ArcSuggestedDecision, ArcSuggestion }

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

// ─── Drafts the board can edit ───────────────────────────────────────

function list(items: string[]): string {
  return items.map((s) => `- ${s}`).join('\n')
}

/**
 * Text to start the board response (approve/deny) or the message to the
 * resident (more info) with. The board edits it before anything is sent;
 * the resident sees the final text verbatim.
 */
export function draftFor(out: ArcReviewOutput | null, decision: BoardArcDecision): string {
  if (!out || out.status !== 'answered') return ''
  if (decision === 'approved') {
    const conditions = out.suggestion?.conditions ?? []
    return conditions.length > 0 ? `Approved with these conditions:\n${list(conditions)}` : ''
  }
  if (decision === 'denied') {
    const conflicts = out.rules.filter((r) => r.status === 'possible_conflict')
    if (conflicts.length === 0) return ''
    return `The application conflicts with:\n${list(conflicts.map((r) => `${citationLabel(r)}: ${r.point}`))}`
  }
  const asks = [...out.missingInfo.map((m) => MISSING_INFO_ASK[m]), ...out.questions]
  if (asks.length === 0) return ''
  return `Before the board can decide, please send:\n${list(asks)}`
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
  }
}

/** The request's one-line summary as stored on the run (already redacted). */
export function runSummary(input: unknown): string | null {
  return str(obj(obj(input).facts).summary)
}

/** A board member may run a new review unless one is already waiting. */
export function canRunReview(review: ArcReviewView | null, arcStatus: string): boolean {
  if (arcStatus !== 'submitted' && arcStatus !== 'in_review') return false
  return review?.state !== 'pending'
}
