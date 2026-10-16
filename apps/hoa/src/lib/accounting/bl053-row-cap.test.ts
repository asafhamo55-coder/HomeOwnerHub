import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

/**
 * BL-053, accounting: reads that went wrong past PostgREST's 1000-row cap.
 * The fake enforces the cap; every fixture is over it.
 */
let db: SupabaseClient
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => null }))

const { getInvoice, loadPaymentPlans } = await import('./queries')

const A = 'assoc-1'
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`

describe('getInvoice — bill-pay journal entry', () => {
  // 1500 bill-pay JEs in the association; this invoice's is #1400. The old
  // read listed every ap_invoice JE and filtered in JS, so past 1000 the
  // invoice's own payment entry silently fell off its detail page.
  const jes = Array.from({ length: 1500 }, (_, i) => ({
    id: id('je', i),
    association_id: A,
    source: 'ap_invoice',
    source_id: id('pay', i),
    entry_number: id('JE-', i),
    entry_date: '2026-09-01',
    memo: 'bill pay',
    payments: [{ invoice_id: i === 1400 ? 'inv-1' : id('inv', i) }],
  }))
  const header = {
    id: 'je-header',
    association_id: A,
    source: 'ap_invoice',
    source_id: 'inv-1',
    entry_number: 'JE-H',
    entry_date: '2026-08-01',
    memo: 'bill',
    payments: [],
  }
  const invoices = [
    {
      id: 'inv-1',
      association_id: A,
      organization_id: 'org-1',
      deleted_at: null,
      invoice_number: 'I-1',
      invoice_date: '2026-08-01',
      due_date: '2026-09-01',
      amount: 100,
      status: 'paid',
      ai_generated: false,
      vendor: null,
      payments: [{ amount: 100, paid_at: '2026-09-01', journal_entry_id: id('je', 1400) }],
    },
  ]

  it('finds the payment entry however many bill-pay entries the association has', async () => {
    ;({ db } = cappedFakeDb({ invoices, journal_entries: [header, ...jes] }))
    const inv = await getInvoice(A, 'inv-1')
    expect(inv?.journalEntries.map((j) => j.id)).toEqual(['je-header', id('je', 1400)])
  })

  it('a failed payment-entry read throws instead of hiding the entry', async () => {
    ;({ db } = cappedFakeDb(
      { invoices, journal_entries: [header, ...jes] },
      { failAt: { table: 'journal_entries' } },
    ))
    await expect(getInvoice(A, 'inv-1')).rejects.toThrow(/57014/)
  })
})

describe('loadPaymentPlans', () => {
  // 2500 units; the plans sit on units past the first 1000, which the old
  // page never put in its `.in('unit_id', …)` list.
  const units = Array.from({ length: 2500 }, (_, i) => ({ id: id('u', i), association_id: A }))
  const otherUnit = { id: 'u-other', association_id: 'assoc-2' }
  const plans = [
    ...Array.from({ length: 1200 }, (_, i) => ({
      id: id('plan', i),
      unit_id: id('u', 1000 + i),
      total_amount: 1200,
      installment_amount: 100,
      installment_count: 12,
      start_date: '2026-01-01',
      status: 'active',
      unit: { address_line1: 'a', unit_number: null },
    })),
    {
      id: 'plan-other',
      unit_id: 'u-other',
      total_amount: 1,
      installment_amount: 1,
      installment_count: 2,
      start_date: '2026-01-01',
      status: 'active',
      unit: null,
    },
  ]

  it("returns every plan on the association's units, and only those", async () => {
    ;({ db } = cappedFakeDb({ units: [...units, otherUnit], payment_plans: plans }))
    const got = await loadPaymentPlans(A)
    expect(got).toHaveLength(1200)
    expect(got.some((p) => p.id === 'plan-other')).toBe(false)
  })

  it('a failed later page throws instead of a shorter list', async () => {
    ;({ db } = cappedFakeDb({ units, payment_plans: plans }, { failAt: { table: 'units', from: 1000 } }))
    await expect(loadPaymentPlans(A)).rejects.toThrow(/57014/)
  })
})
