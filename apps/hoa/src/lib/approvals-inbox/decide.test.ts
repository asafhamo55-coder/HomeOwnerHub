import { describe, expect, it, vi } from 'vitest'

const { approveRequest, rejectRequest } = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
}))
vi.mock('@homeowner-portal/workflows', () => ({ approveRequest, rejectRequest }))

import { decideApprovalFor, postingHandlers, type InboxDecisionHandlers } from './decide'

const ID = '11111111-1111-4111-8111-111111111111'

function handlers(over: Partial<InboxDecisionHandlers> = {}): InboxDecisionHandlers {
  return {
    approvePosting: vi.fn(async () => ({ ok: true as const, status: 'posted' as const, resultRef: 'je', alreadyDecided: false })),
    rejectPosting: vi.fn(async () => ({ ok: true as const, status: 'rejected' as const, resultRef: null, alreadyDecided: false })),
    approveVendor: vi.fn(async () => ({ ok: true as const })),
    ...over,
  }
}

describe('decideApprovalFor — role gate', () => {
  it.each(['resident', null, 'owner'])('refuses %s before touching any module action', async (role) => {
    const h = handlers()
    const r = await decideApprovalFor(role, { kind: 'w18', id: ID, decision: 'approve' }, h)
    expect(r.ok).toBe(false)
    expect(h.approvePosting).not.toHaveBeenCalled()
    expect(h.rejectPosting).not.toHaveBeenCalled()
    expect(h.approveVendor).not.toHaveBeenCalled()
  })
})

describe('decideApprovalFor — input', () => {
  it('rejects a non-uuid id', async () => {
    const h = handlers()
    expect((await decideApprovalFor('board', { kind: 'w18', id: 'nope', decision: 'approve' }, h)).ok).toBe(false)
    expect(h.approvePosting).not.toHaveBeenCalled()
  })

  it('requires a reason to reject', async () => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind: 'w18', id: ID, decision: 'reject', reason: '   ' }, h)
    expect(r).toEqual({ ok: false, error: 'A reason is required to reject.' })
    expect(h.rejectPosting).not.toHaveBeenCalled()
  })

  it('has no vendor reject (the vendor module has no such action) and no W3 decision', async () => {
    const h = handlers()
    expect((await decideApprovalFor('admin', { kind: 'vendor', id: ID, decision: 'reject', reason: 'x' }, h)).ok).toBe(false)
    expect((await decideApprovalFor('admin', { kind: 'w3', id: ID, decision: 'approve' }, h)).ok).toBe(false)
    expect(h.approveVendor).not.toHaveBeenCalled()
  })
})

describe('decideApprovalFor — dispatch to each module’s existing action', () => {
  it('W18 approve goes to the posting action and reports the posting', async () => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind: 'w18', id: ID, decision: 'approve' }, h)
    expect(h.approvePosting).toHaveBeenCalledWith(ID)
    expect(r).toEqual({ ok: true, message: 'Approved and posted to the ledger.' })
  })

  it('a second W18 approve says nothing posted again', async () => {
    const h = handlers({
      approvePosting: vi.fn(async () => ({ ok: true as const, status: 'posted' as const, resultRef: 'je', alreadyDecided: true })),
    })
    const r = await decideApprovalFor('board', { kind: 'w18', id: ID, decision: 'approve' }, h)
    expect(r).toEqual({ ok: true, message: 'Already approved — nothing was posted again.' })
  })

  it('W18 failure is passed through', async () => {
    const h = handlers({ approvePosting: vi.fn(async () => ({ ok: false as const, error: 'already matched', status: 'failed' as const })) })
    expect(await decideApprovalFor('board', { kind: 'w18', id: ID, decision: 'approve' }, h)).toEqual({
      ok: false,
      error: 'already matched',
    })
  })

  it('W18 reject passes the trimmed reason', async () => {
    const h = handlers()
    const r = await decideApprovalFor('admin', { kind: 'w18', id: ID, decision: 'reject', reason: '  wrong unit ' }, h)
    expect(h.rejectPosting).toHaveBeenCalledWith(ID, 'wrong unit')
    expect(r.ok).toBe(true)
  })

  it('vendor approve goes to approveVendor', async () => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind: 'vendor', id: ID, decision: 'approve' }, h)
    expect(h.approveVendor).toHaveBeenCalledWith(ID)
    expect(r.ok).toBe(true)
  })

  it('vendor approve failure is passed through', async () => {
    const h = handlers({ approveVendor: vi.fn(async () => ({ ok: false as const, error: 'not green' })) })
    expect(await decideApprovalFor('board', { kind: 'vendor', id: ID, decision: 'approve' }, h)).toEqual({
      ok: false,
      error: 'not green',
    })
  })
})

describe('postingHandlers', () => {
  it('wraps the approval layer: user client decides, admin client executes', async () => {
    const userDb = { tag: 'user' }
    const adminDb = { tag: 'admin' }
    approveRequest.mockResolvedValueOnce({ ok: true, status: 'posted', resultRef: 'je', alreadyDecided: false })
    rejectRequest.mockResolvedValueOnce({ ok: true, status: 'rejected', resultRef: null, alreadyDecided: false })
    const h = postingHandlers(userDb as never, adminDb as never)
    await h.approvePosting(ID)
    await h.rejectPosting(ID, 'why')
    expect(approveRequest).toHaveBeenCalledWith(userDb, adminDb, ID)
    expect(rejectRequest).toHaveBeenCalledWith(userDb, ID, 'why')
  })
})
