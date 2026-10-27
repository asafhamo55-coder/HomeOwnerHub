import { describe, expect, it, vi } from 'vitest'
import { decideApprovalFor, type InboxDecisionHandlers } from './decide'

const ID = '11111111-1111-4111-8111-111111111111'
const posted = { ok: true as const, status: 'posted' as const, resultRef: 'ref', alreadyDecided: false }
const rejected = { ok: true as const, status: 'rejected' as const, resultRef: null, alreadyDecided: false }

function handlers(over: Partial<InboxDecisionHandlers> = {}): InboxDecisionHandlers {
  const simple = vi.fn(async () => ({ ok: true as const }))
  return {
    approvePosting: vi.fn(async () => posted),
    rejectPosting: vi.fn(async () => rejected),
    approveVendor: simple,
    rejectVendor: simple,
    approveViolationDraft: vi.fn(async () => ({ ok: true as const, violationId: 'v' })),
    rejectViolationDraft: simple,
    approveBill: vi.fn(async () => posted),
    rejectBill: vi.fn(async () => rejected),
    approveLetter: vi.fn(async () => posted),
    rejectLetter: vi.fn(async () => rejected),
    approveOpening: vi.fn(async () => posted),
    rejectOpening: vi.fn(async () => rejected),
    approveContact: vi.fn(async () => ({ ok: true as const, message: 'm' })),
    rejectContact: vi.fn(async () => ({ ok: true as const, message: 'm' })),
    approveJoin: vi.fn(async () => ({ ok: true as const, message: 'm' })),
    rejectJoin: vi.fn(async () => ({ ok: true as const, message: 'm' })),
    approvePro: vi.fn(async () => posted),
    rejectPro: vi.fn(async () => rejected),
    ...over,
  }
}

describe('decideApprovalFor: professionals (BL-168)', () => {
  it('approves and rejects a pro item through its own handlers', async () => {
    const h = handlers()
    expect(await decideApprovalFor('board', { kind: 'pro', id: ID, decision: 'approve' }, h)).toMatchObject({ ok: true })
    expect(h.approvePro).toHaveBeenCalledWith(ID)
    expect(await decideApprovalFor('board', { kind: 'pro', id: ID, decision: 'reject', reason: 'Wrong period' }, h)).toMatchObject({ ok: true })
    expect(h.rejectPro).toHaveBeenCalledWith(ID, 'Wrong period')
    expect(h.approvePosting).not.toHaveBeenCalled()
  })

  it('refuses a resident and a professional before any handler, and a rejection without a reason', async () => {
    for (const role of ['resident', 'cpa', 'attorney']) {
      const h = handlers()
      expect(await decideApprovalFor(role, { kind: 'pro', id: ID, decision: 'approve' }, h)).toMatchObject({ ok: false })
      expect(h.approvePro).not.toHaveBeenCalled()
    }
    const h = handlers()
    expect(await decideApprovalFor('board', { kind: 'pro', id: ID, decision: 'reject' }, h)).toMatchObject({ ok: false })
    expect(h.rejectPro).not.toHaveBeenCalled()
  })

  it('the money gate runs before an approval of a bill or a pro item, and can stop it', async () => {
    const moneyGate = vi.fn(async () => ({ ok: true as const, message: 'Your sign-off is recorded.' }))
    const h = handlers({ moneyGate })
    expect(await decideApprovalFor('board', { kind: 'pro', id: ID, decision: 'approve' }, h)).toEqual({ ok: true, message: 'Your sign-off is recorded.' })
    expect(h.approvePro).not.toHaveBeenCalled()
    expect(await decideApprovalFor('board', { kind: 'bill', id: ID, decision: 'approve' }, h)).toMatchObject({ ok: true })
    expect(h.approveBill).not.toHaveBeenCalled()
  })

  it('the gate skips rejections and non-money kinds, and carries on when it answers null', async () => {
    const moneyGate = vi.fn(async () => null)
    const h = handlers({ moneyGate })
    await decideApprovalFor('board', { kind: 'pro', id: ID, decision: 'reject', reason: 'No' }, h)
    await decideApprovalFor('board', { kind: 'collections', id: ID, decision: 'approve' }, h)
    expect(moneyGate).not.toHaveBeenCalled()
    await decideApprovalFor('board', { kind: 'pro', id: ID, decision: 'approve' }, h)
    expect(moneyGate).toHaveBeenCalledWith(ID)
    expect(h.approvePro).toHaveBeenCalledWith(ID)
  })

  it('without a gate (M6 off) bills are approved exactly as before', async () => {
    const h = handlers()
    expect(await decideApprovalFor('board', { kind: 'bill', id: ID, decision: 'approve' }, h)).toMatchObject({ ok: true })
    expect(h.approveBill).toHaveBeenCalledWith(ID)
  })
})
