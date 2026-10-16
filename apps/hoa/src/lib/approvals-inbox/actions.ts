'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { approveVendor } from '@/lib/vendors'
import { decideApprovalFor, postingHandlers, type InboxDecisionInput, type InboxDecisionOutcome } from './decide'

/**
 * The one decision endpoint behind /approvals (BL-014). It only routes:
 * W18 goes through the approval layer exactly as the matching queue's
 * approvePosting/rejectPosting do (the user's RLS client makes the
 * decision via decide_approval_request; service role runs the executor),
 * and vendors through approveVendor. See decide.ts.
 */
export async function decideApproval(input: InboxDecisionInput): Promise<InboxDecisionOutcome> {
  const ctx = await getCurrentUserRole()
  const supabase = await getSupabaseServerClient()
  const result = await decideApprovalFor(ctx?.role ?? null, input, {
    ...postingHandlers(supabase, createAdminClient()),
    approveVendor,
  })

  revalidatePath('/approvals')
  if (input.kind === 'w18') {
    revalidatePath('/accounting/bank')
    revalidatePath('/accounting/bank/queue')
    revalidatePath('/accounting/ledger')
  } else {
    revalidatePath('/vendors/approval-queue')
  }
  // The sidebar badge lives in the dashboard layout.
  revalidatePath('/', 'layout')
  return result
}
