'use server'

/**
 * Draft-on-open (BL-101 A3). DraftPanel calls this once when a board
 * member opens a thread the page has judged eligible.
 *
 * Re-decides on the server instead of trusting the page: the page render
 * and this call are separate requests, and a second board member may have
 * drafted in between. Then it draws on the `inbox_autodraft` AI rate-limit
 * bucket (lib/api/ai-limits.ts) and calls the same generation core as
 * the manual "Draft a reply" button (`generateReplyDraft`), so citation
 * validation, blanks and the approval gate are all exactly what the button
 * gets. The button itself draws on `board_ai` (BL-112).
 *
 * Two board members opening the same thread in the same second can both
 * pass the re-check (it is read-then-act, like the rate limiter). The cost
 * is one extra draft row, never a send: nothing leaves without Approve.
 *
 * Ids only in logs.
 */

import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ApiRouteError } from '@/lib/api/errors'
import { checkAndRecordAiUsage } from '@/lib/api/rate-limit'
import { generateReplyDraft } from '@/lib/inbox/draft/generate-reply'
import { loadAutoDraftDecision, type AutoDraftSkip } from './autodraft'

export type AutoDraftResult =
  | { ok: true; draftId: string }
  | { skipped: AutoDraftSkip }
  | { error: string; rateLimited?: true }

export async function autoDraftOnOpen(threadId: string): Promise<AutoDraftResult> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const decision = await loadAutoDraftDecision(supabase, org.id, threadId)
  if (!decision.draft) return { skipped: decision.reason }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  try {
    await checkAndRecordAiUsage('inbox_autodraft', { orgId: org.id, userId: user.id })
  } catch (error) {
    if (error instanceof ApiRouteError && error.code === 'rate_limited') {
      return { error: error.publicMessage, rateLimited: true }
    }
    // BL-108: the platform kill switch pauses all AI; the panel shows the
    // friendly message and keeps the manual "Draft a reply" button.
    if (error instanceof ApiRouteError && error.extra?.reason === 'ai_paused') {
      return { error: error.publicMessage, rateLimited: true }
    }
    throw error
  }

  // BL-112: the unmetered core, not the createDraft action — createDraft
  // now draws on `board_ai` itself, and this call has already been
  // charged to `inbox_autodraft` above.
  return generateReplyDraft(threadId)
}
