import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

/**
 * BL-047 for the accounting statements: every total below is summed from
 * rows, and PostgREST caps each response at 1000 rows. The fake enforces
 * that cap; each fixture is over it.
 */
let db: SupabaseClient
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => null }))

const { summarizeUnpaidInvoices, computeCashFlow, computeTrialBalance } = await import('./queries')

const A = 'assoc-1'
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`

describe('summarizeUnpaidInvoices', () => {
  const invoices = Array.from({ length: 2300 }, (_, i) => ({
    id: id('inv', i),
    association_id: A,
    deleted_at: null,
    status: 'approved',
    amount: 200,
    due_date: i < 1500 ? '2026-09-01' : '2026-12-01',
    payments: [{ amount: 50 }],
  }))

  it('counts and sums every unpaid invoice', async () => {
    ;({ db } = cappedFakeDb({ invoices }))
    const s = await summarizeUnpaidInvoices(A, '2026-10-16')
    expect(s).toEqual({ count: 2300, total: 2300 * 150, overdueCount: 1500, overdueTotal: 1500 * 150 })
  })

  it('a failed later page throws instead of returning a smaller total', async () => {
    ;({ db } = cappedFakeDb({ invoices }, { failAt: { table: 'invoices', from: 1000 } }))
    await expect(summarizeUnpaidInvoices(A, '2026-10-16')).rejects.toThrow(/57014/)
  })
})

// One posted JE per line, each moving $10 into Cash (1010) against Income.
function ledger(n: number, periodId: string, entryDate: string, offset = 0) {
  const jes = Array.from({ length: n }, (_, i) => ({
    id: id(`je-${periodId}-`, i + offset),
    association_id: A,
    status: 'posted',
    fiscal_period_id: periodId,
    entry_date: entryDate,
    source: 'ar_payment',
  }))
  const lines = jes.flatMap((je, i) => [
    {
      id: id(`le-${periodId}-a`, i + offset),
      journal_entry_id: je.id,
      account_id: 'cash',
      debit_amount: 10,
      credit_amount: 0,
      account: { id: 'cash', account_number: '1010', account_name: 'Cash', account_type: 'asset' },
    },
    {
      id: id(`le-${periodId}-b`, i + offset),
      journal_entry_id: je.id,
      account_id: 'income',
      debit_amount: 0,
      credit_amount: 10,
      account: { id: 'income', account_number: '4000', account_name: 'Dues', account_type: 'income' },
    },
  ])
  return { jes, lines }
}

const coa = [
  { id: 'cash', association_id: A, account_number: '1010' },
  { id: 'income', association_id: A, account_number: '4000' },
]

describe('computeTrialBalance', () => {
  const { jes, lines } = ledger(1400, 'p1', '2026-09-15')

  it('totals every line of every posted JE in the period', async () => {
    ;({ db } = cappedFakeDb({ journal_entries: jes, ledger_entries: lines }))
    const tb = await computeTrialBalance(A, 'p1')
    expect(tb.totalDebits).toBe(14_000)
    expect(tb.totalCredits).toBe(14_000)
  })

  it('a failed later JE page throws', async () => {
    ;({ db } = cappedFakeDb({ journal_entries: jes, ledger_entries: lines }, { failAt: { table: 'journal_entries', from: 1000 } }))
    await expect(computeTrialBalance(A, 'p1')).rejects.toThrow(/57014/)
  })

  it('a failed line read throws', async () => {
    ;({ db } = cappedFakeDb({ journal_entries: jes, ledger_entries: lines }, { failAt: { table: 'ledger_entries' } }))
    await expect(computeTrialBalance(A, 'p1')).rejects.toThrow(/57014/)
  })
})

describe('computeCashFlow', () => {
  const prior = ledger(1300, 'p0', '2026-08-15')
  const current = ledger(1100, 'p1', '2026-09-15')
  const periodJes = current.jes.map((je) => ({
    ...je,
    lines: current.lines.filter((l) => l.journal_entry_id === je.id),
  }))
  const tables = () => ({
    fiscal_periods: [{ id: 'p1', start_date: '2026-09-01', end_date: '2026-09-30' }],
    chart_of_accounts: coa,
    journal_entries: [...prior.jes, ...periodJes],
    ledger_entries: [...prior.lines, ...current.lines],
  })

  it('opening cash and period movement include every JE and line', async () => {
    ;({ db } = cappedFakeDb(tables()))
    const cf = await computeCashFlow(A, 'p1')
    expect(cf.openingCash).toBe(13_000)
    expect(cf.totalNet).toBe(11_000)
    expect(cf.closingCash).toBe(24_000)
  })

  it('a failed later page throws', async () => {
    ;({ db } = cappedFakeDb(tables(), { failAt: { table: 'journal_entries', from: 1000 } }))
    await expect(computeCashFlow(A, 'p1')).rejects.toThrow(/57014/)
  })
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
