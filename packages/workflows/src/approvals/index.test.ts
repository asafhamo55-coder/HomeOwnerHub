import { describe, expect, it, vi } from 'vitest'
import {
  approveRequest,
  rejectRequest,
  type ApprovalExecutor,
  type ApprovalRequestRow,
  type Db,
} from './index'

// Orchestration only — the decision RPC's authorization and the real
// posting are proven against Postgres in
// tests/integration/flows/approval-layer.test.ts. Here: given what the RPC
// reports, does approveRequest run the executor exactly when it should and
// record the right terminal state?

const ID = '99999999-9999-4999-8999-999999999999'

function row(over: Partial<ApprovalRequestRow> = {}): ApprovalRequestRow {
  return {
    id: ID,
    organization_id: 'org-1',
    workflow_id: 'W18',
    action_type: 'test.action',
    subject_type: 'bank_transaction',
    subject_id: 'txn-1',
    payload: {},
    summary: 's',
    amount: 1,
    status: 'approved',
    proposed_at: '2026-10-15T00:00:00Z',
    decided_by: 'user-1',
    decided_at: '2026-10-15T00:00:00Z',
    decision_reason: null,
    posted_at: null,
    result_ref: null,
    error: null,
    ...over,
  }
}

function fakeUser(rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => rpcResult)
  return { client: { rpc } as unknown as Db, rpc }
}

function fakeAdmin(current: ApprovalRequestRow) {
  const updates: Record<string, unknown>[] = []
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: current, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch)
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.then = (resolve: (v: unknown) => void) => resolve({ error: null })
        return chain
      },
    }),
  }
  return { client: client as unknown as Db, updates }
}

describe('approveRequest', () => {
  it('runs the executor once and records posted when this call won the claim', async () => {
    const user = fakeUser({ data: { won: true, status: 'approved', id: ID }, error: null })
    const admin = fakeAdmin(row())
    const exec = vi.fn<ApprovalExecutor>(async () => ({ ok: true, resultRef: 'je-1' }))

    const r = await approveRequest(user.client, admin.client, ID, { 'test.action': exec })

    expect(exec).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ ok: true, status: 'posted', resultRef: 'je-1', alreadyDecided: false })
    expect(admin.updates).toHaveLength(1)
    expect(admin.updates[0]).toMatchObject({ status: 'posted', result_ref: 'je-1' })
  })

  it('never runs the executor when another call already won (idempotent second approve)', async () => {
    const user = fakeUser({
      data: { won: false, status: 'posted', id: ID, result_ref: 'je-1' },
      error: null,
    })
    const admin = fakeAdmin(row({ status: 'posted' }))
    const exec = vi.fn<ApprovalExecutor>()

    const r = await approveRequest(user.client, admin.client, ID, { 'test.action': exec })

    expect(exec).not.toHaveBeenCalled()
    expect(admin.updates).toHaveLength(0)
    expect(r).toEqual({ ok: true, status: 'posted', resultRef: 'je-1', alreadyDecided: true })
  })

  it('does not run the executor for a loser even while the winner is still posting', async () => {
    const user = fakeUser({ data: { won: false, status: 'approved', id: ID }, error: null })
    const admin = fakeAdmin(row())
    const exec = vi.fn<ApprovalExecutor>()

    const r = await approveRequest(user.client, admin.client, ID, { 'test.action': exec })
    expect(exec).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: true, status: 'approved', alreadyDecided: true })
  })

  it('reports a rejected request as an error, not as approved', async () => {
    const user = fakeUser({ data: { won: false, status: 'rejected', id: ID }, error: null })
    const exec = vi.fn<ApprovalExecutor>()
    const r = await approveRequest(user.client, fakeAdmin(row()).client, ID, { 'test.action': exec })
    expect(r.ok).toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })

  it('surfaces an authorization refusal and runs nothing', async () => {
    const user = fakeUser({ data: null, error: { code: '42501', message: 'nope' } })
    const exec = vi.fn<ApprovalExecutor>()
    const r = await approveRequest(user.client, fakeAdmin(row()).client, ID, { 'test.action': exec })
    expect(r).toEqual({ ok: false, error: 'You are not allowed to decide this request.' })
    expect(exec).not.toHaveBeenCalled()
  })

  it('marks failed when the executor refuses cleanly', async () => {
    const user = fakeUser({ data: { won: true, status: 'approved', id: ID }, error: null })
    const admin = fakeAdmin(row())
    const exec = vi.fn<ApprovalExecutor>(async () => ({ ok: false, error: 'already matched' }))

    const r = await approveRequest(user.client, admin.client, ID, { 'test.action': exec })
    expect(r).toEqual({ ok: false, error: 'already matched', status: 'failed' })
    expect(admin.updates[0]).toMatchObject({ status: 'failed', error: 'already matched' })
  })

  it('leaves the request approved (not failed, not retryable) when the executor throws', async () => {
    // A throw means unknown state — a JE may exist. 'failed' would free the
    // live-subject slot and invite a re-proposal; staying 'approved' blocks
    // any automatic second posting.
    const user = fakeUser({ data: { won: true, status: 'approved', id: ID }, error: null })
    const admin = fakeAdmin(row())
    const exec = vi.fn<ApprovalExecutor>(async () => {
      throw new Error('network blip')
    })

    const r = await approveRequest(user.client, admin.client, ID, { 'test.action': exec })
    expect(r.ok).toBe(false)
    expect(admin.updates).toHaveLength(1)
    expect(admin.updates[0]).not.toHaveProperty('status')
    expect(admin.updates[0].error).toMatch(/network blip/)
  })

  it('marks failed when no executor is registered for the action type', async () => {
    const user = fakeUser({ data: { won: true, status: 'approved', id: ID }, error: null })
    const admin = fakeAdmin(row({ action_type: 'unknown.action' }))
    const r = await approveRequest(user.client, admin.client, ID, {})
    expect(r.ok).toBe(false)
    expect(admin.updates[0]).toMatchObject({ status: 'failed' })
  })
})

describe('rejectRequest', () => {
  it('requires a reason before calling the database', async () => {
    const user = fakeUser({ data: null, error: null })
    const r = await rejectRequest(user.client, ID, '   ')
    expect(r.ok).toBe(false)
    expect(user.rpc).not.toHaveBeenCalled()
  })

  it('passes the reason to the decision RPC', async () => {
    const user = fakeUser({ data: { won: true, status: 'rejected', id: ID }, error: null })
    const r = await rejectRequest(user.client, ID, 'wrong unit')
    expect(user.rpc).toHaveBeenCalledWith('decide_approval_request', {
      p_id: ID,
      p_decision: 'reject',
      p_reason: 'wrong unit',
    })
    expect(r).toEqual({ ok: true, status: 'rejected', resultRef: null, alreadyDecided: false })
  })

  it('refuses to reject something already approved', async () => {
    const user = fakeUser({ data: { won: false, status: 'posted', id: ID }, error: null })
    const r = await rejectRequest(user.client, ID, 'too late')
    expect(r.ok).toBe(false)
  })
})
