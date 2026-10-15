'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import {
  approveRequest,
  rejectRequest,
  type DecisionResult,
} from '@homeowner-portal/workflows'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// Server actions for the approval layer (sub-project D,
// docs/specs/2026-10-15-approval-layer.md).
//
// Authorization is NOT decided here. The decision goes through the signed-in
// user's own RLS client to public.decide_approval_request(), which raises
// 42501 unless the caller is board/admin of the request's org. That holds
// even when someone POSTs to this action directly and skips the dashboard
// layout's resident redirect. Only the winning approval call runs the
// executor, and that runs under service role, because users have no write
// policy on approval_requests.

const ApproveSchema = z.object({ approvalRequestId: z.string().uuid() })
const RejectSchema = z.object({
  approvalRequestId: z.string().uuid(),
  reason: z.string().trim().min(1, 'A reason is required to reject.').max(1000),
})

export async function approvePosting(input: {
  approvalRequestId: string
}): Promise<DecisionResult> {
  const parsed = ApproveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const supabase = await getSupabaseServerClient()
  const result = await approveRequest(supabase, createAdminClient(), parsed.data.approvalRequestId)
  revalidate()
  return result
}

export async function rejectPosting(input: {
  approvalRequestId: string
  reason: string
}): Promise<DecisionResult> {
  const parsed = RejectSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const supabase = await getSupabaseServerClient()
  const result = await rejectRequest(supabase, parsed.data.approvalRequestId, parsed.data.reason)
  revalidate()
  return result
}

function revalidate(): void {
  revalidatePath('/accounting/bank')
  revalidatePath('/accounting/bank/queue')
  revalidatePath('/accounting/ledger')
}
