import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

/**
 * BL-077: a closed year's income and expense actuals must show the year's
 * real activity. The year-end close (lib/periods.ts closePeriod) posts
 * `source = 'closing'` entries that zero every income and expense account
 * into fund balance; any period P&L figure that counts them reads as a
 * year with no activity. The balance sheet and trial balance, on the other
 * hand, MUST count them — that is how net income reaches fund balance.
 *
 * Fixture: FY2025, closed. 300 dues payments ($10) and 300 landscaping
 * bills ($4) in each of November and December, then the two closing
 * entries on 12-31. 2,404 ledger lines, so every read pages past the
 * fake's 1000-row cap.
 */
let db: SupabaseClient
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => null }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))
const side = vi.hoisted(() => ({ loadDelinquency: vi.fn(), countPendingApprovals: vi.fn() }))
vi.mock('@/lib/board-packet/queries', () => ({ loadDelinquency: side.loadDelinquency }))
vi.mock('@/lib/approvals-inbox/load', () => ({ countPendingApprovals: side.countPendingApprovals }))

const { isClosingEntry, withoutClosingEntries, CLOSING_ENTRY_SOURCE } = await import('./closing-entries')
const q = await import('./queries')
const { loadIncomeStatement, loadBudgetsVsActual, loadBalanceSheet } = await import('@/lib/board-packet/financials')
const { loadMonthlyReportData, periodForMonth } = await import('@/lib/monthly-report/load')

const A = 'assoc-1'
const FY = 'fy-2025'
const FUND = 'fund-op'
const pad = (i: number) => String(i).padStart(5, '0')

const acct = {
  cash: { id: 'cash', account_number: '1010', account_name: 'Cash - Operating', account_type: 'asset' },
  fb: { id: 'fb', account_number: '3000', account_name: 'Fund Balance', account_type: 'equity' },
  dues: { id: 'dues', account_number: '4000', account_name: 'Dues', account_type: 'income' },
  land: { id: 'land', account_number: '6100', account_name: 'Landscaping', account_type: 'expense' },
} as const
type AcctKey = keyof typeof acct

type Line = { id: string; journal_entry_id: string; account_id: string; fund_id: string; debit_amount: number; credit_amount: number; account: (typeof acct)[AcctKey] }
type Je = { id: string; association_id: string; fiscal_period_id: string; status: string; source: string; entry_date: string; lines: Line[] }

const jes: Je[] = []
function post(id: string, date: string, source: string, legs: [AcctKey, number, number][]) {
  const lines = legs.map(([k, dr, cr], i) => ({
    id: `le-${id}-${i}`,
    journal_entry_id: id,
    account_id: acct[k].id,
    fund_id: FUND,
    debit_amount: dr,
    credit_amount: cr,
    account: acct[k],
  }))
  jes.push({ id, association_id: A, fiscal_period_id: FY, status: 'posted', source, entry_date: date, lines })
}
for (const [mon, day] of [['nov', '2025-11-15'], ['dec', '2025-12-15']] as const) {
  for (let i = 0; i < 300; i++) {
    post(`je-${mon}-dues-${pad(i)}`, day, 'ar_payment', [['cash', 10, 0], ['dues', 0, 10]])
    post(`je-${mon}-land-${pad(i)}`, day, 'manual', [['land', 4, 0], ['cash', 0, 4]])
  }
}
// What closePeriod posts: income → fund balance, expense → fund balance.
post('je-zz-close-income', '2025-12-31', 'closing', [['dues', 6000, 0], ['fb', 0, 6000]])
post('je-zz-close-expense', '2025-12-31', 'closing', [['fb', 2400, 0], ['land', 0, 2400]])

const budget = {
  id: 'b-2025',
  association_id: A,
  fiscal_period_id: FY,
  status: 'approved',
  approved_at: null,
  created_at: '2024-12-01',
  fund: { id: FUND, code: 'OP', name: 'Operating' },
  fiscalPeriod: { id: FY, start_date: '2025-01-01', end_date: '2025-12-31' },
  budget_line_items: [
    { account_id: 'dues', amount: 7_000, account: acct.dues },
    { account_id: 'land', amount: 3_000, account: acct.land },
  ],
}

const tables = () => ({
  journal_entries: jes,
  ledger_entries: jes.flatMap((j) => j.lines),
  fiscal_periods: [{ id: FY, association_id: A, start_date: '2025-01-01', end_date: '2025-12-31', status: 'closed' }],
  chart_of_accounts: Object.values(acct).map((a) => ({ ...a, association_id: A, fund_id: FUND, is_active: true })),
  budgets: [budget],
})

const december = periodForMonth('2026-01-01')

beforeEach(() => {
  ;({ db } = cappedFakeDb(tables()))
  side.loadDelinquency.mockResolvedValue({ totalOverdue: 0, unitCount: 0, aging: { d90_plus: 0 } })
  side.countPendingApprovals.mockResolvedValue({ w18: 0, bill: 0, w3: 0, collections: 0, arc: 0, contact: 0, join: 0, vendor: 0 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the closing-entry rule', () => {
  it("is journal_entries.source = 'closing', the source closePeriod posts with", () => {
    expect(CLOSING_ENTRY_SOURCE).toBe('closing')
    expect(isClosingEntry({ source: 'closing' })).toBe(true)
    for (const s of ['manual', 'ar_payment', 'ap_invoice', 'adjusting', null]) expect(isClosingEntry({ source: s })).toBe(false)
  })

  it('withoutClosingEntries keeps everything else, in order', () => {
    const rows = [{ id: 'a', source: 'manual' }, { id: 'b', source: 'closing' }, { id: 'c', source: null }]
    expect(withoutClosingEntries(rows).map((r) => r.id)).toEqual(['a', 'c'])
  })
})

describe('period P&L figures leave closing entries out (BL-077)', () => {
  it('income statement for the closed fiscal year shows the real year', async () => {
    const r = await q.computeIncomeStatement(A, FY)
    expect(r.totalIncome).toBe(6000)
    expect(r.totalExpenses).toBe(2400)
    expect(r.netIncome).toBe(3600)
    expect(r.income.map((x) => [x.accountNumber, x.balance])).toEqual([['4000', 6000]])
    expect(r.expenses.map((x) => [x.accountNumber, x.balance])).toEqual([['6100', 2400]])
  })

  it('income statement for December (the month holding the close) shows December', async () => {
    const r = await q.computeIncomeStatementForRange(A, '2025-12-01', '2025-12-31')
    expect(r.totalIncome).toBe(3000)
    expect(r.totalExpenses).toBe(1200)
    expect(r.netIncome).toBe(1800)
  })

  it('cash and modified bases agree with accrual here (no closing line leaks in)', async () => {
    for (const basis of ['cash', 'modified'] as const) {
      const r = await q.computeIncomeStatement(A, FY, basis)
      expect([basis, r.totalIncome, r.totalExpenses]).toEqual([basis, 6000, 2400])
    }
  })

  it('budget vs actual for the closed year shows the real actuals, with and without a cutoff', async () => {
    for (const through of [undefined, '2025-12-31']) {
      const r = await q.computeBudgetVsActual(A, 'b-2025', through ? { through } : {})
      expect(r!.totals.actualIncome).toBe(6000)
      expect(r!.totals.actualExpense).toBe(2400)
      expect(r!.totals.actualNet).toBe(3600)
      expect(r!.rows.map((x) => [x.accountNumber, x.actual, x.variance])).toEqual([
        ['4000', 6000, -1000],
        ['6100', 2400, 600],
      ])
    }
  })

  it('cash flow has no closing row and still nets to the year', async () => {
    const r = await q.computeCashFlow(A, FY)
    expect(r.rows.map((x) => x.source)).toEqual(['ar_payment', 'manual'])
    expect(r.totalNet).toBe(3600)
  })

  it("the board packet's December financials show December", async () => {
    const is = await loadIncomeStatement(A, december, db)
    expect([is.totalIncome, is.totalExpenses, is.netIncome]).toEqual([3000, 1200, 1800])
    const bva = await loadBudgetsVsActual(A, december, db)
    expect(bva).toHaveLength(1)
    expect(bva[0].report.totals.actualIncome).toBe(6000)
    expect(bva[0].report.totals.actualExpense).toBe(2400)
  })

  it('the month-end board report for December shows December', async () => {
    const d = await loadMonthlyReportData(db as never, {
      orgId: 'org-1',
      associationId: A,
      associationName: 'Test HOA',
      timeZone: 'America/New_York',
      period: december,
      today: '2026-01-01',
    })
    expect(d.income).toEqual({ ok: true, data: { totalIncome: 3000, totalExpenses: 1200, netIncome: 1800 } })
    expect(d.budget).toMatchObject({
      ok: true,
      data: {
        hasBudget: true,
        top: [
          { accountName: 'Dues', actual: 6000, variance: -1000 },
          { accountName: 'Landscaping', actual: 2400, variance: 600 },
        ],
      },
    })
  })
})

describe('position reports keep closing entries in', () => {
  it('balance sheet at year end balances, with net income moved into fund balance', async () => {
    const r = await q.computeBalanceSheet(A, '2025-12-31')
    expect(r.assets.map((x) => [x.accountNumber, x.balance])).toEqual([['1010', 3600]])
    expect(r.equity.map((x) => [x.accountNumber, x.balance])).toEqual([['3000', 3600]])
    expect(r.netIncomePtd).toBe(0)
    expect(r.totalEquity).toBe(3600)
    expect(r.isBalanced).toBe(true)
  })

  it("the board packet's December balance sheet balances too", async () => {
    const r = await loadBalanceSheet(A, december, db)
    expect(r.isBalanced).toBe(true)
    expect(r.totalAssets).toBe(3600)
  })

  it('trial balance for the closed year counts the closing entries: income and expense end at zero', async () => {
    const r = await q.computeTrialBalance(A, FY)
    const bal = Object.fromEntries(r.rows.map((x) => [x.accountNumber, x.balance]))
    expect(bal).toEqual({ '1010': 3600, '3000': 3600, '4000': 0, '6100': 0 })
    expect(r.totalDebits).toBe(r.totalCredits)
    expect(r.totalDebits).toBe(6000 + 2400 + 6000 + 2400)
  })
})
