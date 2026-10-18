// BL-027 — record the board's ARC decision on the W37 review run(s).
//
// The decision itself is made by the existing ARC actions (lib/board-review
// respondToArcRequest / requestArcInfo). After it lands, the pending W37
// draft for that application is closed the way other workflows close
// theirs: status 'completed' (ai_runs.status allows only
// completed|failed|pending_human_approval, 0004), human_approved = whether
// the board did what the AI suggested, human_feedback = the decision
// against the suggestion. No application text is written or logged.
//
// Pure: takes the caller's client (the board member's RLS client — ai_runs
// is board/admin-only by 0036 — or the service role for a resident's
// withdrawal). Relative imports only.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { W37, agreesWithSuggestion, decisionFeedback, readArcReviewOutput, type BoardArcDecision } from './model'

export type ArcReviewDb = SupabaseClient<Database>

const PENDING = 'pending_human_approval'

function logFailure(stage: string, arcId: string, code: string | undefined): void {
  // Ids and codes only — never the application, the draft or the response.
  console.error('arc review record failed', { stage, arcId, code: code ?? 'unknown' })
}

/**
 * Close every pending W37 draft for `arcId` with the board's decision.
 * Returns how many were closed; never throws (the ARC decision already
 * stands — a failure here costs the metric, not the decision).
 */
export async function recordBoardDecisionOnReview(
  db: ArcReviewDb,
  args: { orgId: string; arcId: string; userId: string; decision: BoardArcDecision },
): Promise<{ ok: true; recorded: number } | { ok: false }> {
  const { orgId, arcId, userId, decision } = args
  const { data, error } = await db
    .from('ai_runs')
    .select('id, output')
    .eq('organization_id', orgId)
    .eq('workflow_id', W37)
    .eq('status', PENDING)
    .eq('input->>arcRequestId', arcId)
  if (error) {
    logFailure('read', arcId, error.code)
    return { ok: false }
  }
  const now = new Date().toISOString()
  let recorded = 0
  for (const run of data ?? []) {
    const ai = readArcReviewOutput(run.output)?.suggestion?.decision ?? null
    const agrees = agreesWithSuggestion(decision, ai)
    const { error: updateError } = await db
      .from('ai_runs')
      .update({
        status: 'completed',
        human_approved: agrees,
        human_approver: userId,
        approved_at: agrees ? now : null,
        human_feedback: decisionFeedback(decision, ai),
      })
      .eq('id', run.id)
      .eq('organization_id', orgId)
      .eq('status', PENDING)
    if (updateError) {
      logFailure('update', arcId, updateError.code)
      return { ok: false }
    }
    recorded++
  }
  return { ok: true, recorded }
}

export type ArcCloseReason = 'withdrawn' | 'deleted'

const CLOSE_FEEDBACK: Record<ArcCloseReason, string> = {
  withdrawn: 'Closed without a board decision: the resident withdrew the application.',
  deleted: 'Closed without a board decision: the application was deleted.',
}

/** Take a pending draft out of the approvals inbox when there is nothing left to decide. */
export async function closeReviewsWithoutDecision(
  db: ArcReviewDb,
  args: { orgId: string; arcId: string; reason: ArcCloseReason },
): Promise<{ ok: boolean }> {
  const { error } = await db
    .from('ai_runs')
    .update({ status: 'completed', human_feedback: CLOSE_FEEDBACK[args.reason] })
    .eq('organization_id', args.orgId)
    .eq('workflow_id', W37)
    .eq('status', PENDING)
    .eq('input->>arcRequestId', args.arcId)
  if (error) logFailure(`close.${args.reason}`, args.arcId, error.code)
  return { ok: !error }
}
