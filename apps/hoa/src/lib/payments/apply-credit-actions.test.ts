import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-177 follow-up (M7_APPLIED = true): "Apply credit to a charge" is one
// apply_unapplied_credit call; the database refuses what it should and the
// action turns each refusal into a sentence.

const CREDIT = '11111111-1111-4111-8111-111111111111'
const CHARGE = '22222222-2222-4222-8222-222222222222'

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident',
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  result: { data: { payment_id: 'pay-1' } as unknown, error: null as null | { code?: string; message?: string } },
  receipts: [] as string[],
}))

vi.mock('@homeowner-portal/db/m7', () => ({ M7_APPLIED: true }))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => ({ role: h.role, org: { id: 'org-1', name: 'T', hub_type: 'hoa', plan: 'pro', doors_count: 1 } })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: vi.fn(async () => ({ id: 'assoc-1', name: 'T', timeZone: 'America/New_York' })) }))
vi.mock('@/lib/accounting/plan-completion', () => ({ completePlansAfterPayment: vi.fn(async () => []) }))
vi.mock('@/lib/resident-notify/receipt-notify', () => ({
  queuePaymentReceiptAfterResponse: vi.fn((_d: unknown, i: { paymentId: string }) => {
    h.receipts.push(i.paymentId)
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.calls.push({ fn, args })
      return h.result
    },
    from() {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) q[m] = () => q
      q.maybeSingle = async () => ({ data: { unit_id: 'unit-1' }, error: null })
      return q
    },
  })),
}))

import { BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { applyCreditToCharge } from './apply-credit-actions'

beforeEach(() => {
  h.role = 'board'
  h.calls = []
  h.receipts = []
  h.result = { data: { payment_id: 'pay-1' }, error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('applyCreditToCharge', () => {
  it('makes one apply_unapplied_credit call with the org, credit, charge and cents, then queues the receipt', async () => {
    expect(await applyCreditToCharge({ creditId: CREDIT, assessmentId: CHARGE, cents: 2500 })).toEqual({ ok: true, cents: 2500 })
    expect(h.calls).toEqual([{ fn: 'apply_unapplied_credit', args: { p_org: 'org-1', p_credit: CREDIT, p_assessment: CHARGE, p_cents: 2500 } }])
    expect(h.receipts).toEqual(['pay-1'])
  })
  it('a resident is refused before any call; bad input is refused', async () => {
    h.role = 'resident'
    expect(await applyCreditToCharge({ creditId: CREDIT, assessmentId: CHARGE, cents: 100 })).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    h.role = 'board'
    expect((await applyCreditToCharge({ creditId: 'x', assessmentId: CHARGE, cents: 100 })).ok).toBe(false)
    expect((await applyCreditToCharge({ creditId: CREDIT, assessmentId: CHARGE, cents: 0 })).ok).toBe(false)
    expect((await applyCreditToCharge({ creditId: CREDIT, assessmentId: CHARGE, cents: 1.5 })).ok).toBe(false)
    expect(h.calls).toEqual([])
  })
  it('turns the database’s refusals into sentences and sends no receipt', async () => {
    h.result = { data: null, error: { code: '23514', message: 'over-application' } }
    const over = await applyCreditToCharge({ creditId: CREDIT, assessmentId: CHARGE, cents: 100 })
    expect(over.ok === false && over.error).toMatch(/more than the credit or the charge has left/)
    h.result = { data: null, error: { code: '23503', message: 'x' } }
    expect((await applyCreditToCharge({ creditId: CREDIT, assessmentId: CHARGE, cents: 100 })).ok).toBe(false)
    h.result = { data: null, error: { code: '55000', message: 'apply_unapplied_credit: books_not_open' } }
    const books = await applyCreditToCharge({ creditId: CREDIT, assessmentId: CHARGE, cents: 100 })
    expect((books as { code?: string }).code).toBe('books_not_open')
    expect(h.receipts).toEqual([])
  })
})
