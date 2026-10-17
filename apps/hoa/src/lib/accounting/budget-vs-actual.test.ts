import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

/**
 * BL-051: the board packet's budget vs. actual stops at the end of the
 * packet month. The fixture is a calendar-year budget with entries posted
 * in August, September and October; the packet for September must count
 * only the first two. The fake evaluates filters and caps every response
 * at 1000 rows, and each month here has more lines than that.
 */
let db: SupabaseClient
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => null }))

const { computeBudgetVsActual } = await import('./queries')

const A = 'assoc-1'
const FY = 'fy-2026'
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`

const budget = {
  id: 'b1',
  association_id: A,
  fiscal_period_id: FY,
  fund: { code: 'OP' },
  fiscalPeriod: { start_date: '2026-01-01', end_date: '2026-12-31' },
  budget_line_items: [
    { account_id: 'dues', amount: 120_000, account: { id: 'dues', account_number: '4000', account_name: 'Dues', account_type: 'income' } },
    { account_id: 'land', amount: 24_000, account: { id: 'land', account_number: '6100', account_name: 'Landscaping', account_type: 'expense' } },
  ],
}

/** `n` posted JEs on `day`, each $10 of dues income and $4 of landscaping. */
function month(tag: string, day: string, n: number, status = 'posted') {
  const jes = Array.from({ length: n }, (_, i) => ({
    id: id(`je-${tag}-`, i),
    association_id: A,
    fiscal_period_id: FY,
    status,
    entry_date: day,
  }))
  const lines = jes.flatMap((je, i) => [
    { id: id(`le-${tag}-a`, i), journal_entry_id: je.id, account_id: 'dues', debit_amount: 0, credit_amount: 10 },
    { id: id(`le-${tag}-b`, i), journal_entry_id: je.id, account_id: 'land', debit_amount: 4, credit_amount: 0 },
  ])
  return { jes, lines }
}

const aug = month('aug', '2026-08-15', 600)
const sepLast = month('sep', '2026-09-30', 700) // the last day counts
const oct = month('oct', '2026-10-01', 900) // the first day after does not
const draft = month('draft', '2026-09-10', 50, 'draft')

const tables = () => ({
  budgets: [budget],
  journal_entries: [...aug.jes, ...sepLast.jes, ...oct.jes, ...draft.jes],
  ledger_entries: [...aug.lines, ...sepLast.lines, ...oct.lines, ...draft.lines],
})

describe('computeBudgetVsActual — actuals through a day', () => {
  it('with no cutoff, counts every posted entry in the fiscal year (the reports page)', async () => {
    ;({ db } = cappedFakeDb(tables()))
    const r = await computeBudgetVsActual(A, 'b1')
    expect(r!.totals.actualIncome).toBe(2200 * 10)
    expect(r!.totals.actualExpense).toBe(2200 * 4)
    expect(r!.actualsThrough).toBeNull()
  })

  it('with a cutoff, leaves out entries dated after it', async () => {
    ;({ db } = cappedFakeDb(tables()))
    const r = await computeBudgetVsActual(A, 'b1', { through: '2026-09-30' })
    expect(r!.totals.actualIncome).toBe(1300 * 10)
    expect(r!.totals.actualExpense).toBe(1300 * 4)
    expect(r!.totals.actualNet).toBe(1300 * 6)
    expect(r!.rows.map((x) => [x.accountNumber, x.actual])).toEqual([
      ['4000', 13_000],
      ['6100', 5_200],
    ])
    expect(r!.actualsThrough).toBe('2026-09-30')
    // Budgeted amounts are the full year either way.
    expect(r!.totals.budgetedIncome).toBe(120_000)
  })

  it('a failed later page throws instead of under-reporting actuals', async () => {
    ;({ db } = cappedFakeDb(tables(), { failAt: { table: 'journal_entries', from: 1000 } }))
    await expect(computeBudgetVsActual(A, 'b1', { through: '2026-09-30' })).rejects.toThrow(/57014/)
  })
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
