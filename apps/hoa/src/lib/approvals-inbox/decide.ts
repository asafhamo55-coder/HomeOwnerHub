// BL-014 decisions. The inbox adds NO posting path: every decision is
// dispatched to the action the owning module already has.
//
//   w18 approve/reject → approveRequest / rejectRequest (packages/workflows
//                        approvals): the decide_approval_request RPC claim
//                        plus the registered executor, the same calls the
//                        matching queue's approvePosting/rejectPosting make.
//                        Double-posting is prevented there (winner-only
//                        executor, executor re-validation, and 0061's
//                        journal_entries_bank_rec_posted_uniq index).
//   vendor approve     → approveVendor (lib/vendors.ts), with its own
//                        green-compliance gate.
//   w3                 → none: the W3 module has no decision action yet, so
//                        the inbox links to its queue instead.
//
// Pure (relative imports + workspace packages only) so tests/integration
// can drive the exact composition the server action uses.

import { z } from 'zod'
import { approveRequest, rejectRequest, type DecisionResult } from '@homeowner-portal/workflows'
import { canUseApprovals } from './model'
import type { InboxDb } from './load'

export interface InboxDecisionHandlers {
  approvePosting(approvalRequestId: string): Promise<DecisionResult>
  rejectPosting(approvalRequestId: string, reason: string): Promise<DecisionResult>
  approveVendor(vendorId: string): Promise<{ ok: true } | { ok: false; error: string }>
}

export type InboxDecisionOutcome = { ok: true; message: string } | { ok: false; error: string }

const DecisionSchema = z.object({
  kind: z.enum(['w18', 'vendor']),
  id: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(1000).optional(),
})

export type InboxDecisionInput = z.input<typeof DecisionSchema>

/** The approval layer's two calls, bound to a decider and an executor client. */
export function postingHandlers(
  userDb: InboxDb,
  adminDb: InboxDb,
): Pick<InboxDecisionHandlers, 'approvePosting' | 'rejectPosting'> {
  return {
    approvePosting: (id) => approveRequest(userDb, adminDb, id),
    rejectPosting: (id, reason) => rejectRequest(userDb, id, reason),
  }
}

/**
 * Gate, validate, dispatch. The role gate is defense in depth: the W18
 * RPC independently refuses non-board callers (42501), but approveVendor
 * has no role check of its own.
 */
export async function decideApprovalFor(
  role: string | null | undefined,
  raw: unknown,
  handlers: InboxDecisionHandlers,
): Promise<InboxDecisionOutcome> {
  if (!canUseApprovals(role)) return { ok: false, error: 'Only board members and admins can decide approvals.' }

  const parsed = DecisionSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'That approval item isn’t valid.' }
  const { kind, id, decision } = parsed.data
  const reason = parsed.data.reason?.trim() ?? ''

  if (kind === 'vendor') {
    if (decision !== 'approve') return { ok: false, error: 'Vendors can only be approved here. Open the vendor to change anything else.' }
    const r = await handlers.approveVendor(id)
    return r.ok ? { ok: true, message: 'Vendor approved and now active.' } : { ok: false, error: r.error }
  }

  if (decision === 'reject') {
    if (!reason) return { ok: false, error: 'A reason is required to reject.' }
    const r = await handlers.rejectPosting(id, reason)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, message: 'Rejected. The deposit is back in the matching queue.' }
  }

  const r = await handlers.approvePosting(id)
  if (!r.ok) return { ok: false, error: r.error }
  return {
    ok: true,
    message: r.alreadyDecided ? 'Already approved — nothing was posted again.' : 'Approved and posted to the ledger.',
  }
}
