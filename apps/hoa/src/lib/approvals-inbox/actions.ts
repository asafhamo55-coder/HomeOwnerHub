'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { approveVendor, rejectVendor } from '@/lib/vendors'
import { approveViolationDraft, rejectViolationDraft } from '@/lib/violations'
import { decideApprovalFor, postingHandlers, type InboxDecisionInput, type InboxDecisionOutcome } from './decide'

/**
 * The one decision endpoint behind /approvals (BL-014). It only routes:
 * W18 goes through the approval layer exactly as the matching queue's
 * approvePosting/rejectPosting do (the user's RLS client makes the
 * decision via decide_approval_request; service role runs the executor),
 * vendors through approveVendor/rejectVendor, and W3 letters through
 * approveViolationDraft/rejectViolationDraft (BL-048). See decide.ts.
 *
 * Residents are refused here, before any Supabase client is created.
 */
export async function decideApproval(input: InboxDecisionInput): Promise<InboxDecisionOutcome> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const supabase = await getSupabaseServerClient()
  const result = await decideApprovalFor(gate.role, input, {
    ...postingHandlers(supabase, createAdminClient()),
    approveVendor,
    rejectVendor,
    approveViolationDraft,
    rejectViolationDraft,
  })

  revalidatePath('/approvals')
  if (input.kind === 'w18') {
    revalidatePath('/accounting/bank')
    revalidatePath('/accounting/bank/queue')
    revalidatePath('/accounting/ledger')
  } else if (input.kind === 'w3') {
    revalidatePath('/violations')
    revalidatePath('/violations/approval-queue')
  } else {
    revalidatePath('/vendors/approval-queue')
  }
  // The sidebar badge lives in the dashboard layout.
  revalidatePath('/', 'layout')
  return result
}
