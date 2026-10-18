// BL-024 / BL-027 — read the W37 runs for one ARC application.
//
// Takes the caller's client: the board member's own RLS client (ai_runs is
// board/admin-only by 0036). Relative imports only.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { W37, readArcReviewOutput, readReviewRun, type ArcReviewOutput, type ArcReviewRunRow, type ArcReviewView } from './model'

type Db = SupabaseClient<Database>

export type ArcReviewLoad =
  | {
      ok: true
      /** The latest board review draft, or null when none has run. */
      review: ArcReviewView | null
      /** What the resident saw when they checked before submitting, or null. */
      precheck: ArcReviewOutput | null
    }
  | { ok: false }

function logFailure(stage: string, arcId: string, code: string | undefined): void {
  console.error('arc review load failed', { stage, arcId, code: code ?? 'unknown' })
}

export async function loadArcReview(db: Db, orgId: string, arcId: string): Promise<ArcReviewLoad> {
  const { data, error } = await db
    .from('ai_runs')
    .select('id, status, created_at, input, output, human_approved, human_feedback')
    .eq('organization_id', orgId)
    .eq('workflow_id', W37)
    .eq('input->>arcRequestId', arcId)
    .eq('input->>mode', 'review')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) {
    logFailure('review', arcId, error.code)
    return { ok: false }
  }
  const row = (data ?? [])[0] as ArcReviewRunRow | undefined
  const review = row ? readReviewRun(row) : null
  if (!review?.precheckRunId) return { ok: true, review, precheck: null }

  // The resident's own pre-check, referenced by id from their submission.
  // Only a W37 pre-check in this org counts; anything else is ignored.
  const pre = await db
    .from('ai_runs')
    .select('output')
    .eq('id', review.precheckRunId)
    .eq('organization_id', orgId)
    .eq('workflow_id', W37)
    .eq('input->>mode', 'precheck')
    .maybeSingle()
  if (pre.error) logFailure('precheck', arcId, pre.error.code)
  const precheck = pre.data ? readArcReviewOutput(pre.data.output) : null
  return { ok: true, review, precheck: precheck?.mode === 'precheck' ? precheck : null }
}
