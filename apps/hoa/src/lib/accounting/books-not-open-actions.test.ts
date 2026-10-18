import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

// BL-072: Generate dues / Add a due / Record payment used to answer a
// missing fiscal period or chart of accounts with "run pnpm seed:accounting".
// They now say it in plain words and mark the failure `books_not_open`, so
// the form can offer "Open the books" (admins) or the admins list (board).

const h = vi.hoisted(() => ({
  gate: vi.fn(async (): Promise<unknown> => ({ ok: true, role: 'admin', orgId: 'org-1' })),
  client: null as unknown,
  refs: vi.fn(async (): Promise<unknown> => null),
}))

vi.mock('@/lib/accounting/guard', () => ({ requireBoardOrAdminForAction: h.gate }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => h.client }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ loadAccountingRefs: h.refs, postJournalEntry: vi.fn() }))

import { createDues, markAssessmentPaid, materializeCurrentPeriodAssessments } from '@/lib/assessments'
import { enterBill, markInvoicePaid } from '@/lib/invoices'
import { BOOKS_NOT_OPEN_MESSAGE } from './books-not-open'

const DEV_TEXT = /pnpm|seed:|script|sql/i

const assoc = { id: 'assoc-1', organization_id: 'org-1', slug: 'mp' }
const period = { id: 'fp-1', association_id: 'assoc-1', status: 'open', start_date: '2026-01-01', end_date: '2026-12-31' }

function db(seed: Record<string, Array<Record<string, unknown>>>) {
  h.client = memorySupabase(seed).client
}

beforeEach(() => {
  h.gate.mockResolvedValue({ ok: true, role: 'admin', orgId: 'org-1' })
  h.refs.mockResolvedValue(null)
})

const dues = {
  scope: 'all' as const,
  frequency: 'one_time' as const,
  assessmentType: 'regular' as const,
  amount: 100,
  firstDueDate: '2026-10-01',
}

describe('books not open (BL-072)', () => {
  it('Generate dues: no fiscal period → plain message, code, and admins may open the books', async () => {
    db({ associations: [assoc] })
    const r = await materializeCurrentPeriodAssessments({ amountPerUnit: 250 })
    expect(r).toEqual({ ok: false, error: BOOKS_NOT_OPEN_MESSAGE, code: 'books_not_open', canOpenBooks: true })
  })

  it('Generate dues: no chart of accounts → the same', async () => {
    db({ associations: [assoc], fiscal_periods: [period] })
    const r = await materializeCurrentPeriodAssessments({ amountPerUnit: 250 })
    expect(r).toMatchObject({ ok: false, code: 'books_not_open' })
  })

  it('Add a due: a board member is told, but cannot open the books', async () => {
    h.gate.mockResolvedValue({ ok: true, role: 'board', orgId: 'org-1' })
    db({ associations: [assoc] })
    const r = await createDues(dues)
    expect(r).toEqual({ ok: false, error: BOOKS_NOT_OPEN_MESSAGE, code: 'books_not_open', canOpenBooks: false })
  })

  it('Record payment: missing chart of accounts → the same', async () => {
    const id = '00000000-0000-4000-8000-000000000001'
    db({
      associations: [assoc],
      assessments: [{ id, organization_id: 'org-1', association_id: 'assoc-1', unit_id: 'u1', fiscal_period_id: 'fp-1', amount: 100, status: 'open' }],
    })
    const r = await markAssessmentPaid({ assessmentId: id })
    expect(r).toEqual({ ok: false, error: BOOKS_NOT_OPEN_MESSAGE, code: 'books_not_open', canOpenBooks: true })
  })

  it('bills: entering one and paying one say the same', async () => {
    db({ associations: [assoc] })
    const bill = await enterBill({
      vendorId: '00000000-0000-4000-8000-000000000002',
      invoiceNumber: 'A1',
      invoiceDate: '2026-10-01',
      amount: 50,
      expenseAccountId: '00000000-0000-4000-8000-000000000003',
    })
    expect(bill).toMatchObject({ ok: false, error: BOOKS_NOT_OPEN_MESSAGE, code: 'books_not_open' })

    const invoiceId = '00000000-0000-4000-8000-000000000004'
    db({
      associations: [assoc],
      invoices: [{ id: invoiceId, organization_id: 'org-1', association_id: 'assoc-1', status: 'approved', amount: 50, invoice_date: '2026-10-01' }],
    })
    const paid = await markInvoicePaid({ invoiceId, paymentMethod: 'check' })
    expect(paid).toMatchObject({ ok: false, error: BOOKS_NOT_OPEN_MESSAGE, code: 'books_not_open' })
  })

  it('the message is plain words', () => {
    expect(BOOKS_NOT_OPEN_MESSAGE).not.toMatch(DEV_TEXT)
  })
})
