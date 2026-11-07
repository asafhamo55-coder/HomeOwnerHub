'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import {
  approveRequest,
  rejectRequest,
  W18_CASH_RECEIPT,
  type DecisionResult,
} from '@homeowner-portal/workflows'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/orgs'
import { moneyGate, type SignoffDb } from '@/lib/professionals/signoff'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'

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
//
// The role gate below is defense in depth (security sweep 2026-10-20): a
// resident is refused before any client, and before the service-role
// client is even constructed.

const ApproveSchema = z.object({ approvalRequestId: z.string().uuid() })
const RejectSchema = z.object({
  approvalRequestId: z.string().uuid(),
  reason: z.string().trim().min(1, 'A reason is required to reject.').max(1000),
})

const NOT_IN_THIS_ORG = { ok: false as const, error: 'That approval item isn’t a bank deposit match in this community.' }

/**
 * Before any claim, on BOTH approve and reject and whatever M6 is: the
 * request must be a W18 deposit match of the ACTIVE org. The decide RPC lets
 * a board member of several orgs decide any of them, so a request id from
 * another org they belong to would otherwise be claimed from here.
 */
async function isW18InOrg(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  id: string,
  orgId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('action_type', W18_CASH_RECEIPT)
    .maybeSingle()
  return !error && !!data
}

export async function approvePosting(input: {
  approvalRequestId: string
}): Promise<DecisionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = ApproveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const supabase = await getSupabaseServerClient()
  if (!(await isW18InOrg(supabase, parsed.data.approvalRequestId, gate.orgId))) return NOT_IN_THIS_ORG
  // BL-168: the matching queue is a second door to the same approval, so it
  // goes through the same Treasurer-first / dual-control gate.
  if (M6_APPLIED) {
    const user = await getSignedInUser()
    if (!user) return { ok: false, error: 'You are not signed in.' }
    const gated = await moneyGate(supabase as unknown as SignoffDb, {
      orgId: gate.orgId,
      requestId: parsed.data.approvalRequestId,
      deciderId: user.id,
    })
    if (gated) return { ok: false, error: gated.ok ? gated.message : gated.error }
  }
  const result = await approveRequest(supabase, createAdminClient(), parsed.data.approvalRequestId)
  revalidate()
  return result
}

export async function rejectPosting(input: {
  approvalRequestId: string
  reason: string
}): Promise<DecisionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = RejectSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const supabase = await getSupabaseServerClient()
  if (!(await isW18InOrg(supabase, parsed.data.approvalRequestId, gate.orgId))) return NOT_IN_THIS_ORG
  const result = await rejectRequest(supabase, parsed.data.approvalRequestId, parsed.data.reason)
  revalidate()
  return result
}

function revalidate(): void {
  revalidatePath('/accounting/bank')
  revalidatePath('/accounting/bank/queue')
  revalidatePath('/accounting/ledger')
}
