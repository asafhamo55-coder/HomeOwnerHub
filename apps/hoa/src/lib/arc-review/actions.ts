'use server'

// BL-027 — "Run AI review" on /arc/[id]. Board/admin only, gated before any
// Supabase client is created. The decision buttons do NOT live here: they
// call the existing ARC actions in lib/board-review.ts.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { buildArcFacts, reviewArcRequest } from '@homeowner-portal/workflows/W37'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadArcReview } from './load'
import { runBoardArcReviewWith } from './run'

const Id = z.string().uuid()

export async function runArcReviewNow(arcId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!Id.safeParse(arcId).success) return { ok: false, error: 'That application isn’t valid.' }

  const supabase = await getSupabaseServerClient()
  const existing = await loadArcReview(supabase, gate.orgId, arcId)
  if (!existing.ok) return { ok: false, error: 'Couldn’t check for an existing AI review. Try again.' }
  if (existing.review?.state === 'pending') return { ok: false, error: 'An AI review is already waiting for a decision.' }

  const result = await runBoardArcReviewWith(
    supabase,
    { orgId: gate.orgId, arcId, precheckRunId: existing.review?.precheckRunId ?? null },
    { review: reviewArcRequest, buildFacts: buildArcFacts },
  )
  if (!result.ok) return result
  revalidatePath(`/arc/${arcId}`)
  revalidatePath('/approvals')
  revalidatePath('/', 'layout')
  return { ok: true }
}
