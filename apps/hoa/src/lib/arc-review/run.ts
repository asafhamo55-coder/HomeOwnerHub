// BL-027 — run the W37 board review draft for one ARC application.
//
// Called (a) right after a resident submits (lib/resident-submissions,
// through next/server `after`, with the service role — the resident never
// sees the result), and (b) from "Run AI review" on /arc/[id]
// (lib/arc-review/actions, board-gated, with the board member's client).
//
// It reads the application, reduces it to buildArcFacts (no identity, no
// contact details), and hands it to W37 in review mode. The run lands as
// pending_human_approval; nothing is decided. BL-079: when a loadPhotos dep
// is given, the attached photos go along (references in the input, images
// out of band). Never throws, never logs
// application text: failures are ids and stage names.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import type { ArcReviewInput, ArcReviewOutput, ArcReviewCategory } from '@homeowner-portal/workflows/W37'

type Db = SupabaseClient<Database>

export type ReviewFn = (
  input: ArcReviewInput,
  ctx: { organizationId: string; images?: string[] },
) => Promise<ArcReviewOutput & { runId: string }>

/** BL-079: the application's photos — references for the input, data URLs out of band. */
export type LoadPhotos = (
  db: Db,
  args: { orgId: string; arcId: string },
) => Promise<{ photos: Array<{ attachmentId: string; label: string }>; images: string[]; skipped: number }>

export type BuildFacts = (r: {
  category: ArcReviewCategory
  summary: string
  scopeDescription: string
  proposedStart?: string | null
  proposedCompletion?: string | null
  contractorName?: string | null
  contractorLicense?: string | null
}) => ArcReviewInput['facts']

export type RunReviewResult = { ok: true; runId: string } | { ok: false; error: string }

const OPEN = new Set(['submitted', 'in_review'])

interface ArcRow {
  id: string
  association_id: string | null
  category: ArcReviewCategory
  summary: string
  scope_description: string
  proposed_start: string | null
  proposed_completion: string | null
  contractor_name: string | null
  contractor_license: string | null
  status: string
}

export async function runBoardArcReviewWith(
  db: Db,
  args: { orgId: string; arcId: string; precheckRunId?: string | null },
  deps: { review: ReviewFn; buildFacts: BuildFacts; loadPhotos?: LoadPhotos },
): Promise<RunReviewResult> {
  const { orgId, arcId } = args
  const { data, error } = await db
    .from('arc_requests' as never)
    .select(
      'id, association_id, category, summary, scope_description, proposed_start, proposed_completion, contractor_name, contractor_license, status',
    )
    .eq('id', arcId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.error('arc review run failed', { stage: 'read', arcId, code: (error as { code?: string }).code ?? 'unknown' })
    return { ok: false, error: 'Couldn’t load the application. Try again.' }
  }
  const arc = data as unknown as ArcRow | null
  if (!arc) return { ok: false, error: 'That application no longer exists.' }
  if (!OPEN.has(arc.status)) return { ok: false, error: 'This application is already decided or withdrawn.' }

  // Photos are a bonus: a failure here reviews the written request alone.
  let photos: Awaited<ReturnType<LoadPhotos>> = { photos: [], images: [], skipped: 0 }
  if (deps.loadPhotos) {
    try {
      photos = await deps.loadPhotos(db, { orgId, arcId })
    } catch (err) {
      console.error('arc review run failed', { stage: 'photos', arcId, errorName: err instanceof Error ? err.name : 'UnknownError' })
    }
  }

  try {
    const result = await deps.review(
      {
        mode: 'review',
        facts: deps.buildFacts({
          category: arc.category,
          summary: arc.summary,
          scopeDescription: arc.scope_description,
          proposedStart: arc.proposed_start,
          proposedCompletion: arc.proposed_completion,
          contractorName: arc.contractor_name,
          contractorLicense: arc.contractor_license,
        }),
        associationId: arc.association_id,
        arcRequestId: arc.id,
        precheckRunId: args.precheckRunId ?? null,
        photos: photos.photos,
        ...(photos.skipped > 0 ? { photosSkipped: photos.skipped } : {}),
      },
      { organizationId: orgId, images: photos.images },
    )
    return { ok: true, runId: result.runId }
  } catch (err) {
    // The workflow already wrote a 'failed' ai_runs row. Name only.
    console.error('arc review run failed', { stage: 'workflow', arcId, errorName: err instanceof Error ? err.name : 'UnknownError' })
    return { ok: false, error: 'The AI review couldn’t run right now. Try again shortly.' }
  }
}
