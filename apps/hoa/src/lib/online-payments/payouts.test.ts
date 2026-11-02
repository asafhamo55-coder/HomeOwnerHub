import { describe, expect, it, vi } from 'vitest'

const flag = vi.hoisted(() => ({ on: true }))
vi.mock('@homeowner-portal/db/m8', () => ({
  get M8_APPLIED() {
    return flag.on
  },
}))

import {
  associationBorneFeeCents,
  businessDaysBetween,
  clearingIsStale,
  handlePayoutEvent,
  matchPayoutToBankLine,
  matchPendingPayouts,
  payoutsMissingFromBank,
  type BankLine,
  type PayoutBalanceLine,
  type PayoutPorts,
  type PayoutRow,
} from './payouts'

const ARRIVAL = '2026-11-04'
const arrivalUnix = Date.parse(`${ARRIVAL}T00:00:00Z`) / 1000

function fake(opts: { lines?: PayoutBalanceLine[]; bank?: BankLine[]; payers?: Record<string, 'association' | 'homeowner'> } = {}) {
  const rows = new Map<string, PayoutRow>()
  const posted: Array<{ clearingCents: number; feeCents: number; bank: string }> = []
  const bank = opts.bank ?? []
  const ports: PayoutPorts = {
    resolveAssociation: async (acct) => (acct === 'acct_1' ? { associationId: 'a1', organizationId: 'o1' } : null),
    listPayoutBalanceLines: async () => opts.lines ?? [],
    feePayersByCharge: async (_a, ids) => new Map(ids.filter((i) => opts.payers?.[i]).map((i) => [i, opts.payers![i]])),
    upsertPayout: async (r) => {
      const prev = rows.get(r.stripePayoutId)
      const row: PayoutRow = { ...r, id: `row_${r.stripePayoutId}`, bankTransactionId: prev?.bankTransactionId ?? null }
      rows.set(r.stripePayoutId, row)
      return row
    },
    findBankCandidates: async (_a, amt) => bank.filter((b) => b.amountCents === amt),
    claimPayout: async (id, txn) => {
      const row = [...rows.values()].find((r) => r.id === id)!
      if (row.bankTransactionId) return false
      row.bankTransactionId = txn
      return true
    },
    releasePayout: async (id) => {
      const row = [...rows.values()].find((r) => r.id === id)!
      row.bankTransactionId = null
    },
    postMatch: async (a) => {
      posted.push({ clearingCents: a.clearingCents, feeCents: a.feeCents, bank: a.bankTransactionId })
      return { ok: true }
    },
    listUnmatchedPaid: async () => [...rows.values()].filter((r) => r.status === 'paid' && !r.bankTransactionId),
  }
  return { ports, rows, posted }
}

const ev = (type: string, amount = 25_000, id = 'po_1') => ({
  type,
  account: 'acct_1',
  data: { object: { id, amount, arrival_date: arrivalUnix, status: type === 'payout.paid' ? 'paid' : 'failed' } },
})

describe('matchPayoutToBankLine', () => {
  const payout = { amountCents: 25_000, arrivalDate: ARRIVAL }
  it('matches the same amount inside the window and nothing outside it', () => {
    expect(matchPayoutToBankLine(payout, [{ id: 'b1', amountCents: 25_000, postedDate: '2026-11-07' }])?.id).toBe('b1')
    expect(matchPayoutToBankLine(payout, [{ id: 'b1', amountCents: 25_000, postedDate: '2026-11-08' }])).toBeNull()
    expect(matchPayoutToBankLine(payout, [{ id: 'b1', amountCents: 25_001, postedDate: ARRIVAL }])).toBeNull()
  })
  it('prefers the nearest date, then the earlier posting, then the lower id', () => {
    const near = matchPayoutToBankLine(payout, [
      { id: 'far', amountCents: 25_000, postedDate: '2026-11-07' },
      { id: 'near', amountCents: 25_000, postedDate: '2026-11-05' },
    ])
    expect(near?.id).toBe('near')
    const early = matchPayoutToBankLine(payout, [
      { id: 'late', amountCents: 25_000, postedDate: '2026-11-05' },
      { id: 'early', amountCents: 25_000, postedDate: '2026-11-03' },
    ])
    expect(early?.id).toBe('early')
    const byId = matchPayoutToBankLine(payout, [
      { id: 'b', amountCents: 25_000, postedDate: ARRIVAL },
      { id: 'a', amountCents: 25_000, postedDate: ARRIVAL },
    ])
    expect(byId?.id).toBe('a')
  })
})

describe('associationBorneFeeCents', () => {
  const lines: PayoutBalanceLine[] = [
    { type: 'charge', chargeId: 'ch_a', feeCents: 245 },
    { type: 'payment', chargeId: 'ch_h', feeCents: 925 },
    { type: 'charge', chargeId: 'ch_unknown', feeCents: 100 },
    { type: 'refund', chargeId: 'ch_a', feeCents: 50 },
    { type: 'payout', chargeId: null, feeCents: 0 },
  ]
  it('expenses only association-paid fees, plus unknown charges, never homeowner-paid or refund lines', () => {
    const payers = new Map<string, 'association' | 'homeowner'>([
      ['ch_a', 'association'],
      ['ch_h', 'homeowner'],
    ])
    expect(associationBorneFeeCents(lines, payers)).toBe(345)
  })
})

describe('handlePayoutEvent', () => {
  it('does nothing while M8_APPLIED is false', async () => {
    flag.on = false
    const f = fake()
    expect(await handlePayoutEvent(ev('payout.paid'), f.ports)).toBe('ignored_flag_off')
    expect(f.rows.size).toBe(0)
    expect(await matchPendingPayouts('a1', f.ports)).toEqual({ checked: 0, matched: 0 })
    flag.on = true
  })

  it('ignores an unknown connected account and other event types', async () => {
    const f = fake()
    expect(await handlePayoutEvent({ ...ev('payout.paid'), account: 'acct_x' }, f.ports)).toBe('ignored_unknown_account')
    expect(await handlePayoutEvent(ev('payout.created'), f.ports)).toBe('ignored_event')
    expect(f.rows.size).toBe(0)
  })

  it('records a failed payout without touching the books', async () => {
    const f = fake({ bank: [{ id: 'b1', amountCents: 25_000, postedDate: ARRIVAL }] })
    expect(await handlePayoutEvent(ev('payout.failed'), f.ports)).toBe('failed_recorded')
    expect(f.rows.get('po_1')?.status).toBe('failed')
    expect(f.posted).toHaveLength(0)
  })

  it('posts clearing = deposit + association fees, once, even when the event is replayed', async () => {
    const f = fake({
      lines: [{ type: 'charge', chargeId: 'ch_a', feeCents: 245 }],
      payers: { ch_a: 'association' },
      bank: [{ id: 'b1', amountCents: 25_000, postedDate: '2026-11-05' }],
    })
    expect(await handlePayoutEvent(ev('payout.paid'), f.ports)).toBe('matched')
    expect(await handlePayoutEvent(ev('payout.paid'), f.ports)).toBe('already_matched')
    expect(f.posted).toEqual([{ clearingCents: 25_245, feeCents: 245, bank: 'b1' }])
  })

  it('homeowner-paid fees add no expense: clearing equals the deposit', async () => {
    const f = fake({
      lines: [{ type: 'charge', chargeId: 'ch_h', feeCents: 925 }],
      payers: { ch_h: 'homeowner' },
      bank: [{ id: 'b1', amountCents: 25_000, postedDate: ARRIVAL }],
    })
    await handlePayoutEvent(ev('payout.paid'), f.ports)
    expect(f.posted[0]).toMatchObject({ clearingCents: 25_000, feeCents: 0 })
  })

  it('keeps an unmatched payout, then matches it when the deposit shows up', async () => {
    const bank: BankLine[] = []
    const f = fake({ bank })
    expect(await handlePayoutEvent(ev('payout.paid'), f.ports)).toBe('recorded_unmatched')
    bank.push({ id: 'b9', amountCents: 25_000, postedDate: '2026-11-06' })
    expect(await matchPendingPayouts('a1', f.ports)).toEqual({ checked: 1, matched: 1 })
    expect(await matchPendingPayouts('a1', f.ports)).toEqual({ checked: 0, matched: 0 })
  })

  it('releases the claim and throws when posting fails, so Stripe redelivers', async () => {
    const f = fake({ bank: [{ id: 'b1', amountCents: 25_000, postedDate: ARRIVAL }] })
    f.ports.postMatch = async () => ({ ok: false, error: 'books_not_open' })
    await expect(handlePayoutEvent(ev('payout.paid'), f.ports)).rejects.toThrow('books_not_open')
    expect(f.rows.get('po_1')?.bankTransactionId).toBeNull()
  })
})

describe('board alerts', () => {
  it('counts business days', () => {
    expect(businessDaysBetween('2026-11-02', '2026-11-09')).toBe(5)
    expect(businessDaysBetween('2026-11-06', '2026-11-08')).toBe(0)
  })
  it('flags a paid payout missing from the bank feed after 5 business days', () => {
    const base = { id: 'r', organizationId: 'o', associationId: 'a', stripeAccountId: 's', stripePayoutId: 'po_1', amountCents: 1, feeCents: 0, status: 'paid', bankTransactionId: null } as const
    expect(payoutsMissingFromBank([{ ...base, arrivalDate: '2026-11-02' }], '2026-11-09')).toHaveLength(0)
    expect(payoutsMissingFromBank([{ ...base, arrivalDate: '2026-11-02' }], '2026-11-10')).toHaveLength(1)
    expect(payoutsMissingFromBank([{ ...base, arrivalDate: '2026-11-02', bankTransactionId: 'b' }], '2026-12-10')).toHaveLength(0)
  })
  it('flags clearing that stayed non-zero more than 10 days', () => {
    expect(clearingIsStale(0, '2026-10-01', '2026-11-02')).toBe(false)
    expect(clearingIsStale(500, '2026-10-23', '2026-11-02')).toBe(false)
    expect(clearingIsStale(500, '2026-10-22', '2026-11-02')).toBe(true)
  })
})
