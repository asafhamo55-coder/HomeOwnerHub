import { describe, expect, it } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import {
  budgetedContribution,
  computeReserveSnapshot,
  loadReserveSnapshot,
  reserveDisclosureHint,
  reserveYear,
  type ReserveBudgetRow,
  type ReserveFundRow,
  type ReserveJournalEntry,
  type ReserveLedgerLine,
} from './reserves'

// Fictional books: one operating fund, one reserve fund, FY 2026.
const OP = 'fund-op'
const RES = 'fund-res'
const funds: ReserveFundRow[] = [
  { id: OP, name: 'Operating Fund', fund_type: 'operating', is_active: true },
  { id: RES, name: 'Reserve Fund', fund_type: 'reserve', is_active: true },
]
const periods = [
  { start_date: '2025-01-01', end_date: '2025-12-31' },
  { start_date: '2026-01-01', end_date: '2026-12-31' },
]

const acct = {
  cashOp: { account_type: 'asset', account_name: 'Cash — Operating' },
  cashRes: { account_type: 'asset', account_name: 'Cash — Reserve' },
  fbOp: { account_type: 'equity', account_name: 'Fund Balance — Operating' },
  fbRes: { account_type: 'equity', account_name: 'Fund Balance — Reserve' },
  resAssess: { account_type: 'income', account_name: 'Reserve Assessments' },
  interest: { account_type: 'income', account_name: 'Interest Income' },
  resExp: { account_type: 'expense', account_name: 'Reserve Expenditures' },
  xferOut: { account_type: 'expense', account_name: 'Transfer to Reserves' },
  ap: { account_type: 'liability', account_name: 'Accounts Payable' },
}

let n = 0
function je(entry_date: string, source = 'manual'): ReserveJournalEntry {
  n += 1
  return { id: `je-${n}`, entry_date, source }
}
function line(j: ReserveJournalEntry, fund_id: string, account: ReserveLedgerLine['account'], dr: number, cr: number): ReserveLedgerLine {
  return { journal_entry_id: j.id, fund_id, debit_amount: dr, credit_amount: cr, account }
}

// 2025: 100,000 into reserves through fund balance; the year closes.
const j1 = je('2025-03-01')
const j2 = je('2025-12-31', 'closing')
// 2026: monthly transfers from operating (operating half + reserve half), interest, a roof draw, an unpaid reserve bill.
const j3 = je('2026-01-31')
const j4 = je('2026-02-28')
const j5 = je('2026-03-15')
const j6 = je('2026-04-10')
const j7 = je('2026-05-02')
const jFuture = je('2026-07-01')

const lines: ReserveLedgerLine[] = [
  line(j1, RES, acct.cashRes, 100_000, 0),
  line(j1, RES, acct.fbRes, 0, 100_000),
  // A closing entry in the reserve fund: zeroes 2025 interest into fund balance.
  line(j2, RES, acct.interest, 500, 0),
  line(j2, RES, acct.fbRes, 0, 500),
  // Transfers: operating side is not reserve activity; reserve side credits reserve income.
  ...[j3, j4].flatMap((j) => [
    line(j, OP, acct.xferOut, 2_000, 0),
    line(j, OP, acct.cashOp, 0, 2_000),
    line(j, RES, acct.cashRes, 2_000, 0),
    line(j, RES, acct.resAssess, 0, 2_000),
  ]),
  line(j5, RES, acct.cashRes, 150.25, 0),
  line(j5, RES, acct.interest, 0, 150.25),
  // Roof repair paid from reserves.
  line(j6, RES, acct.resExp, 6_000, 0),
  line(j6, RES, acct.cashRes, 0, 6_000),
  // A reserve bill entered, not yet paid: expense + payable in the reserve fund.
  line(j7, RES, acct.resExp, 1_000, 0),
  line(j7, RES, acct.ap, 0, 1_000),
  // After asOf: ignored.
  line(jFuture, RES, acct.cashRes, 9_999, 0),
  line(jFuture, RES, acct.resAssess, 0, 9_999),
]
const journalEntries = [j1, j2, j3, j4, j5, j6, j7, jFuture]

const reserveBudget = (amount: number, status = 'approved', year = 2026): ReserveBudgetRow => ({
  status,
  fund_id: RES,
  fiscalPeriod: { start_date: `${year}-01-01`, end_date: `${year}-12-31` },
  budget_line_items: [
    { amount, account: acct.resAssess },
    { amount: 2_000, account: acct.interest },
    { amount: -12_000, account: acct.resExp },
  ],
})
const operatingBudget = (transfer: number): ReserveBudgetRow => ({
  status: 'approved',
  fund_id: OP,
  fiscalPeriod: { start_date: '2026-01-01', end_date: '2026-12-31' },
  budget_line_items: [
    { amount: 540_000, account: { account_type: 'income', account_name: 'Assessment Income' } },
    { amount: -transfer, account: acct.xferOut },
  ],
})

const snapshot = (over: Partial<Parameters<typeof computeReserveSnapshot>[0]> = {}) => {
  const r = computeReserveSnapshot({ funds, periods, journalEntries, lines, budgets: [reserveBudget(24_000)], asOf: '2026-06-30', ...over })
  if (r.kind !== 'ready') throw new Error('expected a snapshot')
  return r.snapshot
}

describe('computeReserveSnapshot', () => {
  it('balance: reserve assets less reserve liabilities, inception to the as-of day, closing entries kept', () => {
    // 100,000 + 4,000 transfers + 150.25 interest − 6,000 roof − 1,000 unpaid bill
    expect(snapshot().balance).toBe(97_150.25)
  })

  it('YTD contributions, interest and draws for the fiscal year, operating halves and closing entries left out', () => {
    const s = snapshot()
    expect(s.year).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    expect(s.contributionsYtd).toBe(4_000)
    expect(s.interestYtd).toBe(150.25)
    expect(s.drawsYtd).toBe(7_000)
  })

  it('stops at the as-of day', () => {
    const s = snapshot({ asOf: '2026-02-28' })
    expect(s.balance).toBe(104_000)
    expect(s.contributionsYtd).toBe(4_000)
    expect(s.drawsYtd).toBe(0)
  })

  it('counts a credit to reserve fund balance as a contribution and a debit as a draw', () => {
    const a = je('2026-02-01')
    const b = je('2026-03-01')
    const s = snapshot({
      journalEntries: [...journalEntries, a, b],
      lines: [
        ...lines,
        line(a, RES, acct.cashRes, 500, 0),
        line(a, RES, acct.fbRes, 0, 500),
        line(b, RES, acct.fbRes, 250, 0),
        line(b, RES, acct.cashRes, 0, 250),
      ],
    })
    expect(s.contributionsYtd).toBe(4_500)
    expect(s.drawsYtd).toBe(7_250)
  })

  it('compares contributions with the budget prorated by days, and warns when more than 10% behind', () => {
    const s = snapshot()
    // 24,000 × 181/365 days through June 30.
    expect(s.budget).toEqual({ annual: 24_000, ytd: 11_901.37, source: 'reserve_fund' })
    expect(s.behindBudget).toBe(true)

    const onTrack = snapshot({ asOf: '2026-02-28', budgets: [reserveBudget(24_000)] })
    // 24,000 × 59/365 = 3,879.45; 4,000 contributed.
    expect(onTrack.budget?.ytd).toBe(3_879.45)
    expect(onTrack.behindBudget).toBe(false)
  })

  it('no budget line for contributions: no comparison and no warning', () => {
    const s = snapshot({ budgets: [] })
    expect(s.budget).toBeNull()
    expect(s.behindBudget).toBe(false)
  })

  it('no reserve fund: says so instead of zeros', () => {
    expect(computeReserveSnapshot({ funds: [funds[0]!], periods, journalEntries, lines, budgets: [], asOf: '2026-06-30' })).toEqual({
      kind: 'no_reserve_fund',
    })
    // An inactive reserve fund is not set up either.
    expect(
      computeReserveSnapshot({
        funds: [funds[0]!, { ...funds[1]!, is_active: false }],
        periods,
        journalEntries,
        lines,
        budgets: [],
        asOf: '2026-06-30',
      }).kind,
    ).toBe('no_reserve_fund')
  })

  it('falls back to the calendar year when no fiscal period covers the day', () => {
    expect(reserveYear([], '2027-05-01')).toEqual({ start: '2027-01-01', end: '2027-12-31' })
  })
})

describe('budgetedContribution', () => {
  const ids = new Set([RES])
  const year = { start: '2026-01-01', end: '2026-12-31' }

  it('uses the operating budget’s transfer line when the reserve budget sets none', () => {
    expect(budgetedContribution([operatingBudget(18_000)], ids, year, '2026-12-31')).toEqual({
      annual: 18_000,
      ytd: 18_000,
      source: 'operating_transfer',
    })
  })

  it('a reserve-fund contribution wins, so a transfer budgeted on both sides is not counted twice', () => {
    expect(budgetedContribution([operatingBudget(18_000), reserveBudget(24_000)], ids, year, '2026-12-31')?.annual).toBe(24_000)
  })

  it('approved over draft; archived and other years ignored', () => {
    const b = [reserveBudget(30_000, 'draft'), reserveBudget(24_000, 'approved'), reserveBudget(99_000, 'archived'), reserveBudget(50_000, 'approved', 2025)]
    expect(budgetedContribution(b, ids, year, '2026-12-31')?.annual).toBe(24_000)
    expect(budgetedContribution([reserveBudget(30_000, 'draft')], ids, year, '2026-12-31')?.annual).toBe(30_000)
  })
})

describe('reserveDisclosureHint', () => {
  it('only for states whose statute text is on file', () => {
    expect(reserveDisclosureHint('FL')?.cite).toBe('Fla. Stat. § 720.303(6)(h)')
    expect(reserveDisclosureHint('ca')?.cite).toBe('Cal. Civ. Code § 5300(b)(2)')
    expect(reserveDisclosureHint('TX')).toBeNull()
    expect(reserveDisclosureHint(null)).toBeNull()
  })
})

describe('loadReserveSnapshot', () => {
  const A = 'assoc-1'
  const tables = () => ({
    funds: funds.map((f) => ({ ...f, association_id: A })),
    associations: [{ id: A, state: 'FL', governing_law_state: null }],
    fiscal_periods: periods.map((p) => ({ ...p, association_id: A })),
    budgets: [{ ...reserveBudget(24_000), association_id: A, deleted_at: null }],
    journal_entries: journalEntries.map((j) => ({ ...j, association_id: A, status: 'posted' })),
    ledger_entries: lines.map((l, i) => ({ id: `l-${String(i).padStart(3, '0')}`, ...l })),
  })

  it('reads the books and computes the snapshot, with the governing state', async () => {
    const { db } = cappedFakeDb(tables())
    const out = await loadReserveSnapshot(db as never, A, '2026-06-30')
    expect(out.state).toBe('FL')
    expect(out.result.kind).toBe('ready')
    if (out.result.kind === 'ready') expect(out.result.snapshot.balance).toBe(97_150.25)
  })

  it('stops after the funds read when there is no reserve fund', async () => {
    const t = tables()
    const { db, calls } = cappedFakeDb({ ...t, funds: t.funds.filter((f) => f.fund_type !== 'reserve') })
    const out = await loadReserveSnapshot(db as never, A, '2026-06-30')
    expect(out.result).toEqual({ kind: 'no_reserve_fund' })
    expect(calls.some((c) => c.table === 'ledger_entries' || c.table === 'journal_entries')).toBe(false)
  })

  it('a failed read throws instead of reading as zeros', async () => {
    const { db } = cappedFakeDb(tables(), { failAt: { table: 'ledger_entries' } })
    await expect(loadReserveSnapshot(db as never, A, '2026-06-30')).rejects.toThrow(/accounting query failed/)
  })
})
