import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BL-163: the board's "Record payment" across a Georgia home's charges.
// Reads and writes go through a fake client; markAssessmentPaid is a spy,
// so what is asserted is the split, the order of the calls, the refusals
// and what the audit row carries.

const UNIT = '11111111-1111-4111-8111-111111111111'
const A = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  state: 'GA' as string | null,
  governing: null as string | null,
  unitFound: true,
  charges: [] as Array<{ id: string; assessment_type: string; due_date: string; amount: number; payments: Array<{ amount: number }> }>,
  installments: [] as string[],
  installmentsFail: false,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }>,
  paid: vi.fn(async (_i: unknown): Promise<Record<string, unknown>> => ({ ok: true })),
}))

// M7_APPLIED is true in production. This file covers the sequential
// (flag OFF) path; the atomic-RPC path is lump-payment-rpc.test.ts.
vi.mock('@homeowner-portal/db/m7', () => ({ M7_APPLIED: false }))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/vendors', () => ({
  getPrimaryAssociation: vi.fn(async () => ({ id: 'assoc-1', name: 'Test', timeZone: 'America/New_York' })),
}))
vi.mock('@/lib/assessments', () => ({ markAssessmentPaid: (i: unknown) => h.paid(i) }))
vi.mock('@homeowner-portal/workflows/payment-plans', () => ({
  loadInstallments: vi.fn(async () => {
    if (h.installmentsFail) throw new Error('boom')
    return h.installments.map((assessmentId) => ({ assessmentId }))
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let patch: Record<string, unknown> | null = null
      const result = () => {
        if (patch) {
          h.updates.push({ table, patch, filters: { ...filters } })
          return { data: null, error: null }
        }
        if (table === 'associations') return { data: [{ state: h.state, governing_law_state: h.governing }], error: null }
        if (table === 'units') return { data: h.unitFound ? { id: UNIT } : null, error: null }
        if (table === 'assessments') return { data: h.charges, error: null }
        return { data: [], error: null }
      }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'is', 'order', 'range', 'in']) q[m] = () => q
      q.eq = (k: string, v: unknown) => {
        filters[k] = v
        return q
      }
      q.update = (p: Record<string, unknown>) => {
        patch = p
        return q
      }
      q.insert = async (row: Record<string, unknown>) => {
        h.inserts.push({ table, row })
        return { error: null }
      }
      q.maybeSingle = async () => result()
      q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej)
      return q
    },
  })),
}))

import { BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { previewLumpPayment, recordLumpPayment } from './lump-payment-actions'
import { expectedOf } from './lump-payment'

const charge = (id: string, type: string, due: string, amount: number, paid = 0) => ({
  id,
  assessment_type: type,
  due_date: due,
  amount,
  payments: paid ? [{ amount: paid }] : [],
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2027-03-15T17:00:00Z'))
  h.role = 'board'
  h.state = 'GA'
  h.governing = null
  h.unitFound = true
  h.installments = []
  h.installmentsFail = false
  h.inserts = []
  h.updates = []
  h.paid.mockClear()
  h.paid.mockImplementation(async () => ({ ok: true }))
  h.charges = [
    charge(A(1), 'fine', '2027-01-05', 50),
    charge(A(2), 'regular', '2027-02-01', 100),
    charge(A(3), 'regular', '2027-01-01', 100, 40), // 60 left
    charge(A(4), 'regular', '2027-04-01', 100), // not yet due
  ]
})
afterEach(() => vi.useRealTimers())

describe('previewLumpPayment', () => {
  it('splits dues first, then the fine, with the statute’s words, and leaves future charges alone', async () => {
    const r = await previewLumpPayment({ unitId: UNIT, amount: 200 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.preview.mode).toBe('ga_statutory')
    expect(r.preview.lines.map((l) => [l.chargeId, l.appliedCents, l.tier, l.tierQuote])).toEqual([
      [A(3), 6000, 1, 'Regular assessments or dues until current'],
      [A(2), 10000, 1, 'Regular assessments or dues until current'],
      [A(1), 4000, 3, 'Specific assessments until current'],
    ])
    expect(r.preview.eligibleCents).toBe(6000 + 10000 + 5000)
    expect(r.preview.unappliedCents).toBe(0)
    expect(h.paid).not.toHaveBeenCalled()
    expect(h.inserts).toEqual([])
  })
  it('shows unapplied credit when the amount is more than is due', async () => {
    const r = await previewLumpPayment({ unitId: UNIT, amount: 500 })
    expect(r.ok && r.preview.unappliedCents).toBe(50000 - 21000)
  })
  it('before 2027-01-01 it is oldest due first', async () => {
    vi.setSystemTime(new Date('2026-12-31T17:00:00Z'))
    h.charges = [charge(A(1), 'fine', '2026-11-05', 50), charge(A(2), 'regular', '2026-12-01', 100)]
    const r = await previewLumpPayment({ unitId: UNIT, amount: 50 })
    expect(r.ok && r.preview.mode).toBe('oldest_first')
    expect(r.ok && r.preview.lines.map((l) => l.chargeId)).toEqual([A(1)])
    expect(r.ok && r.preview.citation).toBeNull()
  })
  it('flags a payment-plan installment as ask your attorney', async () => {
    h.charges = [charge(A(1), 'special', '2027-01-05', 50), charge(A(2), 'regular', '2027-02-01', 100)]
    h.installments = [A(1)]
    const r = await previewLumpPayment({ unitId: UNIT, amount: 150 })
    expect(r.ok && r.preview.lines.map((l) => l.chargeId)).toEqual([A(2), A(1)])
    expect(r.ok && r.preview.ambiguities.map((a) => [a.code, a.flag])).toEqual([['plan_installment', 'Ask your attorney']])
  })
  it('refuses outside Georgia, for the governing-law state, for a foreign unit and for bad input', async () => {
    h.state = 'FL'
    expect((await previewLumpPayment({ unitId: UNIT, amount: 10 })).ok).toBe(false)
    h.state = 'FL'
    h.governing = 'GA'
    expect((await previewLumpPayment({ unitId: UNIT, amount: 10 })).ok).toBe(true)
    h.unitFound = false
    expect((await previewLumpPayment({ unitId: UNIT, amount: 10 })).ok).toBe(false)
    h.unitFound = true
    for (const amount of [0, -1, 10.005, NaN]) expect((await previewLumpPayment({ unitId: UNIT, amount })).ok).toBe(false)
    expect((await previewLumpPayment({ unitId: 'nope', amount: 10 })).ok).toBe(false)
  })
  it('a failed installment read refuses instead of guessing', async () => {
    h.installmentsFail = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await previewLumpPayment({ unitId: UNIT, amount: 10 })).ok).toBe(false)
  })
  it('refuses a resident before any read', async () => {
    h.role = 'resident'
    expect(await previewLumpPayment({ unitId: UNIT, amount: 10 })).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
  })
})

async function expectedFor(amount: number) {
  const p = await previewLumpPayment({ unitId: UNIT, amount })
  if (!p.ok) throw new Error('preview failed')
  return expectedOf(p.preview)
}

describe('recordLumpPayment', () => {
  it('posts each part through markAssessmentPaid in the statute’s order, closes cleared charges and writes an ids-and-codes audit row', async () => {
    const expected = await expectedFor(200)
    const r = await recordLumpPayment({ unitId: UNIT, amount: 200, paymentMethod: 'check', expected })
    expect(r).toEqual({ ok: true, recordedCents: 20000, chargeCount: 3 })
    expect(h.paid.mock.calls.map((c) => c[0])).toEqual([
      { assessmentId: A(3), amountPaid: 60, paymentMethod: 'check', externalRef: undefined },
      { assessmentId: A(2), amountPaid: 100, paymentMethod: 'check', externalRef: undefined },
      { assessmentId: A(1), amountPaid: 40, paymentMethod: 'check', externalRef: undefined },
    ])
    // A(3) and A(2) are cleared and closed; A(1) is part-paid and left alone.
    expect(h.updates.map((u) => u.filters.id)).toEqual([A(3), A(2)])
    expect(h.updates.every((u) => u.patch.status === 'paid')).toBe(true)
    const audit = h.inserts.filter((i) => i.table === 'audit_log')
    expect(audit).toHaveLength(1)
    expect(audit[0]!.row).toMatchObject({ org_id: 'org-1', user_id: 'user-1', action: 'payment.lump_recorded', entity_type: 'unit', entity_id: UNIT })
    expect(audit[0]!.row.metadata).toEqual({
      mode: 'ga_statutory',
      state: 'GA',
      method: 'check',
      total_cents: 20000,
      recorded_cents: 20000,
      complete: true,
      charges: [
        { id: A(3), cents: 6000 },
        { id: A(2), cents: 10000 },
        { id: A(1), cents: 4000 },
      ],
      ambiguity_codes: [],
    })
  })
  it('refuses more than is due: nothing is posted', async () => {
    const expected = await expectedFor(500)
    const r = await recordLumpPayment({ unitId: UNIT, amount: 500, expected })
    expect(r.ok).toBe(false)
    expect(h.paid).not.toHaveBeenCalled()
    expect(h.inserts).toEqual([])
  })
  it('refuses when the charges changed since the preview', async () => {
    const expected = await expectedFor(100)
    h.charges = h.charges.filter((c) => c.id !== A(3))
    const r = await recordLumpPayment({ unitId: UNIT, amount: 100, expected })
    expect(r).toMatchObject({ ok: false })
    expect(h.paid).not.toHaveBeenCalled()
  })
  it('refuses a split the browser invented', async () => {
    const r = await recordLumpPayment({ unitId: UNIT, amount: 100, expected: [{ chargeId: A(1), cents: 10000 }] })
    expect(r.ok).toBe(false)
    expect(h.paid).not.toHaveBeenCalled()
  })
  it('refuses nothing due', async () => {
    h.charges = [charge(A(4), 'regular', '2027-04-01', 100)]
    const r = await recordLumpPayment({ unitId: UNIT, amount: 50, expected: [] })
    expect(r.ok).toBe(false)
    expect(h.paid).not.toHaveBeenCalled()
  })
  it('stops at the first failed part, reports what posted, and audits only that', async () => {
    const expected = await expectedFor(200)
    h.paid.mockImplementationOnce(async () => ({ ok: true })).mockImplementationOnce(async () => ({ ok: false, error: 'JE failed' }))
    const r = await recordLumpPayment({ unitId: UNIT, amount: 200, expected })
    expect(r).toMatchObject({ ok: false, recordedCents: 6000, chargeCount: 1 })
    expect(h.paid).toHaveBeenCalledTimes(2)
    const audit = h.inserts.filter((i) => i.table === 'audit_log')
    expect(audit[0]!.row.metadata).toMatchObject({ recorded_cents: 6000, complete: false, charges: [{ id: A(3), cents: 6000 }] })
  })
  it('passes the books-not-open failure through untouched, with no audit row', async () => {
    const expected = await expectedFor(60)
    const gap = { ok: false, error: 'books', code: 'books_not_open', canOpenBooks: true }
    h.paid.mockImplementationOnce(async () => gap)
    const r = await recordLumpPayment({ unitId: UNIT, amount: 60, expected })
    expect(r).toEqual(gap)
    expect(h.inserts).toEqual([])
  })
  it('refuses a resident and a non-Georgia association before posting', async () => {
    h.role = 'resident'
    expect(await recordLumpPayment({ unitId: UNIT, amount: 10, expected: [] })).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    h.role = 'board'
    h.state = 'TX'
    expect((await recordLumpPayment({ unitId: UNIT, amount: 10, expected: [] })).ok).toBe(false)
    expect(h.paid).not.toHaveBeenCalled()
  })
  it('the audit row carries no names, addresses or free text', async () => {
    const expected = await expectedFor(60)
    await recordLumpPayment({ unitId: UNIT, amount: 60, paymentMethod: 'check', externalRef: 'Check 1042 from J. Smith', expected })
    const json = JSON.stringify(h.inserts)
    expect(json).not.toContain('Smith')
    expect(json).not.toContain('1042')
  })
})
