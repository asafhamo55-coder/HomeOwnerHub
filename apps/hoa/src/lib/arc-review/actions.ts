'use server'

// BL-027 — "Run AI review" on /arc/[id]. Board/admin only, gated before any
// Supabase client is created. The decision buttons do NOT live here: they
// call the existing ARC actions in lib/board-review.ts.
//
// BL-079: the review reads the application's photos. Residents attach them
// after submitting, so a waiting review can be replaced when the photos it
// would read now differ from the ones it read — the old draft closes as
// superseded, never silently.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { buildArcFacts, resolveArcReviewMaxPhotos, reviewArcRequest } from '@homeowner-portal/workflows/W37'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadArcReview } from './load'
import { photosChanged } from './model'
import { currentArcPhotoIds, loadArcPhotos } from './photos'
import { closeReviewsWithoutDecision } from './record'
import { runBoardArcReviewWith } from './run'

const Id = z.string().uuid()

export async function runArcReviewNow(arcId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!Id.safeParse(arcId).success) return { ok: false, error: 'That application isn’t valid.' }

  const supabase = await getSupabaseServerClient()
  const existing = await loadArcReview(supabase, gate.orgId, arcId)
  if (!existing.ok) return { ok: false, error: 'Couldn’t check for an existing AI review. Try again.' }
  const max = resolveArcReviewMaxPhotos()

  if (existing.review?.state === 'pending') {
    const current = await currentArcPhotoIds(supabase, { orgId: gate.orgId, arcId, max })
    if (!current || !photosChanged(existing.review.photoIds, current)) {
      return { ok: false, error: 'An AI review is already waiting for a decision.' }
    }
    const closed = await closeReviewsWithoutDecision(supabase, { orgId: gate.orgId, arcId, reason: 'superseded' })
    if (!closed.ok) return { ok: false, error: 'Couldn’t replace the waiting AI review. Try again.' }
  }

  const result = await runBoardArcReviewWith(
    supabase,
    { orgId: gate.orgId, arcId, precheckRunId: existing.review?.precheckRunId ?? null },
    { review: reviewArcRequest, buildFacts: buildArcFacts, loadPhotos: (db, a) => loadArcPhotos(db, { ...a, max }) },
  )
  if (!result.ok) return result
  revalidatePath(`/arc/${arcId}`)
  revalidatePath('/approvals')
  revalidatePath('/', 'layout')
  return { ok: true }
}
