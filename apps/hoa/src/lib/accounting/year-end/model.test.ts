import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import {
  arAgingAt,
  bankRecStatus,
  buildYearEndZip,
  classifyIncomeAccount,
  form1120HWorksheet,
  necCandidates,
  necCsv,
  NOT_TAX_ADVICE,
  vendorTotals,
  worksheetCsv,
  type VendorInfo,
  type YearEndData,
} from './model'
import type { ReportLineRow } from '../queries'

const line = (accountNumber: string, accountName: string, balance: number): ReportLineRow => ({
  accountId: accountNumber,
  accountNumber,
  accountName,
  accountType: 'income',
  balance,
})

describe('classifyIncomeAccount', () => {
  it('classifies only the clear cases', () => {
    expect(classifyIncomeAccount('Assessment Income')).toBe('exempt_function')
    expect(classifyIncomeAccount('Special Assessment Income')).toBe('exempt_function')
    expect(classifyIncomeAccount('Member Dues')).toBe('exempt_function')
    expect(classifyIncomeAccount('Interest Income')).toBe('non_exempt')
    expect(classifyIncomeAccount('Dividend income')).toBe('non_exempt')
    // Uncertain treatment: left for the CPA.
    expect(classifyIncomeAccount('Late Fee Income')).toBe('unclassified')
    expect(classifyIncomeAccount('Fine Income')).toBe('unclassified')
    expect(classifyIncomeAccount('Other Income')).toBe('unclassified')
    expect(classifyIncomeAccount('Clubhouse Rental')).toBe('unclassified')
    expect(classifyIncomeAccount('Laundry')).toBe('unclassified')
  })
})

describe('form1120HWorksheet', () => {
  it('computes the arithmetic when every line is classified', () => {
    const w = form1120HWorksheet({
      income: [line('4000', 'Assessment Income', 95_000), line('4200', 'Interest Income', 1_100)],
      totalExpenses: 80_000,
    })
    expect(w.exemptFunctionIncome).toBe(95_000)
    expect(w.nonExemptIncome).toBe(1_100)
    expect(w.unclassifiedIncome).toBe(0)
    expect(w.grossIncome).toBe(96_100)
    expect(w.exemptSharePct).toBe(98.9)
    expect(w.nonExemptAfterSpecificDeduction).toBe(1_000)
    expect(w.illustrative30Pct).toBe(300)
  })

  it('leaves the derived lines BLANK while anything is unclassified', () => {
    const w = form1120HWorksheet({
      income: [line('4000', 'Assessment Income', 50_000), line('4100', 'Late Fee Income', 400), line('4200', 'Interest Income', 50)],
      totalExpenses: 40_000,
    })
    expect(w.unclassifiedIncome).toBe(400)
    expect(w.exemptSharePct).toBeNull()
    expect(w.nonExemptAfterSpecificDeduction).toBeNull()
    expect(w.illustrative30Pct).toBeNull()
    const csv = worksheetCsv(w, { start: '2025-01-01', end: '2025-12-31' })
    expect(csv).toContain('Not tax advice')
    expect(csv).toContain('CPA to classify')
    // The 90% test input is always blank: the books cannot answer it.
    expect(csv).toMatch(/90% test input\)?",?,/)
  })

  it('never goes below zero after the $100 deduction', () => {
    const w = form1120HWorksheet({ income: [line('4200', 'Interest Income', 40)], totalExpenses: 0 })
    expect(w.nonExemptAfterSpecificDeduction).toBe(0)
    expect(w.illustrative30Pct).toBe(0)
  })

  it('never states a tax conclusion', () => {
    const w = form1120HWorksheet({ income: [line('4000', 'Assessments', 10_000)], totalExpenses: 9_000 })
    // The disclaimer itself names what the sheet does NOT decide; the rest must not decide it either.
    const csv = worksheetCsv(w, { start: '2025-01-01', end: '2025-12-31' }).replace(NOT_TAX_ADVICE, '').toLowerCase()
    expect(csv).not.toMatch(/\bqualifies\b|\byou owe\b|\bmust file\b|\beligible\b/)
  })
})

describe('vendor totals and 1099-NEC candidates', () => {
  const vendors = new Map<string, VendorInfo>([
    ['v1', { id: 'v1', legalName: 'Green Lawn LLC', dba: null, hasTin: true, w9OnFile: true }],
    ['v2', { id: 'v2', legalName: 'Pool Pros', dba: 'PoolPros', hasTin: false, w9OnFile: null }],
    ['v3', { id: 'v3', legalName: 'Tiny Fix', dba: null, hasTin: false, w9OnFile: false }],
  ])
  const payments = [
    { day: '2025-03-01', amount: 400, method: 'check', vendorId: 'v1' },
    { day: '2025-06-01', amount: 200, method: 'ach', vendorId: 'v1' }, // v1 = exactly $600
    { day: '2025-12-31', amount: 2_500, method: 'card', vendorId: 'v2' },
    { day: '2026-01-01', amount: 9_999, method: 'check', vendorId: 'v2' }, // next year
    { day: '2025-02-01', amount: 599.99, method: 'check', vendorId: 'v3' },
    { day: '2024-12-31', amount: 1_000, method: 'check', vendorId: 'v3' }, // prior year
  ]
  const cal = vendorTotals(payments, vendors, { start: '2025-01-01', end: '2025-12-31' })

  it('sums only the window, per vendor, largest first', () => {
    expect(cal.map((t) => [t.vendorId, t.totalCents])).toEqual([
      ['v2', 250_000],
      ['v1', 60_000],
      ['v3', 59_999],
    ])
    expect(cal[0].cardCents).toBe(250_000)
  })

  it('lists vendors at or over $600, flags $2,000, never shows a tax id', () => {
    const nec = necCandidates(cal, vendors)
    expect(nec.map((n) => n.vendorId)).toEqual(['v2', 'v1'])
    expect(nec[0].overHigherThreshold).toBe(true)
    expect(nec[1].overHigherThreshold).toBe(false)
    const csv = necCsv(nec, 2025)
    expect(csv).toContain('Not stored — verify W-9')
    expect(csv).toContain('Unknown') // v2 has no compliance row
    expect(csv).not.toMatch(/\d{2}-\d{7}/)
  })
})

describe('arAgingAt', () => {
  const labels = new Map([
    ['u1', 'Unit 1'],
    ['u2', 'Unit 2'],
  ])
  it('counts what was owed at year end, ignoring later payments and later charges', () => {
    const aging = arAgingAt(
      [
        // Paid in January: still owed on Dec 31.
        { unitId: 'u1', dueDate: '2025-12-01', amount: 300, payments: [{ day: '2026-01-05', amount: 300 }] },
        // Partly paid before year end, 100+ days late.
        { unitId: 'u1', dueDate: '2025-09-01', amount: 300, payments: [{ day: '2025-09-10', amount: 100 }] },
        // Fully paid in the year: nothing owed.
        { unitId: 'u2', dueDate: '2025-06-01', amount: 300, payments: [{ day: '2025-06-02', amount: 300 }] },
        // Due next year: not in year-end AR.
        { unitId: 'u2', dueDate: '2026-01-01', amount: 300, payments: [] },
      ],
      labels,
      '2025-12-31',
    )
    expect(aging.totalCents).toBe(50_000)
    expect(aging.rows).toHaveLength(1)
    expect(aging.rows[0].buckets['1-30']).toBe(30_000)
    expect(aging.rows[0].buckets['90+']).toBe(20_000)
  })
})

describe('bankRecStatus', () => {
  const accounts = [
    { id: 'a', accountName: 'Operating', bankName: 'First', last4: '1234', isActive: true },
    { id: 'b', accountName: 'Reserve', bankName: 'First', last4: '9999', isActive: true },
    { id: 'c', accountName: 'Old', bankName: null, last4: null, isActive: false },
  ]
  it('takes the latest statement on or before year end', () => {
    const rows = bankRecStatus(
      accounts,
      [
        { bankAccountId: 'a', statementDate: '2025-11-30', statementBalance: 10, reconciledBalance: 10, approved: false },
        { bankAccountId: 'a', statementDate: '2025-12-31', statementBalance: 1000, reconciledBalance: 990, approved: true },
        { bankAccountId: 'a', statementDate: '2026-01-31', statementBalance: 5, reconciledBalance: 5, approved: true },
        { bankAccountId: 'b', statementDate: '2025-06-30', statementBalance: 500, reconciledBalance: null, approved: false },
      ],
      '2025-12-31',
    )
    const by = Object.fromEntries(rows.map((r) => [r.accountName, r]))
    expect(by.Operating).toMatchObject({ status: 'reconciled_to_year_end', statementDate: '2025-12-31', difference: 10, approved: true })
    expect(by.Reserve).toMatchObject({ status: 'reconciled_earlier', difference: null })
    expect(by.Old).toMatchObject({ status: 'never_reconciled', statementDate: null })
  })
})

describe('buildYearEndZip', () => {
  const data: YearEndData = {
    associationName: 'Maple HOA',
    fiscal: { start: '2025-01-01', end: '2025-12-31', status: 'closed' },
    calendarYear: 2025,
    trialBalance: { rows: [], totalDebits: 0, totalCredits: 0 },
    incomeStatement: {
      periodId: 'p',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      basis: 'accrual',
      income: [line('4000', 'Assessment Income', 1000)],
      expenses: [],
      totalIncome: 1000,
      totalExpenses: 0,
      netIncome: 1000,
    },
    balanceSheet: {
      asOfDate: '2025-12-31',
      assets: [],
      liabilities: [],
      equity: [],
      netIncomePtd: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
      isBalanced: true,
    },
    budgets: [],
    glLines: [
      {
        entryDate: '2025-02-01',
        entryNumber: 'JE-1',
        source: 'manual',
        entryMemo: '=HYPERLINK("x")',
        accountNumber: '4000',
        accountName: 'Assessment Income',
        fundCode: 'OPERATING',
        debit: 0,
        credit: 1000,
        lineMemo: null,
      },
    ],
    aging: { rows: [], totals: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }, totalCents: 0 },
    bankRecs: [],
    vendorTotals: [],
    nec: [],
    worksheet: form1120HWorksheet({ income: [line('4000', 'Assessment Income', 1000)], totalExpenses: 0 }),
  }

  it('zips every file plus a README with the not-tax-advice line and row counts', () => {
    const { zip, files } = buildYearEndZip(data, '2026-01-15T00:00:00.000Z')
    const entries = unzipSync(zip)
    expect(Object.keys(entries).sort()).toEqual(
      [
        'README.txt',
        '1099-nec-candidates.csv',
        'ar-aging-at-year-end.csv',
        'balance-sheet.csv',
        'bank-reconciliations.csv',
        'budget-vs-actual.csv',
        'form-1120-h-worksheet.csv',
        'general-ledger.csv',
        'income-statement.csv',
        'trial-balance.csv',
        'vendor-payments.csv',
      ].sort(),
    )
    expect(files.find((f) => f.name === 'general-ledger.csv')?.rows).toBe(1)
    const readme = strFromU8(entries['README.txt'])
    expect(readme).toContain('Not tax advice')
    expect(readme).toContain('general-ledger.csv')
    // The shared CSV helper's formula guard applies inside the zip too.
    expect(strFromU8(entries['general-ledger.csv'])).toContain(`"'=HYPERLINK(""x"")"`)
  })
})
