// BL-027 — server-side entry points that run WITHOUT a board session.
//
// NOT a 'use server' file on purpose: these take an orgId and use the
// service role, so they must never be callable from a browser. Only
// server code imports them (lib/resident-submissions, after the resident's
// own insert or withdrawal has already passed its checks).

import { createAdminClient } from '@homeowner-portal/db'
import { buildArcFacts, reviewArcRequest } from '@homeowner-portal/workflows/W37'
import { runBoardArcReviewWith } from './run'
import { closeReviewsWithoutDecision } from './record'

/** Draft the board review for a just-submitted application. Never throws. */
export async function startBoardArcReview(args: { orgId: string; arcId: string; precheckRunId?: string | null }): Promise<void> {
  try {
    await runBoardArcReviewWith(createAdminClient(), args, { review: reviewArcRequest, buildFacts: buildArcFacts })
  } catch (err) {
    console.error('arc review start failed', { arcId: args.arcId, errorName: err instanceof Error ? err.name : 'UnknownError' })
  }
}

/** The resident withdrew: nothing is left for the board to decide. Never throws. */
export async function closeArcReviewsOnWithdraw(args: { orgId: string; arcId: string }): Promise<void> {
  try {
    await closeReviewsWithoutDecision(createAdminClient(), { ...args, reason: 'withdrawn' })
  } catch (err) {
    console.error('arc review close failed', { arcId: args.arcId, errorName: err instanceof Error ? err.name : 'UnknownError' })
  }
}
