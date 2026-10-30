import { describe, expect, it, vi } from 'vitest'
import { BULK_CAP, BULK_SOURCES, approveManyFor, isBulkEligible, summarizeBulk } from './bulk'
import type { InboxDecisionHandlers } from './decide'
import type { InboxDecisionTarget } from './model'

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Every handler a bulk call must never reach throws; the two bulk ones are controllable. */
function handlers(over: Partial<InboxDecisionHandlers> = {}): InboxDecisionHandlers {
  const never = (name: string) => vi.fn(async () => {
    throw new Error(`${name} must not be called from bulk`)
  })
  return {
    approvePosting: never('approvePosting'),
    rejectPosting: never('rejectPosting'),
    approveVendor: never('approveVendor'),
    rejectVendor: never('rejectVendor'),
    approveViolationDraft: vi.fn(async () => ({ ok: true as const, violationId: 'v' })),
    rejectViolationDraft: never('rejectViolationDraft'),
    approveBill: never('approveBill'),
    rejectBill: never('rejectBill'),
    approveLetter: never('approveLetter'),
    rejectLetter: never('rejectLetter'),
    approveOpening: never('approveOpening'),
    rejectOpening: never('rejectOpening'),
    approveContact: vi.fn(async () => ({ ok: true as const, message: 'Contact details updated.' })),
    rejectContact: never('rejectContact'),
    approveJoin: never('approveJoin'),
    rejectJoin: never('rejectJoin'),
    approvePro: never('approvePro'),
    rejectPro: never('rejectPro'),
    moneyGate: never('moneyGate'),
    ...over,
  } as unknown as InboxDecisionHandlers
}

const MONEY_AND_OTHER = ['w18', 'bill', 'opening', 'pro', 'collections', 'arc', 'join', 'vendor'] as const

describe('which rows get a checkbox', () => {
  const decisions: Record<string, InboxDecisionTarget> = {
    w18: { kind: 'w18', approvalRequestId: uid(1) },
    bill: { kind: 'bill', approvalRequestId: uid(1), canApprove: true },
    opening: { kind: 'opening', approvalRequestId: uid(1) },
    pro: { kind: 'pro', approvalRequestId: uid(1) },
    collections: { kind: 'collections', approvalRequestId: uid(1) },
    arc: { kind: 'arc', runId: uid(1), arcId: uid(2) },
    join: { kind: 'join', requestId: uid(1) },
    vendor: { kind: 'vendor', vendorId: uid(1), canApprove: true },
  }

  it('never on a money source, or any source outside the bulk list', () => {
    for (const source of MONEY_AND_OTHER) {
      expect(isBulkEligible({ source, decision: decisions[source]! }), source).toBe(false)
    }
  })

  it('on a violation draft and an approvable contact update', () => {
    expect(isBulkEligible({ source: 'w3', decision: { kind: 'w3', runId: uid(1) } })).toBe(true)
    expect(isBulkEligible({ source: 'contact', decision: { kind: 'contact', ticketId: uid(1), canApprove: true } })).toBe(true)
  })

  it('not on rows with no one-click approve', () => {
    expect(isBulkEligible({ source: 'w3', decision: null })).toBe(false)
    expect(isBulkEligible({ source: 'contact', decision: { kind: 'contact', ticketId: uid(1), canApprove: false } })).toBe(false)
  })

  it('the bulk list holds no money source', () => {
    expect([...BULK_SOURCES].sort()).toEqual(['contact', 'w3'])
  })
})

describe('approveManyFor', () => {
  it('rejects money sources even with real ids injected, and never calls their handlers', async () => {
    const h = handlers()
    const out = await approveManyFor('board', Object.fromEntries(MONEY_AND_OTHER.map((s) => [s, [uid(1)]])), h)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.results).toHaveLength(MONEY_AND_OTHER.length)
    expect(out.results.every((r) => !r.ok && /one item at a time/.test(r.message))).toBe(true)
    expect(h.approvePosting).not.toHaveBeenCalled()
    expect(h.approveBill).not.toHaveBeenCalled()
  })

  it('returns per-item results for a mix of success and failure', async () => {
    const h = handlers({
      approveViolationDraft: vi.fn(async (id: string) =>
        id === uid(3) ? { ok: false as const, error: 'Someone already decided this draft.' } : { ok: true as const, violationId: 'v' },
      ),
    })
    const seen: string[] = []
    const out = await approveManyFor('board', { w3: [uid(1), uid(2), uid(3)], contact: [uid(4), 'not-a-uuid'] }, h, async (s, id) => {
      seen.push(`${s}:${id}`)
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.results.map((r) => r.ok)).toEqual([true, true, false, true, false])
    expect(out.results[2]!.message).toBe('Someone already decided this draft.')
    expect(seen).toEqual([`w3:${uid(1)}`, `w3:${uid(2)}`, `contact:${uid(4)}`])
    const sum = summarizeBulk(out.results)
    expect(sum).toMatchObject({ approved: 3, failed: 2 })
    expect(sum.text).toBe('3 approved, 2 could not be approved: Someone already decided this draft. (1 other reason)')
  })

  it('says it plainly when one fails', () => {
    expect(summarizeBulk([{ source: 'w3', id: 'a', ok: true, message: '' }, { source: 'w3', id: 'b', ok: false, message: 'Gone.' }]).text).toBe(
      '1 approved, 1 could not be approved: Gone.',
    )
  })

  it('approves the cap and refuses one more, touching nothing', async () => {
    const ids = Array.from({ length: BULK_CAP }, (_, i) => uid(i + 1))
    const ok = await approveManyFor('board', { w3: ids }, handlers())
    expect(ok.ok && ok.results.length).toBe(BULK_CAP)

    const h = handlers()
    const over = await approveManyFor('board', { w3: [...ids, uid(999)] }, h)
    expect(over).toEqual({ ok: false, error: `Select at most ${BULK_CAP} items at a time. You selected ${BULK_CAP + 1}.` })
    expect(h.approveViolationDraft).not.toHaveBeenCalled()
  })

  it('counts across sources and ignores duplicates', async () => {
    const h = handlers()
    const out = await approveManyFor('board', { w3: [uid(1), uid(1)] }, h)
    expect(out.ok && out.results.length).toBe(1)
    const over = await approveManyFor('board', { w3: Array.from({ length: 30 }, (_, i) => uid(i + 1)), contact: Array.from({ length: 21 }, (_, i) => uid(i + 100)) }, h)
    expect(over.ok).toBe(false)
  })

  it('re-checks the role for every item: a resident approves nothing', async () => {
    for (const role of ['resident', null, undefined, 'vendor']) {
      const h = handlers()
      const out = await approveManyFor(role, { w3: [uid(1), uid(2)], contact: [uid(3)] }, h)
      expect(out.ok).toBe(true)
      if (!out.ok) continue
      expect(out.results.every((r) => !r.ok && /board members and admins/.test(r.message))).toBe(true)
      expect(h.approveViolationDraft).not.toHaveBeenCalled()
      expect(h.approveContact).not.toHaveBeenCalled()
    }
  })

  it('refuses an empty or malformed selection', async () => {
    expect((await approveManyFor('board', {}, handlers())).ok).toBe(false)
    expect((await approveManyFor('board', { w3: 'x' }, handlers())).ok).toBe(false)
    expect((await approveManyFor('board', null, handlers())).ok).toBe(false)
  })

  it('a handler that throws fails that item only; the rest still run', async () => {
    const h = handlers({
      approveViolationDraft: vi.fn(async (id: string) => {
        if (id === uid(1)) throw new Error('db down')
        return { ok: true as const, violationId: 'v' }
      }),
    })
    const out = await approveManyFor('board', { w3: [uid(1), uid(2)] }, h)
    expect(out.ok && out.results.map((r) => r.ok)).toEqual([false, true])
  })
})
