import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BL-177 (M7_APPLIED = true): the board's "Record payment" posts the whole
// split through ONE record_lump_payment call. The fake client records the
// call; what is asserted is the parts sent (charges in the statute's order,
// then the credit), the refusals, and that markAssessmentPaid is never used.

const UNIT = '11111111-1111-4111-8111-111111111111'
const A = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  booksOpen: true,
  charges: [] as Array<{ id: string; assessment_type: string; due_date: string; amount: number; payments: Array<{ amount: number }> }>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcResult: { data: null as unknown, error: null as null | { code?: string; message?: string } },
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  paid: vi.fn(async (_i: unknown): Promise<Record<string, unknown>> => ({ ok: true })),
  receipts: [] as string[],
  planChecks: 0,
}))

vi.mock('@homeowner-portal/db/m7', () => ({ M7_APPLIED: true }))
vi.mock('@homeowner-portal/db', () => ({ loadAccountingRefs: vi.fn(async () => (h.booksOpen ? { fundOperating: 'f' } : null)) }))
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
vi.mock('@/lib/accounting/plan-completion', () => ({
  completePlansAfterPayment: vi.fn(async () => {
    h.planChecks += 1
    return []
  }),
}))
vi.mock('@/lib/resident-notify/receipt-notify', () => ({
  queuePaymentReceiptAfterResponse: vi.fn((_db: unknown, i: { paymentId: string }) => {
    h.receipts.push(i.paymentId)
  }),
}))
vi.mock('@homeowner-portal/workflows/payment-plans', () => ({ loadInstallments: vi.fn(async () => []) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ fn, args })
      return h.rpcResult
    },
    from(table: string) {
      const result = () => {
        if (table === 'associations') return { data: [{ state: 'GA', governing_law_state: null }], error: null }
        if (table === 'units') return { data: { id: UNIT }, error: null }
        if (table === 'assessments') return { data: h.charges, error: null }
        return { data: [], error: null }
      }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'is', 'order', 'range', 'in', 'eq']) q[m] = () => q
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
  h.booksOpen = true
  h.rpcCalls = []
  h.rpcResult = { data: { payment_ids: ['p1', 'p2'], applied_cents: 14000, credit_cents: 0 }, error: null }
  h.inserts = []
  h.receipts = []
  h.planChecks = 0
  h.paid.mockClear()
  h.charges = [
    charge(A(1), 'fine', '2027-01-05', 50),
    charge(A(2), 'regular', '2027-02-01', 100),
    charge(A(3), 'regular', '2027-01-01', 100, 40), // 60 left
  ]
})
afterEach(() => vi.useRealTimers())

async function split(amount: number) {
  const p = await previewLumpPayment({ unitId: UNIT, amount })
  if (!p.ok) throw new Error('preview failed')
  return p.preview
}

describe('recordLumpPayment with M7_APPLIED', () => {
  it('sends every part in one record_lump_payment call, in the statute’s order, and never uses markAssessmentPaid', async () => {
    const preview = await split(140)
    h.rpcResult = { data: { payment_ids: ['p1', 'p2'], applied_cents: 14000, credit_cents: 0 }, error: null }
    const r = await recordLumpPayment({
      unitId: UNIT,
      amount: 140,
      paymentMethod: 'check',
      expected: expectedOf(preview),
      expectedCreditCents: 0,
      paidOn: '2027-03-10',
      note: 'Check 1042',
    })
    expect(r).toEqual({ ok: true, recordedCents: 14000, chargeCount: 2 })
    expect(h.paid).not.toHaveBeenCalled()
    expect(h.rpcCalls).toHaveLength(1)
    expect(h.rpcCalls[0]).toEqual({
      fn: 'record_lump_payment',
      args: {
        p_org: 'org-1',
        p_unit: UNIT,
        p_parts: [
          { assessment_id: A(3), cents: 6000 },
          { assessment_id: A(2), cents: 8000 },
        ],
        p_method: 'check',
        p_paid_on: '2027-03-10',
        p_note: 'Check 1042',
      },
    })
    // Receipts for each payment; the plan check ran; the audit row has no note.
    expect(h.receipts).toEqual(['p1', 'p2'])
    expect(h.planChecks).toBe(1)
    const audit = h.inserts.find((i) => i.table === 'audit_log')!
    expect(audit.row).toMatchObject({ action: 'payment.lump_recorded', entity_id: UNIT })
    expect(JSON.stringify(audit.row)).not.toContain('Check 1042')
    expect((audit.row.metadata as Record<string, unknown>).atomic).toBe(true)
  })

  it('an overpayment becomes a credit part instead of being refused', async () => {
    const preview = await split(300) // 210 is due, 90 over
    expect(preview.unappliedCents).toBe(9000)
    h.rpcResult = { data: { payment_ids: ['p1', 'p2', 'p3'], applied_cents: 21000, credit_cents: 9000 }, error: null }
    const r = await recordLumpPayment({
      unitId: UNIT,
      amount: 300,
      paymentMethod: 'ach',
      expected: expectedOf(preview),
      expectedCreditCents: 9000,
    })
    expect(r).toEqual({ ok: true, recordedCents: 21000, chargeCount: 3, creditCents: 9000 })
    const parts = h.rpcCalls[0]!.args.p_parts as Array<Record<string, unknown>>
    expect(parts.at(-1)).toEqual({ kind: 'credit', cents: 9000 })
    expect(h.rpcCalls[0]!.args.p_paid_on).toBe('2027-03-15') // blank = the association's today
  })

  it('refuses when the credit the board saw is not the credit now (charges moved), before any call', async () => {
    const preview = await split(300)
    const r = await recordLumpPayment({ unitId: UNIT, amount: 300, paymentMethod: 'check', expected: expectedOf(preview), expectedCreditCents: 0 })
    expect(r.ok).toBe(false)
    expect(h.rpcCalls).toEqual([])
  })

  it('refuses a future date and a closed set of books, before any call', async () => {
    const preview = await split(140)
    const future = await recordLumpPayment({ unitId: UNIT, amount: 140, expected: expectedOf(preview), expectedCreditCents: 0, paidOn: '2027-03-16' })
    expect(future).toEqual({ ok: false, error: 'The payment date can’t be in the future.' })
    h.booksOpen = false
    const closed = await recordLumpPayment({ unitId: UNIT, amount: 140, expected: expectedOf(preview), expectedCreditCents: 0 })
    expect(closed.ok).toBe(false)
    expect((closed as { code?: string }).code).toBe('books_not_open')
    expect(h.rpcCalls).toEqual([])
  })

  it('a database refusal posts nothing and says so; no audit row, no receipts', async () => {
    const preview = await split(140)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.rpcResult = { data: null, error: { code: '23514', message: 'over-application' } }
    const r = await recordLumpPayment({ unitId: UNIT, amount: 140, expected: expectedOf(preview), expectedCreditCents: 0 })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/Nothing was saved/)
    expect(h.inserts).toEqual([])
    expect(h.receipts).toEqual([])
    h.rpcResult = { data: null, error: { code: '42501', message: 'not authorized' } }
    expect(await recordLumpPayment({ unitId: UNIT, amount: 140, expected: expectedOf(preview), expectedCreditCents: 0 })).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
  })

  it('a resident is refused before any read', async () => {
    h.role = 'resident'
    expect(await recordLumpPayment({ unitId: UNIT, amount: 10, expected: [] })).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    expect(h.rpcCalls).toEqual([])
  })
})
