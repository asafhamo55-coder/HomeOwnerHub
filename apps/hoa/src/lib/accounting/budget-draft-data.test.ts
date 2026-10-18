import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

/**
 * BL-029 loader: picks the fund, the year to draft and last year's budget,
 * and sums the trailing 12 months of posted activity for that fund —
 * paged past the 1000-row cap, with closing entries left out (a closed
 * year's closing entry would otherwise cancel its own actuals to zero).
 */
let db: SupabaseClient
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => null }))

const { loadBudgetDraftInputs } = await import('./budget-draft-data')

const A = 'assoc-1'
const OP = 'fund-op'
const RES = 'fund-res'
const pad = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`

const funds = [
  { id: OP, association_id: A, code: 'OPERATING', name: 'Operating Fund', fund_type: 'operating', is_active: true },
  { id: RES, association_id: A, code: 'RESERVE', name: 'Reserve Fund', fund_type: 'reserve', is_active: true },
]
const periods = [
  { id: 'fy25', association_id: A, start_date: '2025-01-01', end_date: '2025-12-31', status: 'closed' },
  { id: 'fy26', association_id: A, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' },
  { id: 'fy27', association_id: A, start_date: '2027-01-01', end_date: '2027-12-31', status: 'open' },
]
const coa = [
  { id: 'dues', association_id: A, account_number: '4000', account_name: 'Assessment Income', account_type: 'income', fund_id: OP, is_active: true },
  { id: 'land', association_id: A, account_number: '5000', account_name: 'Landscaping', account_type: 'expense', fund_id: OP, is_active: true },
  { id: 'xfer', association_id: A, account_number: '5800', account_name: 'Transfer to Reserves', account_type: 'expense', fund_id: OP, is_active: true },
  { id: 'old', association_id: A, account_number: '5990', account_name: 'Retired account', account_type: 'expense', fund_id: OP, is_active: false },
  { id: 'cash', association_id: A, account_number: '1010', account_name: 'Cash — Operating', account_type: 'asset', fund_id: OP, is_active: true },
  { id: 'rint', association_id: A, account_number: '4200', account_name: 'Interest Income', account_type: 'income', fund_id: RES, is_active: true },
]
const budgets = [
  {
    id: 'b25', association_id: A, fund_id: OP, fiscal_period_id: 'fy25', status: 'approved', deleted_at: null,
    fiscalPeriod: { start_date: '2025-01-01', end_date: '2025-12-31' },
    budget_line_items: [{ account_id: 'dues', amount: 100_000 }, { account_id: 'land', amount: 20_000 }],
  },
  {
    id: 'b26', association_id: A, fund_id: OP, fiscal_period_id: 'fy26', status: 'approved', deleted_at: null,
    fiscalPeriod: { start_date: '2026-01-01', end_date: '2026-12-31' },
    budget_line_items: [{ account_id: 'dues', amount: 120_000 }, { account_id: 'land', amount: 24_000 }, { account_id: 'xfer', amount: 15_000 }, { account_id: 'old', amount: 50 }],
  },
]

/** `n` posted JEs on `day`: $10 dues income, $4 landscaping, all in the operating fund. */
function batch(tag: string, day: string, n: number, extra: Partial<{ status: string; source: string; fund: string }> = {}) {
  const jes = Array.from({ length: n }, (_, i) => ({
    id: pad(`je-${tag}-`, i), association_id: A, status: extra.status ?? 'posted', source: extra.source ?? 'manual', entry_date: day,
  }))
  const lines = jes.flatMap((je, i) => [
    { id: pad(`le-${tag}-a`, i), journal_entry_id: je.id, account_id: 'dues', fund_id: extra.fund ?? OP, debit_amount: 0, credit_amount: 10 },
    { id: pad(`le-${tag}-b`, i), journal_entry_id: je.id, account_id: 'land', fund_id: extra.fund ?? OP, debit_amount: 4, credit_amount: 0 },
    { id: pad(`le-${tag}-c`, i), journal_entry_id: je.id, account_id: 'cash', fund_id: extra.fund ?? OP, debit_amount: 6, credit_amount: 0 },
  ])
  return { jes, lines }
}

const inWindow = batch('in', '2026-03-01', 1200) // > 1000 JEs → paged
const tooOld = batch('old', '2025-10-18', 50) // the day before the window opens
const lastDay = batch('last', '2026-10-18', 10) // today counts
const closing = batch('close', '2025-12-31', 0)
const closingJe = { id: 'je-closing', association_id: A, status: 'posted', source: 'closing', entry_date: '2025-12-31' }
const closingLines = [{ id: 'le-closing', journal_entry_id: 'je-closing', account_id: 'land', fund_id: OP, debit_amount: 0, credit_amount: 99_999 }]
const draftJe = batch('draft', '2026-05-01', 5, { status: 'draft' })
const otherFund = batch('res', '2026-06-01', 5, { fund: RES })

const tables = () => ({
  funds,
  fiscal_periods: periods,
  chart_of_accounts: coa,
  budgets,
  journal_entries: [...inWindow.jes, ...tooOld.jes, ...lastDay.jes, ...closing.jes, closingJe, ...draftJe.jes, ...otherFund.jes],
  ledger_entries: [...inWindow.lines, ...tooOld.lines, ...lastDay.lines, ...closingLines, ...draftJe.lines, ...otherFund.lines],
})

beforeEach(() => {
  ;({ db } = cappedFakeDb(tables()))
})

describe('loadBudgetDraftInputs', () => {
  it('drafts next year for the operating fund from this year’s budget', async () => {
    const r = await loadBudgetDraftInputs({ associationId: A, today: '2026-10-18' })
    expect(r.fund?.id).toBe(OP)
    expect(r.target?.id).toBe('fy27')
    expect(r.targets.map((t) => t.id)).toEqual(['fy27'])
    expect(r.nextYearMissing).toBeNull()
    expect(r.source).toEqual({ budgetId: 'b26', status: 'approved', startDate: '2026-01-01', endDate: '2026-12-31' })
    expect(r.draftSource.priorBudget).toEqual({ dues: 120_000, land: 24_000, xfer: 15_000, old: 50 })
  })

  it('sums the trailing 12 months of posted, non-closing activity for that fund, past the row cap', async () => {
    const r = await loadBudgetDraftInputs({ associationId: A, today: '2026-10-18' })
    expect(r.window).toEqual({ from: '2025-10-19', through: '2026-10-18' })
    expect(r.draftSource.actuals.dues).toBe(1210 * 10)
    expect(r.draftSource.actuals.land).toBe(1210 * 4)
    expect(r.draftSource.actuals.cash).toBeUndefined()
    expect(r.draftSource.actualMonths).toBe(12)
  })

  it('one line per active income/expense account in the fund, plus any retired account last year budgeted', async () => {
    const r = await loadBudgetDraftInputs({ associationId: A, today: '2026-10-18' })
    expect(r.draftSource.accounts.map((a) => a.number)).toEqual(['4000', '5000', '5800', '5990'])
    expect(r.draftSource.reserveAccountIds).toEqual(['xfer'])
  })

  it('says so when next year’s fiscal period isn’t open yet', async () => {
    ;({ db } = cappedFakeDb({ ...tables(), fiscal_periods: periods.slice(0, 2) }))
    const r = await loadBudgetDraftInputs({ associationId: A, today: '2026-10-18' })
    expect(r.nextYearMissing).toEqual({ startDate: '2027-01-01', endDate: '2027-12-31' })
    expect(r.target).toBeNull()
    expect(r.targets).toEqual([])
    // The draft is still computed for review.
    expect(r.source?.budgetId).toBe('b26')
  })

  it('a short history is reported in months so the draft annualizes it', async () => {
    ;({ db } = cappedFakeDb({ ...tables(), fiscal_periods: periods.slice(1) }))
    const r = await loadBudgetDraftInputs({ associationId: A, today: '2026-10-18' })
    expect(r.draftSource.actualMonths).toBe(10) // books from Jan 1: about 9.6 months
  })

  it('no prior budget and no activity: a blank template, still on the right target', async () => {
    ;({ db } = cappedFakeDb({ ...tables(), budgets: [], journal_entries: [], ledger_entries: [] }))
    const r = await loadBudgetDraftInputs({ associationId: A, today: '2026-10-18' })
    expect(r.source).toBeNull()
    expect(r.draftSource.priorBudget).toEqual({})
    expect(r.draftSource.actuals).toEqual({})
    expect(r.targets.map((t) => t.id)).toEqual(['fy26', 'fy27'])
    expect(r.target?.id).toBe('fy27')
  })

  it('the reserve fund: its own accounts, reserve income counted as a contribution unless it is interest', async () => {
    const r = await loadBudgetDraftInputs({ associationId: A, fundId: RES, today: '2026-10-18' })
    expect(r.fund?.id).toBe(RES)
    expect(r.draftSource.accounts.map((a) => a.id)).toEqual(['rint'])
    expect(r.draftSource.reserveAccountIds).toEqual([])
    expect(r.source).toBeNull()
  })

  it('an unknown fund id falls back to the operating fund; a chosen target is honoured', async () => {
    ;({ db } = cappedFakeDb({ ...tables(), budgets: [] }))
    const r = await loadBudgetDraftInputs({ associationId: A, fundId: 'nope', targetPeriodId: 'fy26', today: '2026-10-18' })
    expect(r.fund?.id).toBe(OP)
    expect(r.target?.id).toBe('fy26')
  })

  it('a failed later page throws instead of drafting from partial actuals', async () => {
    ;({ db } = cappedFakeDb(tables(), { failAt: { table: 'journal_entries', from: 1000 } }))
    await expect(loadBudgetDraftInputs({ associationId: A, today: '2026-10-18' })).rejects.toThrow(/57014/)
  })
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
