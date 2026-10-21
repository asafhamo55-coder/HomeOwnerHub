import { describe, expect, it, vi } from 'vitest'

const { approveRequest, rejectRequest, w18Executor } = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
  w18Executor: vi.fn(),
}))
vi.mock('@homeowner-portal/workflows', () => ({
  approveRequest,
  rejectRequest,
  W18_CASH_RECEIPT: 'w18.cash_receipt',
  APPROVAL_EXECUTORS: { 'w18.cash_receipt': w18Executor },
}))

import { billHandlers, decideApprovalFor, letterHandlers, openingHandlers, postingHandlers, type InboxDecisionHandlers } from './decide'
import { letterExecutor } from '../collections/letters/executor'
import { openingExecutor } from '../accounting/opening-balances/executor'

const ID = '11111111-1111-4111-8111-111111111111'

function handlers(over: Partial<InboxDecisionHandlers> = {}): InboxDecisionHandlers {
  return {
    approvePosting: vi.fn(async () => ({ ok: true as const, status: 'posted' as const, resultRef: 'je', alreadyDecided: false })),
    rejectPosting: vi.fn(async () => ({ ok: true as const, status: 'rejected' as const, resultRef: null, alreadyDecided: false })),
    approveVendor: vi.fn(async () => ({ ok: true as const })),
    rejectVendor: vi.fn(async () => ({ ok: true as const })),
    approveViolationDraft: vi.fn(async () => ({ ok: true as const, violationId: 'v1' })),
    rejectViolationDraft: vi.fn(async () => ({ ok: true as const })),
    approveBill: vi.fn(async () => ({ ok: true as const, status: 'posted' as const, resultRef: 'inv', alreadyDecided: false })),
    rejectBill: vi.fn(async () => ({ ok: true as const, status: 'rejected' as const, resultRef: null, alreadyDecided: false })),
    approveLetter: vi.fn(async () => ({ ok: true as const, status: 'posted' as const, resultRef: 'case', alreadyDecided: false })),
    rejectLetter: vi.fn(async () => ({ ok: true as const, status: 'rejected' as const, resultRef: null, alreadyDecided: false })),
    approveOpening: vi.fn(async () => ({ ok: true as const, status: 'posted' as const, resultRef: 'je', alreadyDecided: false })),
    rejectOpening: vi.fn(async () => ({ ok: true as const, status: 'rejected' as const, resultRef: null, alreadyDecided: false })),
    approveContact: vi.fn(async () => ({ ok: true as const, message: 'Contact details updated: phone.' })),
    rejectContact: vi.fn(async () => ({ ok: true as const, message: 'Rejected. Nothing on file changed; the resident sees your reason.' })),
    approveJoin: vi.fn(async () => ({ ok: true as const, message: 'Approved.' })),
    rejectJoin: vi.fn(async () => ({ ok: true as const, message: 'Request rejected.' })),
    ...over,
  }
}

describe('decideApprovalFor — role gate', () => {
  it.each(['resident', null, 'owner'])('refuses %s before touching any module action', async (role) => {
    const h = handlers()
    for (const kind of ['w18', 'bill', 'opening', 'w3', 'collections', 'vendor', 'contact'] as const) {
      for (const decision of ['approve', 'reject'] as const) {
        const r = await decideApprovalFor(role, { kind, id: ID, decision, reason: 'x' }, h)
        expect(r.ok).toBe(false)
      }
    }
    for (const fn of Object.values(h)) expect(fn).not.toHaveBeenCalled()
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

  it.each(['w3', 'vendor'] as const)('requires a reason to reject a %s item too', async (kind) => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind, id: ID, decision: 'reject' }, h)
    expect(r).toEqual({ ok: false, error: 'A reason is required to reject.' })
    expect(h.rejectVendor).not.toHaveBeenCalled()
    expect(h.rejectViolationDraft).not.toHaveBeenCalled()
  })

  it('refuses an unknown kind', async () => {
    const h = handlers()
    expect((await decideApprovalFor('admin', { kind: 'w99', id: ID, decision: 'approve' }, h)).ok).toBe(false)
  })
})

describe('decideApprovalFor — contact updates (PR-10)', () => {
  it('approve goes to approveContact and passes its message through', async () => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind: 'contact', id: ID, decision: 'approve' }, h)
    expect(h.approveContact).toHaveBeenCalledWith(ID)
    expect(r).toEqual({ ok: true, message: 'Contact details updated: phone.' })
  })
  it('reject needs a reason and passes it on', async () => {
    const h = handlers()
    expect(await decideApprovalFor('board', { kind: 'contact', id: ID, decision: 'reject' }, h)).toEqual({ ok: false, error: 'A reason is required to reject.' })
    expect(h.rejectContact).not.toHaveBeenCalled()
    await decideApprovalFor('admin', { kind: 'contact', id: ID, decision: 'reject', reason: ' Call us. ' }, h)
    expect(h.rejectContact).toHaveBeenCalledWith(ID, 'Call us.')
  })
  it('a refusal from the module is the answer', async () => {
    const h = handlers({ approveContact: vi.fn(async () => ({ ok: false as const, error: 'Someone already handled this request.' })) })
    expect(await decideApprovalFor('board', { kind: 'contact', id: ID, decision: 'approve' }, h)).toEqual({ ok: false, error: 'Someone already handled this request.' })
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

describe('decideApprovalFor — W3 letters and vendor reject (BL-048)', () => {
  it('W3 approve goes to the violation module’s draft approval and says nothing was sent', async () => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind: 'w3', id: ID, decision: 'approve' }, h)
    expect(h.approveViolationDraft).toHaveBeenCalledWith(ID)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.message).toMatch(/nothing was sent/i)
  })

  it('W3 approve failure is passed through', async () => {
    const h = handlers({ approveViolationDraft: vi.fn(async () => ({ ok: false as const, error: 'already decided' })) })
    expect(await decideApprovalFor('board', { kind: 'w3', id: ID, decision: 'approve' }, h)).toEqual({
      ok: false,
      error: 'already decided',
    })
  })

  it('W3 reject passes the trimmed reason', async () => {
    const h = handlers()
    const r = await decideApprovalFor('admin', { kind: 'w3', id: ID, decision: 'reject', reason: ' wrong lot ' }, h)
    expect(h.rejectViolationDraft).toHaveBeenCalledWith(ID, 'wrong lot')
    expect(h.approveViolationDraft).not.toHaveBeenCalled()
    expect(r.ok).toBe(true)
  })

  it('vendor reject goes to rejectVendor with the trimmed reason', async () => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind: 'vendor', id: ID, decision: 'reject', reason: ' no license ' }, h)
    expect(h.rejectVendor).toHaveBeenCalledWith(ID, 'no license')
    expect(h.approveVendor).not.toHaveBeenCalled()
    expect(r.ok).toBe(true)
  })

  it('vendor reject failure is passed through', async () => {
    const h = handlers({ rejectVendor: vi.fn(async () => ({ ok: false as const, error: 'not a prospect' })) })
    expect(await decideApprovalFor('board', { kind: 'vendor', id: ID, decision: 'reject', reason: 'x' }, h)).toEqual({
      ok: false,
      error: 'not a prospect',
    })
  })
})

describe('postingHandlers', () => {
  const kindDb = (actionType: string | null) => ({
    tag: 'user',
    from: () => {
      const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: actionType ? { action_type: actionType } : null, error: null }) }
      return b
    },
  })

  it('wraps the approval layer: user client decides, admin client executes, W18 executor only', async () => {
    const userDb = kindDb('w18.cash_receipt')
    const adminDb = { tag: 'admin' }
    approveRequest.mockResolvedValueOnce({ ok: true, status: 'posted', resultRef: 'je', alreadyDecided: false })
    rejectRequest.mockResolvedValueOnce({ ok: true, status: 'rejected', resultRef: null, alreadyDecided: false })
    const h = postingHandlers(userDb as never, adminDb as never)
    await h.approvePosting(ID)
    await h.rejectPosting(ID, 'why')
    expect(approveRequest).toHaveBeenCalledWith(userDb, adminDb, ID, { 'w18.cash_receipt': w18Executor })
    expect(rejectRequest).toHaveBeenCalledWith(userDb, ID, 'why')
  })

  it.each([['w36.ap_bill'], ['accounting.opening_balances'], ['collections.letter'], [null]])(
    'SEC-N8: refuses a request that is not a W18 match (%s) before deciding it',
    async (t) => {
      approveRequest.mockClear()
      rejectRequest.mockClear()
      const h = postingHandlers(kindDb(t) as never, {} as never)
      expect((await h.approvePosting(ID)).ok).toBe(false)
      expect((await h.rejectPosting(ID, 'x')).ok).toBe(false)
      expect(approveRequest).not.toHaveBeenCalled()
      expect(rejectRequest).not.toHaveBeenCalled()
    },
  )
})

describe('decideApprovalFor — scanned bills (BL-021)', () => {
  it('approve goes to the bill handler and says the bill was entered', async () => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind: 'bill', id: ID, decision: 'approve' }, h)
    expect(h.approveBill).toHaveBeenCalledWith(ID)
    expect(h.approvePosting).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: true, message: 'Approved. The bill is entered and posted to accounts payable.' })
  })

  it('a second approve says nothing was entered again', async () => {
    const h = handlers({
      approveBill: vi.fn(async () => ({ ok: true as const, status: 'posted' as const, resultRef: 'inv', alreadyDecided: true })),
    })
    expect(await decideApprovalFor('board', { kind: 'bill', id: ID, decision: 'approve' }, h)).toEqual({
      ok: true,
      message: 'Already approved — the bill was not entered again.',
    })
  })

  it('an executor refusal is passed through', async () => {
    const h = handlers({ approveBill: vi.fn(async () => ({ ok: false as const, error: 'missing the total', status: 'failed' as const })) })
    expect(await decideApprovalFor('board', { kind: 'bill', id: ID, decision: 'approve' }, h)).toEqual({
      ok: false,
      error: 'missing the total',
    })
  })

  it('reject records the trimmed reason and enters nothing', async () => {
    const h = handlers()
    const r = await decideApprovalFor('admin', { kind: 'bill', id: ID, decision: 'reject', reason: ' duplicate ' }, h)
    expect(h.rejectBill).toHaveBeenCalledWith(ID, 'duplicate')
    expect(h.approveBill).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: true, message: 'Rejected. Nothing was entered in accounting.' })
  })

  it('reject needs a reason', async () => {
    const h = handlers()
    expect((await decideApprovalFor('board', { kind: 'bill', id: ID, decision: 'reject' }, h)).ok).toBe(false)
    expect(h.rejectBill).not.toHaveBeenCalled()
  })
})

describe('billHandlers', () => {
  function userDb(actionType: string | null, error: unknown = null) {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: actionType ? { action_type: actionType } : null, error }),
    }
    return { from: vi.fn(() => q) }
  }
  const executor = vi.fn()

  it('approves through the approval layer with ONLY the bill executor', async () => {
    const u = userDb('w36.ap_bill')
    const adminDb = { tag: 'admin' }
    approveRequest.mockResolvedValueOnce({ ok: true, status: 'posted', resultRef: 'inv', alreadyDecided: false })
    const r = await billHandlers(u as never, adminDb as never, executor).approveBill(ID)
    expect(r.ok).toBe(true)
    expect(approveRequest).toHaveBeenCalledWith(u, adminDb, ID, { 'w36.ap_bill': executor })
  })

  it('rejects through the approval layer', async () => {
    const u = userDb('w36.ap_bill')
    rejectRequest.mockResolvedValueOnce({ ok: true, status: 'rejected', resultRef: null, alreadyDecided: false })
    await billHandlers(u as never, {} as never, executor).rejectBill(ID, 'why')
    expect(rejectRequest).toHaveBeenCalledWith(u, ID, 'why')
  })

  it.each([['w18.cash_receipt'], [null]])('refuses a request that is not a scanned bill (%s) before deciding it', async (t) => {
    const h = billHandlers(userDb(t) as never, {} as never, executor)
    expect((await h.approveBill(ID)).ok).toBe(false)
    expect((await h.rejectBill(ID, 'x')).ok).toBe(false)
    expect(approveRequest).not.toHaveBeenCalled()
    expect(rejectRequest).not.toHaveBeenCalled()
  })

  it('refuses when the kind check fails to load', async () => {
    const h = billHandlers(userDb(null, { code: '500' }) as never, {} as never, executor)
    expect((await h.approveBill(ID)).ok).toBe(false)
    expect(approveRequest).not.toHaveBeenCalled()
  })
})

describe('decideApprovalFor — collections letters (BL-089)', () => {
  it('approve goes to approveLetter and says nothing was sent', async () => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind: 'collections', id: ID, decision: 'approve' }, h)
    expect(h.approveLetter).toHaveBeenCalledWith(ID)
    expect(h.approvePosting).not.toHaveBeenCalled()
    expect(r.ok && r.message).toContain('Nothing was sent')
  })

  it('reject needs a reason and passes it on trimmed', async () => {
    const h = handlers()
    expect((await decideApprovalFor('board', { kind: 'collections', id: ID, decision: 'reject' }, h)).ok).toBe(false)
    expect(h.rejectLetter).not.toHaveBeenCalled()
    const r = await decideApprovalFor('admin', { kind: 'collections', id: ID, decision: 'reject', reason: ' paid Friday ' }, h)
    expect(h.rejectLetter).toHaveBeenCalledWith(ID, 'paid Friday')
    expect(r).toEqual({ ok: true, message: 'Letter rejected. Nothing was sent.' })
  })
})

describe('letterHandlers', () => {
  function userDb(actionType: string | null, error: unknown = null) {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: actionType ? { action_type: actionType } : null, error }),
    }
    return { from: vi.fn(() => q) }
  }

  it('approves through the approval layer with ONLY the letter executor', async () => {
    const u = userDb('collections.letter')
    const adminDb = { tag: 'admin' }
    approveRequest.mockResolvedValueOnce({ ok: true, status: 'posted', resultRef: 'case', alreadyDecided: false })
    const r = await letterHandlers(u as never, adminDb as never).approveLetter(ID)
    expect(r.ok).toBe(true)
    expect(approveRequest).toHaveBeenCalledWith(u, adminDb, ID, { 'collections.letter': letterExecutor })
  })

  it.each([['w36.ap_bill'], ['w18.cash_receipt'], [null]])('refuses a request that is not a letter (%s) before deciding it', async (t) => {
    approveRequest.mockClear()
    rejectRequest.mockClear()
    const h = letterHandlers(userDb(t) as never, {} as never)
    expect((await h.approveLetter(ID)).ok).toBe(false)
    expect((await h.rejectLetter(ID, 'x')).ok).toBe(false)
    expect(approveRequest).not.toHaveBeenCalled()
    expect(rejectRequest).not.toHaveBeenCalled()
  })
})

describe('opening balances (BL-126)', () => {
  function userDb(actionType: string | null) {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: actionType ? { action_type: actionType } : null, error: null }),
    }
    return { from: vi.fn(() => q) }
  }

  it('decideApprovalFor routes opening approvals to approveOpening only', async () => {
    const h = handlers()
    const r = await decideApprovalFor('board', { kind: 'opening', id: ID, decision: 'approve' }, h)
    expect(h.approveOpening).toHaveBeenCalledWith(ID)
    expect(h.approvePosting).not.toHaveBeenCalled()
    expect(r.ok && r.message).toMatch(/opening journal entry is posted/)
    const rej = await decideApprovalFor('admin', { kind: 'opening', id: ID, decision: 'reject', reason: ' wrong date ' }, h)
    expect(h.rejectOpening).toHaveBeenCalledWith(ID, 'wrong date')
    expect(rej.ok && rej.message).toMatch(/Nothing was posted/)
  })

  it('approves through the approval layer with ONLY the opening-balance executor', async () => {
    approveRequest.mockClear()
    const u = userDb('accounting.opening_balances')
    const adminDb = { tag: 'admin' }
    approveRequest.mockResolvedValueOnce({ ok: true, status: 'posted', resultRef: 'je', alreadyDecided: false })
    expect((await openingHandlers(u as never, adminDb as never).approveOpening(ID)).ok).toBe(true)
    expect(approveRequest).toHaveBeenCalledWith(u, adminDb, ID, { 'accounting.opening_balances': openingExecutor })
  })

  it.each([['w18.cash_receipt'], ['collections.letter'], [null]])('refuses a request that is not an opening balance (%s) before deciding it', async (t) => {
    approveRequest.mockClear()
    rejectRequest.mockClear()
    const h = openingHandlers(userDb(t) as never, {} as never)
    expect((await h.approveOpening(ID)).ok).toBe(false)
    expect((await h.rejectOpening(ID, 'x')).ok).toBe(false)
    expect(approveRequest).not.toHaveBeenCalled()
    expect(rejectRequest).not.toHaveBeenCalled()
  })
})

describe('decideApprovalFor — BL-143 join requests', () => {
  it('approve and reject go to the join handlers only', async () => {
    const h = handlers()
    expect(await decideApprovalFor('board', { kind: 'join', id: ID, decision: 'approve' }, h)).toEqual({ ok: true, message: 'Approved.' })
    expect(h.approveJoin).toHaveBeenCalledWith(ID)
    expect(await decideApprovalFor('admin', { kind: 'join', id: ID, decision: 'reject', reason: ' Not on file ' }, h)).toEqual({
      ok: true,
      message: 'Request rejected.',
    })
    expect(h.rejectJoin).toHaveBeenCalledWith(ID, 'Not on file')
    expect(h.approvePosting).not.toHaveBeenCalled()
    expect(h.approveContact).not.toHaveBeenCalled()
  })

  it('a resident is refused, and a reject without a reason never reaches the handler', async () => {
    const h = handlers()
    expect((await decideApprovalFor('resident', { kind: 'join', id: ID, decision: 'approve' }, h)).ok).toBe(false)
    expect((await decideApprovalFor('board', { kind: 'join', id: ID, decision: 'reject', reason: ' ' }, h)).ok).toBe(false)
    expect(h.approveJoin).not.toHaveBeenCalled()
    expect(h.rejectJoin).not.toHaveBeenCalled()
  })
})
