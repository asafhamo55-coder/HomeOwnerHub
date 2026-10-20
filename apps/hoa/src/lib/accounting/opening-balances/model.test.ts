import { describe, expect, it } from 'vitest'
import {
  buildOpeningEntry,
  entryBalances,
  parseCents,
  parseHomeBalances,
  resolveOpeningBooks,
  rosterBalancesText,
  type BooksAccountRow,
  type BooksFundRow,
  type BooksUnitRow,
  type OpeningInput,
} from './model'

const FUND_OP = '10000000-0000-4000-8000-000000000001'
const FUND_RES = '10000000-0000-4000-8000-000000000002'
const u = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const a = (n: string) => `30000000-0000-4000-8000-00000000${n}`

const FUNDS: BooksFundRow[] = [
  { id: FUND_OP, code: 'OPERATING', name: 'Operating Fund', fund_type: 'operating', is_active: true },
  { id: FUND_RES, code: 'RESERVE', name: 'Reserve Fund', fund_type: 'reserve', is_active: true },
]

// The standard chart (association-setup.ts DEFAULT_CHART_OF_ACCOUNTS), the accounts this uses.
const ACCOUNTS: BooksAccountRow[] = [
  { id: a('1010'), account_number: '1010', account_name: 'Cash — Operating', account_type: 'asset', fund_id: FUND_OP, is_active: true },
  { id: a('1020'), account_number: '1020', account_name: 'Cash — Reserve', account_type: 'asset', fund_id: FUND_RES, is_active: true },
  { id: a('1100'), account_number: '1100', account_name: 'Accounts Receivable', account_type: 'asset', fund_id: null, is_active: true },
  { id: a('1200'), account_number: '1200', account_name: 'Prepaid Expenses', account_type: 'asset', fund_id: FUND_OP, is_active: true },
  { id: a('2010'), account_number: '2010', account_name: 'Accounts Payable', account_type: 'liability', fund_id: null, is_active: true },
  { id: a('2100'), account_number: '2100', account_name: 'Prepaid Assessments', account_type: 'liability', fund_id: FUND_OP, is_active: true },
  { id: a('3000'), account_number: '3000', account_name: 'Fund Balance — Operating', account_type: 'equity', fund_id: FUND_OP, is_active: true },
  { id: a('3010'), account_number: '3010', account_name: 'Fund Balance — Reserve', account_type: 'equity', fund_id: FUND_RES, is_active: true },
  { id: a('4000'), account_number: '4000', account_name: 'Assessment Income', account_type: 'income', fund_id: FUND_OP, is_active: true },
]

const UNITS: BooksUnitRow[] = [
  { id: u(1), address_line1: '12 Oak Street', unit_number: null, lot_number: '14' },
  { id: u(2), address_line1: '40 Elm Court', unit_number: '101', lot_number: null },
  { id: u(3), address_line1: '40 Elm Court', unit_number: '102', lot_number: null },
  { id: u(4), address_line1: '7 Pine Road', unit_number: '7', lot_number: null },
]

const books = resolveOpeningBooks(FUNDS, ACCOUNTS)
const unitIds = new Set(UNITS.map((x) => x.id))

const base = (over: Partial<OpeningInput> = {}): OpeningInput => ({
  cutoverDate: '2026-01-01',
  chargesDueDate: '2026-02-01',
  cash: [],
  homes: [],
  prepaidCents: 0,
  payables: [],
  ...over,
})

describe('resolveOpeningBooks', () => {
  it('finds each fund’s cash and fund balance account in the standard chart', () => {
    expect(books.funds.map((f) => [f.code, f.cash.label, f.equity.label])).toEqual([
      ['OPERATING', '1010 Cash — Operating', '3000 Fund Balance — Operating'],
      ['RESERVE', '1020 Cash — Reserve', '3010 Fund Balance — Reserve'],
    ])
    expect(books.operatingFundId).toBe(FUND_OP)
    expect(books.ar?.accountId).toBe(a('1100'))
    expect(books.prepaid).toMatchObject({ accountId: a('2100'), fundId: FUND_OP })
    expect(books.payable?.accountId).toBe(a('2010'))
    expect(books.notes).toEqual([])
  })

  it('leaves out a fund with no fund balance account, and says why', () => {
    const r = resolveOpeningBooks(FUNDS, ACCOUNTS.filter((x) => x.account_number !== '3010'))
    expect(r.funds.map((f) => f.code)).toEqual(['OPERATING'])
    expect(r.notes[0]).toMatch(/Reserve Fund has no fund balance account/)
  })

  it('ignores inactive accounts and funds', () => {
    const r = resolveOpeningBooks(
      FUNDS.map((f) => (f.code === 'RESERVE' ? { ...f, is_active: false } : f)),
      ACCOUNTS.map((x) => (x.account_number === '1100' ? { ...x, is_active: false } : x)),
    )
    expect(r.funds.map((f) => f.code)).toEqual(['OPERATING'])
    expect(r.ar).toBeNull()
  })
})

describe('parseCents', () => {
  it.each([
    ['1,234.56', 123456],
    ['$450', 45000],
    ['0.5', 50],
    ['.75', 75],
    ['(12.00)', -1200],
    ['-3', -300],
    [' 7 ', 700],
  ])('%s → %d', (raw, cents) => expect(parseCents(raw)).toBe(cents))

  it.each(['', 'abc', '1.234', '12-3', '1e5'])('rejects %j', (raw) => expect(parseCents(raw)).toBeNull())
})

describe('parseHomeBalances', () => {
  it('reads home, amount lines by address, unit number and lot number', () => {
    const r = parseHomeBalances('12 oak st., 450\nunit 7, $1,200.00\n#101, 20\n14, 5', UNITS)
    expect(r.errors).toEqual([{ line: 4, reason: 'This home is already on line 1. List each home once.' }])
    expect(r.rows.map((x) => [x.line, x.unitId, x.cents])).toEqual([
      [1, u(1), 45000],
      [2, u(4), 120000],
      [3, u(2), 2000],
    ])
  })

  it('reads a heading row with address, unit and amount columns in any order', () => {
    const r = parseHomeBalances('Balance,Address,Unit\n300,40 Elm Court,102\n0,40 Elm Court,101', UNITS)
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([{ line: 2, unitId: u(3), label: '40 Elm Court, unit 102', cents: 30000 }])
    expect(r.zero).toBe(1)
  })

  it('tells an unquoted thousands comma from address, unit, amount', () => {
    const r = parseHomeBalances('40 Elm Court, 101, 200\n7 Pine Road, 7, 2,500.00\nUnit 7, 1,200', UNITS)
    expect(r.rows.map((x) => [x.line, x.unitId, x.cents])).toEqual([
      [1, u(2), 20000],
      [2, u(4), 250000],
    ])
    // Line 3 is the same home as line 2, read as "Unit 7" + $1,200.
    expect(r.errors).toEqual([{ line: 3, reason: 'This home is already on line 2. List each home once.' }])
  })

  it('reads a tab-separated paste from a spreadsheet', () => {
    const r = parseHomeBalances('Address\tUnit\tAmount\n12 Oak Street\t\t1,000.00', UNITS)
    expect(r.rows.map((x) => x.cents)).toEqual([100000])
  })

  it('refuses homes outside the association, never guessing between several', () => {
    const r = parseHomeBalances('99 Nowhere Lane, 10\n40 Elm Court, 10', UNITS)
    expect(r.rows).toEqual([])
    expect(r.errors).toEqual([
      { line: 1, reason: 'No home in this association matches. Check the address or unit number.' },
      { line: 2, reason: 'Several homes match. Add the unit number to tell them apart.' },
    ])
  })

  it('refuses credit balances and amounts that are not numbers', () => {
    const r = parseHomeBalances('12 Oak Street, (50.00)\n7 Pine Road, lots', UNITS)
    expect(r.rows).toEqual([])
    expect(r.errors[0].reason).toMatch(/credit balance can’t be a charge/)
    expect(r.errors[1].reason).toMatch(/isn’t an amount/)
  })

  it('round-trips the roster import’s balances', () => {
    const text = rosterBalancesText([
      { address: '40 Elm Court', unit: '101', balance: 12.5 },
      { address: '12 Oak Street', unit: null, balance: 99 },
    ])
    const r = parseHomeBalances(text, UNITS)
    expect(r.errors).toEqual([])
    expect(r.rows.map((x) => [x.unitId, x.cents])).toEqual([
      [u(2), 1250],
      [u(1), 9900],
    ])
  })
})

describe('buildOpeningEntry — balancing', () => {
  it('balances every fund, with each fund’s balance account as the plug', () => {
    const r = buildOpeningEntry(
      base({
        cash: [
          { fundId: FUND_OP, cents: 1_000_000 },
          { fundId: FUND_RES, cents: 5_000_000 },
        ],
        homes: [
          { unitId: u(1), cents: 45_000 },
          { unitId: u(2), cents: 5_000 },
        ],
        prepaidCents: 20_000,
        payables: [{ fundId: FUND_RES, cents: 300_000 }],
      }),
      books,
      unitIds,
    )
    if (!r.ok) throw new Error(r.errors.join())
    const { entry } = r
    expect(entryBalances(entry.lines, entry.charges, books.ar!.accountId)).toBeNull()
    // Operating: Dr cash 10,000 + Dr AR 500 = Cr prepaid 200 + Cr fund balance 10,300.
    const op = entry.lines.filter((l) => l.fundId === FUND_OP)
    expect(op.map((l) => [l.label, l.debitCents, l.creditCents])).toEqual([
      ['1010 Cash — Operating', 1_000_000, 0],
      ['1100 Accounts Receivable', 50_000, 0],
      ['2100 Prepaid Assessments', 0, 20_000],
      ['3000 Fund Balance — Operating', 0, 1_030_000],
    ])
    // Reserve: Dr cash 50,000 = Cr AP 3,000 + Cr fund balance 47,000.
    const res = entry.lines.filter((l) => l.fundId === FUND_RES)
    expect(res.map((l) => [l.label, l.debitCents, l.creditCents])).toEqual([
      ['1020 Cash — Reserve', 5_000_000, 0],
      ['2010 Accounts Payable', 0, 300_000],
      ['3010 Fund Balance — Reserve', 0, 4_700_000],
    ])
    for (const fund of [FUND_OP, FUND_RES]) {
      const lines = entry.lines.filter((l) => l.fundId === fund)
      expect(lines.reduce((n, l) => n + l.debitCents - l.creditCents, 0)).toBe(0)
    }
    expect(entry.arCents).toBe(50_000)
    expect(entry.charges).toHaveLength(2)
    expect(entry.totalDebitCents).toBe(1_000_000 + 50_000 + 5_000_000)
    expect(entry.funds.map((f) => f.equityCents)).toEqual([1_030_000, 4_700_000])
  })

  it('debits the fund balance when a fund owes more than it holds', () => {
    const r = buildOpeningEntry(base({ cash: [{ fundId: FUND_OP, cents: 100 }], payables: [{ fundId: FUND_OP, cents: 500 }] }), books, unitIds)
    if (!r.ok) throw new Error(r.errors.join())
    expect(r.entry.lines.map((l) => [l.label, l.debitCents, l.creditCents])).toEqual([
      ['1010 Cash — Operating', 100, 0],
      ['2010 Accounts Payable', 0, 500],
      ['3000 Fund Balance — Operating', 400, 0],
    ])
    expect(r.entry.funds[0].equityCents).toBe(-400)
  })

  it('leaves out funds with nothing entered and zero lines', () => {
    const r = buildOpeningEntry(base({ cash: [{ fundId: FUND_OP, cents: 100 }, { fundId: FUND_RES, cents: 0 }] }), books, unitIds)
    if (!r.ok) throw new Error(r.errors.join())
    expect(r.entry.lines).toHaveLength(2)
    expect(r.entry.funds.map((f) => f.fundId)).toEqual([FUND_OP])
  })

  it('posts homeowner balances only to the Operating fund, as dues do', () => {
    const r = buildOpeningEntry(base({ homes: [{ unitId: u(3), cents: 999 }] }), books, unitIds)
    if (!r.ok) throw new Error(r.errors.join())
    expect(r.entry.lines.every((l) => l.fundId === FUND_OP)).toBe(true)
    expect(r.entry.lines.map((l) => [l.label, l.debitCents, l.creditCents])).toEqual([
      ['1100 Accounts Receivable', 999, 0],
      ['3000 Fund Balance — Operating', 0, 999],
    ])
  })
})

describe('buildOpeningEntry — validation', () => {
  it('needs at least one balance', () => {
    expect(buildOpeningEntry(base(), books, unitIds)).toEqual({ ok: false, errors: ['Enter at least one balance.'] })
  })

  it('refuses a home outside the association and a home charged twice', () => {
    const r = buildOpeningEntry(
      base({
        homes: [
          { unitId: u(1), cents: 100 },
          { unitId: u(1), cents: 100 },
          { unitId: u(99), cents: 100 },
        ],
      }),
      books,
      unitIds,
    )
    expect(r).toEqual({ ok: false, errors: ['2 home amounts are not valid. Check step 2 again.'] })
  })

  it('refuses a fund the association doesn’t have, or listed twice', () => {
    const other = '10000000-0000-4000-8000-000000000099'
    const r = buildOpeningEntry(
      base({ cash: [{ fundId: other, cents: 1 }, { fundId: FUND_OP, cents: 1 }, { fundId: FUND_OP, cents: 2 }] }),
      books,
      unitIds,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toEqual(['A bank balance is for a fund this association doesn’t have.', 'Operating Fund is listed twice.'])
  })

  it('refuses a due date before the start date when homes are charged', () => {
    const r = buildOpeningEntry(base({ chargesDueDate: '2025-12-31', homes: [{ unitId: u(1), cents: 100 }] }), books, unitIds)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/can’t be before the start date/)
  })

  it('refuses amounts that are negative, fractional or absurd', () => {
    for (const cents of [-1, 1.5, 2_000_000_000]) {
      const r = buildOpeningEntry(base({ cash: [{ fundId: FUND_OP, cents }] }), books, unitIds)
      expect(r.ok).toBe(false)
    }
  })

  it('says which account is missing rather than posting somewhere else', () => {
    const noAr = resolveOpeningBooks(FUNDS, ACCOUNTS.filter((x) => x.account_number !== '1100'))
    const r = buildOpeningEntry(base({ homes: [{ unitId: u(1), cents: 100 }] }), noAr, unitIds)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/no 1100 Accounts Receivable/)
  })
})

describe('entryBalances (the executor’s re-check)', () => {
  const good = buildOpeningEntry(base({ cash: [{ fundId: FUND_OP, cents: 500 }], homes: [{ unitId: u(1), cents: 200 }] }), books, unitIds)
  if (!good.ok) throw new Error('fixture')
  const { lines, charges } = good.entry

  it('accepts the built entry', () => {
    expect(entryBalances(lines, charges, books.ar!.accountId)).toBeNull()
  })

  it('catches a fund that no longer nets to zero', () => {
    const tampered = lines.map((l, i) => (i === 0 ? { ...l, debitCents: l.debitCents + 1 } : l))
    expect(entryBalances(tampered, charges, books.ar!.accountId)).toMatch(/doesn’t balance/)
  })

  it('catches charges that don’t add up to receivables', () => {
    expect(entryBalances(lines, [{ cents: 201 }], books.ar!.accountId)).toMatch(/don’t add up/)
  })

  it('catches a two-sided line', () => {
    const tampered = lines.map((l, i) => (i === 0 ? { ...l, creditCents: 1 } : l))
    expect(entryBalances(tampered, charges, books.ar!.accountId)).toMatch(/single debit or credit/)
  })
})
