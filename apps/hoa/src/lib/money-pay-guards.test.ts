import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

// Paying an assessment or a bill: no overpayment, status follows the running
// total, no double payment, no payment on a deleted row.

const h = vi.hoisted(() => ({
  client: null as unknown,
  post: vi.fn(async (): Promise<unknown> => ({ ok: true, journalEntryId: 'je-1' })),
  guard: vi.fn(async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
}))

vi.mock('@/lib/accounting/guard', () => ({ requireBoardOrAdminForAction: async () => ({ ok: true, role: 'admin', orgId: 'org-1' }) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => h.client }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1', timeZone: 'America/New_York' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({
  assertPeriodOpen: h.guard,
  loadAccountingRefs: async () => ({ acctCashOperating: 'a1', acctAR: 'a2', acctAP: 'a3', fundOperating: 'f1' }),
  postJournalEntry: h.post,
}))
vi.mock('@homeowner-portal/jobs/fiscal-periods', () => ({ readCurrentOpenPeriod: async () => ({ data: { id: 'fp-1' } }) }))
vi.mock('@/lib/accounting/plan-completion', () => ({ completePlansAfterPayment: async () => [] }))
vi.mock('@/lib/resident-notify/receipt-notify', () => ({ queuePaymentReceiptAfterResponse: vi.fn() }))

import { markAssessmentPaid } from '@/lib/assessments'
import { markInvoicePaid } from '@/lib/invoices'

const ID = '11111111-1111-4111-8111-111111111111'
const base = { id: ID, organization_id: 'org-1', association_id: 'assoc-1', unit_id: 'u1', fiscal_period_id: 'fp-1', amount: 100, status: 'open', deleted_at: null }

function seed(rows: Record<string, Array<Record<string, unknown>>>) {
  const m = memorySupabase(rows)
  h.client = m.client
  return m
}

beforeEach(() => {
  h.post.mockResolvedValue({ ok: true, journalEntryId: 'je-1' })
  h.guard.mockResolvedValue({ ok: true })
})

describe('markAssessmentPaid', () => {
  it('pays a charge in full and marks it paid', async () => {
    const m = seed({ assessments: [{ ...base }], payments: [] })
    expect((await markAssessmentPaid({ assessmentId: ID })).ok).toBe(true)
    expect(m.rows('payments')).toHaveLength(1)
    expect(m.rows('assessments')[0].status).toBe('paid')
  })

  it('refuses more than the balance and writes nothing', async () => {
    const m = seed({ assessments: [{ ...base }], payments: [] })
    const r = await markAssessmentPaid({ assessmentId: ID, amountPaid: 150 })
    expect(r.ok).toBe(false)
    expect(m.rows('payments')).toHaveLength(0)
  })

  it('a partial then the remaining balance ends paid, not partial', async () => {
    const m = seed({ assessments: [{ ...base }], payments: [] })
    await markAssessmentPaid({ assessmentId: ID, amountPaid: 40 })
    expect(m.rows('assessments')[0].status).toBe('partial')
    expect((await markAssessmentPaid({ assessmentId: ID, amountPaid: 60 })).ok).toBe(true)
    expect(m.rows('assessments')[0].status).toBe('paid')
  })

  it('refuses a payment that would pass what is left after earlier partials', async () => {
    seed({ assessments: [{ ...base, status: 'partial' }], payments: [{ id: 'p0', assessment_id: ID, amount: 70 }] })
    expect((await markAssessmentPaid({ assessmentId: ID, amountPaid: 40 })).ok).toBe(false)
  })

  it('with no amount, pays only the remaining balance', async () => {
    const m = seed({ assessments: [{ ...base, status: 'partial' }], payments: [{ id: 'p0', assessment_id: ID, amount: 70 }] })
    expect((await markAssessmentPaid({ assessmentId: ID })).ok).toBe(true)
    expect(m.rows('payments').find((p) => p.id !== 'p0')?.amount).toBe(30)
  })

  it('takes its payment back when a concurrent payment overshoots the total', async () => {
    const m = seed({ assessments: [{ ...base }], payments: [] })
    const real = m.client
    let injected = false
    h.client = {
      ...real,
      from: (t: string) => {
        const b = real.from(t) as { insert: (p: unknown) => unknown }
        if (t === 'payments') {
          const orig = b.insert.bind(b)
          b.insert = (p: unknown) => {
            if (!injected) {
              injected = true
              ;(real.from('payments') as unknown as { insert: (p: unknown) => PromiseLike<unknown> })
                .insert({ id: 'rival', assessment_id: ID, amount: 100 })
                .then(() => undefined)
            }
            return orig(p)
          }
        }
        return b
      },
    }
    const r = await markAssessmentPaid({ assessmentId: ID })
    expect(r.ok).toBe(false)
    expect(m.rows('payments').map((p) => p.id)).toEqual(['rival'])
  })

  it('refuses a soft-deleted charge', async () => {
    const m = seed({ assessments: [{ ...base, deleted_at: '2026-01-01T00:00:00Z' }], payments: [] })
    expect((await markAssessmentPaid({ assessmentId: ID })).ok).toBe(false)
    expect(m.rows('payments')).toHaveLength(0)
  })
})

describe('markInvoicePaid', () => {
  const inv = { id: ID, organization_id: 'org-1', association_id: 'assoc-1', amount: 250, status: 'approved', invoice_date: '2026-01-01', deleted_at: null }

  it('pays an approved bill once', async () => {
    const m = seed({ invoices: [{ ...inv }], payments: [] })
    expect((await markInvoicePaid({ invoiceId: ID })).ok).toBe(true)
    expect(m.rows('invoices')[0].status).toBe('paid')
    expect(m.rows('payments')).toHaveLength(1)
  })

  it('two payments at once record exactly one', async () => {
    const m = seed({ invoices: [{ ...inv }], payments: [] })
    const [a, b] = await Promise.all([markInvoicePaid({ invoiceId: ID }), markInvoicePaid({ invoiceId: ID })])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(m.rows('payments')).toHaveLength(1)
  })

  it('refuses a soft-deleted bill', async () => {
    const m = seed({ invoices: [{ ...inv, deleted_at: '2026-01-01T00:00:00Z' }], payments: [] })
    expect((await markInvoicePaid({ invoiceId: ID })).ok).toBe(false)
    expect(m.rows('payments')).toHaveLength(0)
  })

  it('puts the bill back when the ledger entry fails', async () => {
    h.post.mockResolvedValue({ ok: false, error: 'x' })
    const m = seed({ invoices: [{ ...inv }], payments: [] })
    expect((await markInvoicePaid({ invoiceId: ID })).ok).toBe(false)
    expect(m.rows('invoices')[0].status).toBe('approved')
    expect(m.rows('payments')).toHaveLength(0)
  })
})

describe('closed period: nothing is written', () => {
  const CLOSED = 'That date is in a closed month. Reopen the month or use today\u2019s date.'
  const closed = () => h.guard.mockResolvedValue({ ok: false, error: CLOSED })

  it('markAssessmentPaid records no payment and leaves the charge open', async () => {
    const m = seed({ assessments: [{ ...base }], payments: [] })
    closed()
    const r = await markAssessmentPaid({ assessmentId: ID })
    expect(r).toEqual({ ok: false, error: CLOSED })
    expect(m.rows('payments')).toHaveLength(0)
    expect(m.rows('assessments')[0].status).toBe('open')
    expect(h.post).not.toHaveBeenCalled()
  })

  it('markInvoicePaid records no payment and leaves the bill unpaid', async () => {
    const m = seed({
      invoices: [{ id: ID, organization_id: 'org-1', association_id: 'assoc-1', amount: 250, status: 'approved', invoice_date: '2026-01-01', deleted_at: null }],
      payments: [],
    })
    closed()
    const r = await markInvoicePaid({ invoiceId: ID })
    expect(r).toEqual({ ok: false, error: CLOSED })
    expect(m.rows('payments')).toHaveLength(0)
    expect(m.rows('invoices')[0].status).toBe('approved')
    expect(h.post).not.toHaveBeenCalled()
  })
})
