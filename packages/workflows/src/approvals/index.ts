// Sub-project D — the approval layer.
//
// A workflow that wants a side effect a human must sign off on calls
// proposeApproval() instead of performing it. A board member or admin
// then approves (approveRequest — which runs the registered executor
// exactly once) or rejects with a reason (rejectRequest).
//
// Spec: docs/specs/2026-10-15-approval-layer.md. Table + decision RPC:
// migrations/0060_approval_requests.sql.
//
// The two clients are deliberately separate:
//   - userDb  (the signed-in user's RLS client) makes the DECISION through
//     decide_approval_request(), which is the only authorization gate:
//     board/admin of the row's org, or 42501.
//   - adminDb (service role) loads the row and runs the executor. Users
//     have no write policy on approval_requests, so they can't edit the
//     payload they're approving.

import type { Json, postJournalEntry } from '@homeowner-portal/db'
import { executeW18CashReceipt, W18_CASH_RECEIPT } from './w18-cash-receipt'

export type Db = Parameters<typeof postJournalEntry>[0]

export type ApprovalStatus = 'proposed' | 'approved' | 'rejected' | 'posted' | 'failed'

export interface ApprovalRequestRow {
  id: string
  organization_id: string
  workflow_id: string
  action_type: string
  subject_type: string
  subject_id: string
  payload: Json
  summary: string
  amount: number | null
  status: string
  proposed_at: string
  decided_by: string | null
  decided_at: string | null
  decision_reason: string | null
  posted_at: string | null
  result_ref: string | null
  error: string | null
}

/**
 * Performs an approved request's side effect. Contract:
 *   - re-validate against CURRENT state (the world may have moved since
 *     the proposal) and return { ok: false } without side effects if it
 *     no longer holds;
 *   - once the irreversible part (e.g. the JE) has happened, return
 *     { ok: true } — report any later partial failure in `warning`, never
 *     by throwing, so the request is recorded as posted and can't be
 *     re-run.
 */
export type ApprovalExecutor = (
  adminDb: Db,
  request: ApprovalRequestRow,
) => Promise<{ ok: true; resultRef: string; warning?: string } | { ok: false; error: string }>

export const APPROVAL_EXECUTORS: Record<string, ApprovalExecutor> = {
  [W18_CASH_RECEIPT]: executeW18CashReceipt,
}

export type DecisionResult =
  | { ok: true; status: ApprovalStatus; resultRef: string | null; alreadyDecided: boolean }
  | { ok: false; error: string; status?: ApprovalStatus }

// ─── propose ─────────────────────────────────────────────────────────

export interface ProposeApprovalInput {
  organizationId: string
  workflowId: string
  actionType: string
  subjectType: string
  subjectId: string
  payload: Json
  summary: string
  amount: number | null
  /**
   * Who put the item in front of the board (BL-168, M6_APPLIED: the
   * column exists only after migration 0070). The proposer can never be one
   * of a money item's two sign-offs. Omit it before M6.
   */
  proposedBy?: string
}

/**
 * Insert a `proposed` request. If a live one (proposed/approved/posted)
 * already exists for this (actionType, subjectId), returns it instead —
 * the partial unique index makes re-running a workflow idempotent.
 */
export async function proposeApproval(
  db: Db,
  input: ProposeApprovalInput,
): Promise<{ id: string; status: ApprovalStatus; created: boolean }> {
  const { data, error } = await db
    .from('approval_requests')
    .insert({
      organization_id: input.organizationId,
      workflow_id: input.workflowId,
      action_type: input.actionType,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      payload: input.payload,
      summary: input.summary,
      amount: input.amount,
      ...(input.proposedBy ? ({ proposed_by: input.proposedBy } as object) : {}),
    })
    .select('id, status')
    .single()

  if (!error && data) {
    return { id: data.id, status: data.status as ApprovalStatus, created: true }
  }
  if (error?.code !== '23505') {
    throw new Error(`approval_request_insert_failed: ${error?.message ?? 'unknown'}`)
  }

  const { data: existing, error: readErr } = await db
    .from('approval_requests')
    .select('id, status')
    .eq('action_type', input.actionType)
    .eq('subject_id', input.subjectId)
    .in('status', ['proposed', 'approved', 'posted'])
    .single()
  if (readErr || !existing) {
    throw new Error(`approval_request_live_lookup_failed: ${readErr?.message ?? 'not found'}`)
  }
  return { id: existing.id, status: existing.status as ApprovalStatus, created: false }
}

// ─── decide ──────────────────────────────────────────────────────────

interface RpcDecision {
  won: boolean
  id: string
  status: ApprovalStatus
  result_ref?: string | null
}

async function decide(
  userDb: Db,
  id: string,
  decision: 'approve' | 'reject',
  reason?: string,
): Promise<{ ok: true; decision: RpcDecision } | { ok: false; error: string }> {
  const { data, error } = await userDb.rpc('decide_approval_request', {
    p_id: id,
    p_decision: decision,
    ...(reason !== undefined ? { p_reason: reason } : {}),
  })
  if (error) {
    return {
      ok: false,
      error:
        error.code === '42501'
          ? 'You are not allowed to decide this request.'
          : error.message,
    }
  }
  if (!data) return { ok: false, error: 'no decision returned' }
  return { ok: true, decision: data as unknown as RpcDecision }
}

/**
 * Approve and, if this call won the claim, post. A call that did not win
 * (double-click, second tab, concurrent board member) NEVER runs the
 * executor: it reports the state the winner left behind.
 */
export async function approveRequest(
  userDb: Db,
  adminDb: Db,
  id: string,
  executors: Record<string, ApprovalExecutor> = APPROVAL_EXECUTORS,
): Promise<DecisionResult> {
  const d = await decide(userDb, id, 'approve')
  if (!d.ok) return d

  const { won, status } = d.decision
  if (!won) {
    if (status === 'approved' || status === 'posted') {
      return {
        ok: true,
        status,
        resultRef: d.decision.result_ref ?? null,
        alreadyDecided: true,
      }
    }
    return { ok: false, error: `This request is already ${status}.`, status }
  }

  const { data: request, error: loadErr } = await adminDb
    .from('approval_requests')
    .select('*')
    .eq('id', id)
    .single()
  if (loadErr || !request) {
    // Approved but unread: leave it 'approved' (no automatic retry).
    return { ok: false, error: `approved, but could not load request: ${loadErr?.message}`, status: 'approved' }
  }

  const executor = executors[request.action_type]
  if (!executor) {
    const error = `no executor registered for ${request.action_type}`
    await finish(adminDb, id, { status: 'failed', error })
    return { ok: false, error, status: 'failed' }
  }

  let outcome: Awaited<ReturnType<ApprovalExecutor>>
  try {
    outcome = await executor(adminDb, request as ApprovalRequestRow)
  } catch (err) {
    // Unknown state — the irreversible step may or may not have happened.
    // Stay 'approved': it can't be claimed again, so nothing re-posts.
    const error = `executor threw; request left approved for manual review: ${err instanceof Error ? err.message : String(err)}`
    await finish(adminDb, id, { error })
    return { ok: false, error, status: 'approved' }
  }

  if (!outcome.ok) {
    await finish(adminDb, id, { status: 'failed', error: outcome.error })
    return { ok: false, error: outcome.error, status: 'failed' }
  }

  await finish(adminDb, id, {
    status: 'posted',
    posted_at: new Date().toISOString(),
    result_ref: outcome.resultRef,
    error: outcome.warning ?? null,
  })
  return { ok: true, status: 'posted', resultRef: outcome.resultRef, alreadyDecided: false }
}

export async function rejectRequest(
  userDb: Db,
  id: string,
  reason: string,
): Promise<DecisionResult> {
  const trimmed = reason.trim()
  if (!trimmed) return { ok: false, error: 'A reason is required to reject.' }

  const d = await decide(userDb, id, 'reject', trimmed)
  if (!d.ok) return d
  const { won, status } = d.decision
  if (won || status === 'rejected') {
    return { ok: true, status: 'rejected', resultRef: null, alreadyDecided: !won }
  }
  return { ok: false, error: `This request is already ${status}.`, status }
}

/** Approved → terminal. Conditional on still being 'approved' so a stale
 *  writer can never move a row backwards. */
async function finish(
  adminDb: Db,
  id: string,
  patch: { status?: 'posted' | 'failed'; posted_at?: string; result_ref?: string; error?: string | null },
): Promise<void> {
  const { error } = await adminDb
    .from('approval_requests')
    .update(patch)
    .eq('id', id)
    .eq('status', 'approved')
  if (error) {
    throw new Error(`approval_request_finish_failed: ${error.message}`)
  }
}

export { W18_CASH_RECEIPT } from './w18-cash-receipt'
export type { CashReceiptPayload } from './w18-cash-receipt'
