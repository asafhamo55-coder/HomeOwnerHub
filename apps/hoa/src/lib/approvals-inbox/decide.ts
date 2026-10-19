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
//   vendor reject      → rejectVendor (lib/vendors.ts): prospect → inactive,
//                        reason audited (BL-048).
//   bill approve/reject→ approveRequest / rejectRequest with ONLY the
//                        w36.ap_bill executor (lib/bill-scan/executor.ts),
//                        which enters the bill through enterBill
//                        (lib/invoices.ts). The row's action_type is checked
//                        first, so a bill decision can never claim a W18
//                        proposal (BL-021).
//   w3 approve/reject  → approveViolationDraft / rejectViolationDraft
//                        (lib/violations.ts → lib/violation-drafts.ts):
//                        approve files the letter as an OPEN violation and
//                        sends nothing; reject keeps the reason on the run
//                        (BL-048).
//   collections        → approveRequest / rejectRequest with ONLY the
//     approve/reject     collections.letter executor
//                        (lib/collections/letters/executor.ts): approving
//                        re-checks the case is open and marks the letter
//                        approved for printing. Nothing is sent. The kind
//                        is checked first, as for bills (BL-089).
//   contact approve/   → approveContactUpdate / rejectContactUpdate
//     reject             (lib/contact-updates/apply.ts, PR-10): approve
//                        applies the resident's own contact change to their
//                        rows on the home (lot.ts applySelfContact) with the
//                        decider's RLS client; reject closes the request
//                        with the reason. Nothing uses the service role.
//
// Pure (relative imports + workspace packages only) so tests/integration
// can drive the exact composition the server action uses.

import { z } from 'zod'
import { approveRequest, rejectRequest, type ApprovalExecutor, type DecisionResult } from '@homeowner-portal/workflows'
import { BILL_ACTION } from '../bill-scan/proposal'
import { LETTER_ACTION } from '../collections/letters/proposal'
import { letterExecutor } from '../collections/letters/executor'
import { approveContactUpdate, rejectContactUpdate } from '../contact-updates/apply'
import { canUseApprovals } from './model'
import type { InboxDb } from './load'

type Simple = { ok: true } | { ok: false; error: string }

export interface InboxDecisionHandlers {
  approvePosting(approvalRequestId: string): Promise<DecisionResult>
  rejectPosting(approvalRequestId: string, reason: string): Promise<DecisionResult>
  approveVendor(vendorId: string): Promise<Simple>
  rejectVendor(vendorId: string, reason: string): Promise<Simple>
  approveViolationDraft(
    runId: string,
  ): Promise<{ ok: true; violationId: string; followUp?: boolean } | { ok: false; error: string }>
  rejectViolationDraft(runId: string, reason: string): Promise<Simple>
  approveBill(approvalRequestId: string): Promise<DecisionResult>
  rejectBill(approvalRequestId: string, reason: string): Promise<DecisionResult>
  approveLetter(approvalRequestId: string): Promise<DecisionResult>
  rejectLetter(approvalRequestId: string, reason: string): Promise<DecisionResult>
  approveContact(ticketId: string): Promise<Simple & { message?: string }>
  rejectContact(ticketId: string, reason: string): Promise<Simple & { message?: string }>
}

export type InboxDecisionOutcome = { ok: true; message: string } | { ok: false; error: string }

const DecisionSchema = z.object({
  kind: z.enum(['w18', 'bill', 'w3', 'collections', 'vendor', 'contact']),
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
 * BL-021: the approval layer's two calls for scanned bills. The kind check
 * runs on the decider's own RLS client (board/admin can read
 * approval_requests) BEFORE the claim, and the executor map holds only the
 * bill executor — a W18 id sent as a bill is refused, never claimed.
 */
export function billHandlers(
  userDb: InboxDb,
  adminDb: InboxDb,
  executor: ApprovalExecutor,
): Pick<InboxDecisionHandlers, 'approveBill' | 'rejectBill'> {
  const isBill = async (id: string): Promise<boolean> => {
    const { data, error } = await userDb.from('approval_requests').select('action_type').eq('id', id).maybeSingle()
    return !error && data?.action_type === BILL_ACTION
  }
  const notBill = { ok: false as const, error: 'That approval item isn’t a scanned bill.' }
  return {
    approveBill: async (id) => ((await isBill(id)) ? approveRequest(userDb, adminDb, id, { [BILL_ACTION]: executor }) : notBill),
    rejectBill: async (id, reason) => ((await isBill(id)) ? rejectRequest(userDb, id, reason) : notBill),
  }
}

/**
 * BL-089: collections letters. Same shape as billHandlers: the kind check
 * runs on the decider's RLS client before the claim, and the executor map
 * holds only the letter executor, so no other proposal can be claimed as
 * a letter.
 */
export function letterHandlers(userDb: InboxDb, adminDb: InboxDb): Pick<InboxDecisionHandlers, 'approveLetter' | 'rejectLetter'> {
  const isLetter = async (id: string): Promise<boolean> => {
    const { data, error } = await userDb.from('approval_requests').select('action_type').eq('id', id).maybeSingle()
    return !error && data?.action_type === LETTER_ACTION
  }
  const notLetter = { ok: false as const, error: 'That approval item isn’t a collections letter.' }
  return {
    approveLetter: async (id) => ((await isLetter(id)) ? approveRequest(userDb, adminDb, id, { [LETTER_ACTION]: letterExecutor }) : notLetter),
    rejectLetter: async (id, reason) => ((await isLetter(id)) ? rejectRequest(userDb, id, reason) : notLetter),
  }
}

/** PR-10: contact updates, decided with the decider's own RLS client. */
export function contactHandlers(
  userDb: InboxDb,
  ctx: { orgId: string; deciderId: string; deciderRole: 'board' | 'admin' },
): Pick<InboxDecisionHandlers, 'approveContact' | 'rejectContact'> {
  return {
    approveContact: async (ticketId) => {
      const r = await approveContactUpdate(userDb, { ...ctx, ticketId })
      return r.ok ? { ok: true, message: r.message } : r
    },
    rejectContact: async (ticketId, reason) => {
      const r = await rejectContactUpdate(userDb, { ...ctx, ticketId, reason })
      return r.ok ? { ok: true, message: r.message } : r
    },
  }
}

/**
 * Gate, validate, dispatch. The role gate is defense in depth: the server
 * action already refused non-board callers, the W18 RPC refuses them
 * (42501), and RLS on ai_runs/vendors does too — but approveVendor has no
 * role check of its own.
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

  if (decision === 'reject' && !reason) return { ok: false, error: 'A reason is required to reject.' }

  if (kind === 'vendor') {
    if (decision === 'reject') {
      const r = await handlers.rejectVendor(id, reason)
      return r.ok ? { ok: true, message: 'Vendor rejected and marked inactive.' } : { ok: false, error: r.error }
    }
    const r = await handlers.approveVendor(id)
    return r.ok ? { ok: true, message: 'Vendor approved and now active.' } : { ok: false, error: r.error }
  }

  if (kind === 'w3') {
    if (decision === 'reject') {
      const r = await handlers.rejectViolationDraft(id, reason)
      return r.ok ? { ok: true, message: 'Draft rejected. Nothing was sent.' } : { ok: false, error: r.error }
    }
    const r = await handlers.approveViolationDraft(id)
    if (!r.ok) return { ok: false, error: r.error }
    return r.followUp
      ? { ok: true, message: 'Follow-up letter approved and filed on its violation. Nothing was sent to the homeowner.' }
      : { ok: true, message: 'Letter approved and filed as an open violation. Nothing was sent to the homeowner.' }
  }

  if (kind === 'contact') {
    const r = decision === 'reject' ? await handlers.rejectContact(id, reason) : await handlers.approveContact(id)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, message: r.message ?? (decision === 'reject' ? 'Rejected.' : 'Contact details updated.') }
  }

  if (kind === 'collections') {
    if (decision === 'reject') {
      const r = await handlers.rejectLetter(id, reason)
      return r.ok ? { ok: true, message: 'Letter rejected. Nothing was sent.' } : { ok: false, error: r.error }
    }
    const r = await handlers.approveLetter(id)
    if (!r.ok) return { ok: false, error: r.error }
    return {
      ok: true,
      message: r.alreadyDecided
        ? 'Already approved.'
        : 'Letter approved. Print it from the property’s collections letter page and mail it yourself. Nothing was sent.',
    }
  }

  if (kind === 'bill') {
    if (decision === 'reject') {
      const r = await handlers.rejectBill(id, reason)
      return r.ok ? { ok: true, message: 'Rejected. Nothing was entered in accounting.' } : { ok: false, error: r.error }
    }
    const r = await handlers.approveBill(id)
    if (!r.ok) return { ok: false, error: r.error }
    return {
      ok: true,
      message: r.alreadyDecided
        ? 'Already approved — the bill was not entered again.'
        : 'Approved. The bill is entered and posted to accounts payable.',
    }
  }

  if (decision === 'reject') {
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
