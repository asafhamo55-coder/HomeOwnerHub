// BL-121 — the year-end CPA package: pure calculators and CSV builders.
//
// Everything here is pure (no DB, no clock) so it can be unit-tested and
// shared by the page preview and the zip route. The loaders live in
// ./load.ts; the statements themselves come from lib/accounting/queries.ts.
//
// Tax wording rule: this package prepares INPUTS for the association's CPA.
// Nothing here says the association qualifies for, should file, or owes
// anything. Where the books cannot answer a question (an income account we
// cannot classify, the 90% expenditure test, entity type for a 1099) the
// cell is left BLANK with a note for the CPA. Never a guess, never a
// conclusion.

import { strToU8, zipSync } from 'fflate'
import { csvDocument } from '@/lib/csv'
import type { BalanceSheet, BudgetVsActual, IncomeStatement, ReportLineRow, TrialBalance } from '../queries'

export const NOT_TAX_ADVICE =
  'Prepared from the association’s books for its CPA. Not tax advice: it does not decide whether the association qualifies for or should file Form 1120-H, or what it owes.'

/** IRS 1099-NEC reporting floor the package lists from (the caller's spec). */
export const NEC_LIST_THRESHOLD_CENTS = 60_000
/**
 * For payments made after 2025, federal law raised the
 * 1099-NEC threshold to $2,000. The list still starts at $600 — a superset
 * is safe for a CPA to trim — and flags who is over $2,000.
 */
export const NEC_HIGHER_THRESHOLD_CENTS = 200_000

const cents = (dollars: number | string | null | undefined): number => Math.round(Number(dollars ?? 0) * 100)
const dollars = (c: number): number => Math.round(c) / 100
const round2 = (n: number): number => Math.round(n * 100) / 100

// ─── 1120-H worksheet ─────────────────────────────────────────────────

export type IncomeClass = 'exempt_function' | 'non_exempt' | 'unclassified'

/**
 * A first-pass classification by account name. Only the clear cases are
 * classified: assessments and dues (exempt function income) and investment
 * income (interest, dividends). Late fees, fines, rentals, "other" and
 * anything else are left for the CPA — the treatment depends on facts the
 * books do not hold.
 */
export function classifyIncomeAccount(accountName: string): IncomeClass {
  const n = accountName.toLowerCase()
  if (/\b(late|fine|penalt|rent|rental|other|misc)/.test(n)) return 'unclassified'
  if (/\b(assessments?|dues)\b/.test(n)) return 'exempt_function'
  if (/\b(interest|dividends?)\b/.test(n)) return 'non_exempt'
  return 'unclassified'
}

export const INCOME_CLASS_LABEL: Record<IncomeClass, string> = {
  exempt_function: 'Exempt function income (assessments / dues)',
  non_exempt: 'Not exempt function income (investment income)',
  unclassified: 'CPA to classify',
}

export interface WorksheetIncomeLine {
  accountNumber: string
  accountName: string
  amount: number
  classification: IncomeClass
}

export interface Form1120HWorksheet {
  incomeLines: WorksheetIncomeLine[]
  exemptFunctionIncome: number
  nonExemptIncome: number
  unclassifiedIncome: number
  grossIncome: number
  totalExpenses: number
  /** exempt / gross × 100, or null (blank) while anything is unclassified or gross ≤ 0. */
  exemptSharePct: number | null
  /** max(0, non-exempt − $100), or null (blank) while anything is unclassified. */
  nonExemptAfterSpecificDeduction: number | null
  /** 30% of the line above — arithmetic only, before any deduction the CPA allows. */
  illustrative30Pct: number | null
}

export function form1120HWorksheet(statement: Pick<IncomeStatement, 'income' | 'totalExpenses'>): Form1120HWorksheet {
  const incomeLines = statement.income.map((r) => ({
    accountNumber: r.accountNumber,
    accountName: r.accountName,
    amount: round2(r.balance),
    classification: classifyIncomeAccount(r.accountName),
  }))
  const sum = (c: IncomeClass) =>
    dollars(incomeLines.filter((l) => l.classification === c).reduce((s, l) => s + cents(l.amount), 0))
  const exemptFunctionIncome = sum('exempt_function')
  const nonExemptIncome = sum('non_exempt')
  const unclassifiedIncome = sum('unclassified')
  const grossIncome = dollars(incomeLines.reduce((s, l) => s + cents(l.amount), 0))
  const allClassified = incomeLines.every((l) => l.classification !== 'unclassified' || cents(l.amount) === 0)
  const exemptSharePct =
    allClassified && grossIncome > 0 ? Math.round((exemptFunctionIncome / grossIncome) * 1000) / 10 : null
  const nonExemptAfterSpecificDeduction = allClassified ? Math.max(0, round2(nonExemptIncome - 100)) : null
  const illustrative30Pct = nonExemptAfterSpecificDeduction == null ? null : round2(nonExemptAfterSpecificDeduction * 0.3)
  return {
    incomeLines,
    exemptFunctionIncome,
    nonExemptIncome,
    unclassifiedIncome,
    grossIncome,
    totalExpenses: round2(statement.totalExpenses),
    exemptSharePct,
    nonExemptAfterSpecificDeduction,
    illustrative30Pct,
  }
}

const BLANK = ''

export function worksheetCsv(w: Form1120HWorksheet, fiscal: { start: string; end: string }): string {
  const unclassifiedNote =
    'Blank: some income is not classified. The CPA classifies those lines, then completes this line.'
  const rows: unknown[][] = [
    ['Note', BLANK, NOT_TAX_ADVICE],
    ['Fiscal year', BLANK, `${fiscal.start} to ${fiscal.end}`],
    ['Basis', BLANK, 'Accrual, posted entries only, year-end closing entries left out.'],
    ...w.incomeLines.map((l) => [
      `Income: ${l.accountNumber} ${l.accountName}`,
      l.amount,
      l.classification === 'unclassified'
        ? 'CPA to classify (exempt function or not). Left out of both subtotals below.'
        : `First-pass classification by account name: ${INCOME_CLASS_LABEL[l.classification]}. CPA to confirm.`,
    ]),
    ['Exempt function income (classified lines)', w.exemptFunctionIncome, 'Assessments and dues accounts.'],
    ['Income that is not exempt function income (classified lines)', w.nonExemptIncome, 'Interest and dividend accounts.'],
    ['Income left for the CPA to classify', w.unclassifiedIncome, 'Late fees, fines, rentals, other income and anything else.'],
    ['Gross income (all income accounts)', w.grossIncome, BLANK],
    [
      'Exempt function income as a % of gross income (60% test input)',
      w.exemptSharePct ?? BLANK,
      w.exemptSharePct == null ? unclassifiedNote : 'Arithmetic only. The CPA applies the test.',
    ],
    ['Total expenses (all expense accounts)', w.totalExpenses, BLANK],
    [
      'Expenses to acquire, build, manage, maintain and care for association property (90% test input)',
      BLANK,
      'Blank: the books do not tag expenses this way. The CPA completes this from the general ledger.',
    ],
    [
      'Units used as residences (85% test input)',
      BLANK,
      'Blank: not held in the accounting records. The CPA confirms with the board.',
    ],
    [
      'Non-exempt income less the $100 specific deduction',
      w.nonExemptAfterSpecificDeduction ?? BLANK,
      w.nonExemptAfterSpecificDeduction == null
        ? unclassifiedNote
        : 'Arithmetic only, before any expenses the CPA allows against this income.',
    ],
    [
      '30% of the line above',
      w.illustrative30Pct ?? BLANK,
      w.illustrative30Pct == null
        ? unclassifiedNote
        : 'Arithmetic only, not a tax estimate. The CPA determines any tax due.',
    ],
  ]
  return csvDocument(['Item', 'Amount', 'Note'], rows)
}

// ─── Vendor payments and 1099-NEC candidates ──────────────────────────

export interface VendorPaymentInput {
  /** The payment's day on the association's calendar ('YYYY-MM-DD'). */
  day: string
  amount: number | string
  method: string | null
  vendorId: string | null
}

export interface VendorInfo {
  id: string
  legalName: string
  dba: string | null
  hasTin: boolean
  w9OnFile: boolean | null
}

export interface VendorTotal {
  vendorId: string | null
  vendorName: string
  dba: string | null
  payments: number
  totalCents: number
  cardCents: number
  firstDay: string
  lastDay: string
}

/** Sum payments in [start, end] (inclusive days) per vendor, largest first. */
export function vendorTotals(
  payments: readonly VendorPaymentInput[],
  vendors: ReadonlyMap<string, VendorInfo>,
  range: { start: string; end: string },
): VendorTotal[] {
  const by = new Map<string, VendorTotal>()
  for (const p of payments) {
    if (p.day < range.start || p.day > range.end) continue
    const key = p.vendorId ?? '(no vendor)'
    const v = p.vendorId ? vendors.get(p.vendorId) : undefined
    const c = cents(p.amount)
    const row = by.get(key) ?? {
      vendorId: p.vendorId,
      vendorName: v?.legalName ?? (p.vendorId ? 'Vendor not found' : 'Bill with no vendor'),
      dba: v?.dba ?? null,
      payments: 0,
      totalCents: 0,
      cardCents: 0,
      firstDay: p.day,
      lastDay: p.day,
    }
    row.payments += 1
    row.totalCents += c
    if (p.method === 'card') row.cardCents += c
    if (p.day < row.firstDay) row.firstDay = p.day
    if (p.day > row.lastDay) row.lastDay = p.day
    by.set(key, row)
  }
  return [...by.values()].sort((a, b) => b.totalCents - a.totalCents || a.vendorName.localeCompare(b.vendorName))
}

export function vendorPaymentsCsv(rows: readonly VendorTotal[]): string {
  return csvDocument(
    ['Vendor', 'DBA', 'Payments', 'Total paid', 'Paid by card', 'First payment', 'Last payment'],
    rows.map((r) => [r.vendorName, r.dba, r.payments, dollars(r.totalCents), dollars(r.cardCents), r.firstDay, r.lastDay]),
  )
}

export interface NecCandidate extends VendorTotal {
  overHigherThreshold: boolean
  w9OnFile: boolean | null
  hasTin: boolean
}

/**
 * Vendors paid ≥ $600 in the calendar year. Entity type is not stored, so
 * nobody is dropped as a corporation: every row says "verify W-9".
 */
export function necCandidates(
  calendarTotals: readonly VendorTotal[],
  vendors: ReadonlyMap<string, VendorInfo>,
): NecCandidate[] {
  return calendarTotals
    .filter((t) => t.vendorId != null && t.totalCents >= NEC_LIST_THRESHOLD_CENTS)
    .map((t) => {
      const v = vendors.get(t.vendorId!)
      return {
        ...t,
        overHigherThreshold: t.totalCents >= NEC_HIGHER_THRESHOLD_CENTS,
        w9OnFile: v?.w9OnFile ?? null,
        hasTin: v?.hasTin ?? false,
      }
    })
}

const yesNo = (b: boolean | null): string => (b == null ? 'Unknown' : b ? 'Yes' : 'No')

export function necCsv(rows: readonly NecCandidate[], calendarYear: number): string {
  return csvDocument(
    [
      'Vendor',
      'DBA',
      `Total paid in ${calendarYear}`,
      'Paid by card',
      'Over $2,000',
      'W-9 on file',
      'Tax ID on file',
      'Entity type',
      'Note',
    ],
    rows.map((r) => [
      r.vendorName,
      r.dba,
      dollars(r.totalCents),
      dollars(r.cardCents),
      r.overHigherThreshold ? 'Yes' : 'No',
      yesNo(r.w9OnFile),
      r.hasTin ? 'Yes' : 'No',
      'Not stored — verify W-9',
      r.cardCents > 0
        ? 'Card payments are usually reported by the card processor, not on a 1099-NEC. CPA to confirm.'
        : '',
    ]),
  )
}

// ─── AR aging at year end ─────────────────────────────────────────────

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'
export const AGING_BUCKETS: readonly AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+']

const dayMs = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
export function daysBetween(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / 86_400_000)
}
export function bucketFor(daysLate: number): AgingBucket {
  if (daysLate <= 0) return 'current'
  if (daysLate <= 30) return '1-30'
  if (daysLate <= 60) return '31-60'
  if (daysLate <= 90) return '61-90'
  return '90+'
}

export interface AssessmentAtYearEnd {
  unitId: string
  dueDate: string
  amount: number | string
  /** Payments against this charge, each with its day on the association's calendar. */
  payments: { day: string | null; amount: number | string }[]
}

export interface AgingRow {
  unitId: string
  unitLabel: string
  buckets: Record<AgingBucket, number>
  totalCents: number
}

/**
 * What each home owed at the close of `asOf`: charges due on or before it,
 * less payments made on or before it. A payment made after year end does
 * not reduce the year-end balance.
 */
export function arAgingAt(
  rows: readonly AssessmentAtYearEnd[],
  unitLabels: ReadonlyMap<string, string>,
  asOf: string,
): { rows: AgingRow[]; totals: Record<AgingBucket, number>; totalCents: number } {
  const byUnit = new Map<string, AgingRow>()
  const zero = () => Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>
  const totals = zero()
  let total = 0
  for (const a of rows) {
    if (a.dueDate > asOf) continue
    const paid = a.payments.filter((p) => p.day != null && p.day <= asOf).reduce((s, p) => s + cents(p.amount), 0)
    const owed = cents(a.amount) - paid
    if (owed <= 0) continue
    const b = bucketFor(daysBetween(a.dueDate, asOf))
    const row = byUnit.get(a.unitId) ?? { unitId: a.unitId, unitLabel: unitLabels.get(a.unitId) ?? 'Unknown home', buckets: zero(), totalCents: 0 }
    row.buckets[b] += owed
    row.totalCents += owed
    byUnit.set(a.unitId, row)
    totals[b] += owed
    total += owed
  }
  return {
    rows: [...byUnit.values()].sort((x, y) => x.unitLabel.localeCompare(y.unitLabel, 'en', { numeric: true })),
    totals,
    totalCents: total,
  }
}

export function arAgingCsv(aging: ReturnType<typeof arAgingAt>, asOf: string): string {
  const header = ['Home', 'Current', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days', `Total owed at ${asOf}`]
  return csvDocument(header, [
    ...aging.rows.map((r) => [r.unitLabel, ...AGING_BUCKETS.map((b) => dollars(r.buckets[b])), dollars(r.totalCents)]),
    ['Total', ...AGING_BUCKETS.map((b) => dollars(aging.totals[b])), dollars(aging.totalCents)],
  ])
}

// ─── Bank reconciliation status ───────────────────────────────────────

export interface BankAccountInput {
  id: string
  accountName: string
  bankName: string | null
  last4: string | null
  isActive: boolean
}
export interface BankRecInput {
  bankAccountId: string
  statementDate: string
  statementBalance: number | string | null
  reconciledBalance: number | string | null
  approved: boolean
}

export type BankRecStatus = 'reconciled_to_year_end' | 'reconciled_earlier' | 'never_reconciled'
export const BANK_REC_STATUS_LABEL: Record<BankRecStatus, string> = {
  reconciled_to_year_end: 'Reconciled through year end',
  reconciled_earlier: 'Not reconciled through year end',
  never_reconciled: 'Never reconciled',
}

export interface BankRecRow {
  accountName: string
  bankName: string | null
  last4: string | null
  status: BankRecStatus
  statementDate: string | null
  statementBalance: number | null
  reconciledBalance: number | null
  difference: number | null
  approved: boolean | null
}

/**
 * One row per bank account: its latest reconciliation with a statement date
 * on or before year end. "Through year end" means that statement date is in
 * the last 31 days of the year (a month-end statement covers the close).
 */
export function bankRecStatus(
  accounts: readonly BankAccountInput[],
  recs: readonly BankRecInput[],
  yearEnd: string,
): BankRecRow[] {
  return accounts
    .map((a) => {
      const latest = recs
        .filter((r) => r.bankAccountId === a.id && r.statementDate <= yearEnd)
        .sort((x, y) => y.statementDate.localeCompare(x.statementDate))[0]
      if (!latest) {
        return {
          accountName: a.accountName,
          bankName: a.bankName,
          last4: a.last4,
          status: 'never_reconciled' as const,
          statementDate: null,
          statementBalance: null,
          reconciledBalance: null,
          difference: null,
          approved: null,
        }
      }
      const sb = latest.statementBalance == null ? null : cents(latest.statementBalance)
      const rb = latest.reconciledBalance == null ? null : cents(latest.reconciledBalance)
      return {
        accountName: a.accountName,
        bankName: a.bankName,
        last4: a.last4,
        status: daysBetween(latest.statementDate, yearEnd) <= 31 ? ('reconciled_to_year_end' as const) : ('reconciled_earlier' as const),
        statementDate: latest.statementDate,
        statementBalance: sb == null ? null : dollars(sb),
        reconciledBalance: rb == null ? null : dollars(rb),
        difference: sb == null || rb == null ? null : dollars(sb - rb),
        approved: latest.approved,
      }
    })
    .sort((x, y) => x.accountName.localeCompare(y.accountName))
}

export function bankRecCsv(rows: readonly BankRecRow[]): string {
  return csvDocument(
    ['Account', 'Bank', 'Last 4', 'Status', 'Statement date', 'Statement balance', 'Reconciled balance', 'Difference', 'Approved'],
    rows.map((r) => [
      r.accountName,
      r.bankName,
      r.last4,
      BANK_REC_STATUS_LABEL[r.status],
      r.statementDate,
      r.statementBalance,
      r.reconciledBalance,
      r.difference,
      r.approved == null ? '' : r.approved ? 'Yes' : 'No',
    ]),
  )
}

// ─── Statements → CSV ─────────────────────────────────────────────────

export function trialBalanceCsv(tb: TrialBalance): string {
  return csvDocument(
    ['Account', 'Name', 'Type', 'Debits', 'Credits', 'Balance (normal sign)'],
    [
      ...tb.rows.map((r) => [r.accountNumber, r.accountName, r.accountType, round2(r.totalDebits), round2(r.totalCredits), round2(r.balance)]),
      ['Total', '', '', round2(tb.totalDebits), round2(tb.totalCredits), ''],
    ],
  )
}

const lineRows = (section: string, rows: readonly ReportLineRow[]) =>
  rows.map((r) => [section, r.accountNumber, r.accountName, round2(r.balance)])

export function incomeStatementCsv(is: IncomeStatement): string {
  return csvDocument(['Section', 'Account', 'Name', 'Amount'], [
    ...lineRows('Income', is.income),
    ['Total income', '', '', round2(is.totalIncome)],
    ...lineRows('Expense', is.expenses),
    ['Total expenses', '', '', round2(is.totalExpenses)],
    ['Net income', '', '', round2(is.netIncome)],
  ])
}

export function balanceSheetCsv(bs: BalanceSheet): string {
  return csvDocument(['Section', 'Account', 'Name', 'Balance'], [
    ...lineRows('Asset', bs.assets),
    ['Total assets', '', '', round2(bs.totalAssets)],
    ...lineRows('Liability', bs.liabilities),
    ['Total liabilities', '', '', round2(bs.totalLiabilities)],
    ...lineRows('Equity', bs.equity),
    ['Equity', '', 'Net income, period to date', round2(bs.netIncomePtd)],
    ['Total equity', '', '', round2(bs.totalEquity)],
    ['Total liabilities and equity', '', '', round2(bs.totalLiabilities + bs.totalEquity)],
  ])
}

export function budgetVsActualCsv(reports: readonly BudgetVsActual[]): string {
  return csvDocument(
    ['Fund', 'Account', 'Name', 'Type', 'Budgeted', 'Actual', 'Variance (positive = favorable)'],
    reports.flatMap((r) => [
      ...r.rows.map((row) => [r.fundCode, row.accountNumber, row.accountName, row.accountType, round2(row.budgeted), round2(row.actual), round2(row.variance)]),
      [r.fundCode, '', 'Net', '', round2(r.totals.budgetedNet), round2(r.totals.actualNet), round2(r.totals.varianceNet)],
    ]),
  )
}

export interface GlLine {
  entryDate: string
  entryNumber: string
  source: string
  entryMemo: string | null
  accountNumber: string
  accountName: string
  fundCode: string | null
  debit: number
  credit: number
  lineMemo: string | null
}

export function generalLedgerCsv(lines: readonly GlLine[]): string {
  const sorted = [...lines].sort(
    (a, b) =>
      a.accountNumber.localeCompare(b.accountNumber) ||
      a.entryDate.localeCompare(b.entryDate) ||
      a.entryNumber.localeCompare(b.entryNumber, 'en', { numeric: true }),
  )
  return csvDocument(
    ['Account', 'Account name', 'Date', 'Entry', 'Source', 'Entry memo', 'Fund', 'Debit', 'Credit', 'Line memo'],
    sorted.map((l) => [l.accountNumber, l.accountName, l.entryDate, l.entryNumber, l.source, l.entryMemo, l.fundCode, round2(l.debit), round2(l.credit), l.lineMemo]),
  )
}

// ─── The package ──────────────────────────────────────────────────────

export interface YearEndData {
  associationName: string
  fiscal: { start: string; end: string; status: string }
  calendarYear: number
  trialBalance: TrialBalance
  incomeStatement: IncomeStatement
  balanceSheet: BalanceSheet
  budgets: BudgetVsActual[]
  glLines: GlLine[]
  aging: ReturnType<typeof arAgingAt>
  bankRecs: BankRecRow[]
  vendorTotals: VendorTotal[]
  nec: NecCandidate[]
  worksheet: Form1120HWorksheet
}

export interface PackageFile {
  name: string
  rows: number
  text: string
}

export function packageFiles(d: YearEndData): PackageFile[] {
  const files: PackageFile[] = [
    { name: 'trial-balance.csv', rows: d.trialBalance.rows.length, text: trialBalanceCsv(d.trialBalance) },
    {
      name: 'income-statement.csv',
      rows: d.incomeStatement.income.length + d.incomeStatement.expenses.length,
      text: incomeStatementCsv(d.incomeStatement),
    },
    {
      name: 'balance-sheet.csv',
      rows: d.balanceSheet.assets.length + d.balanceSheet.liabilities.length + d.balanceSheet.equity.length,
      text: balanceSheetCsv(d.balanceSheet),
    },
    { name: 'general-ledger.csv', rows: d.glLines.length, text: generalLedgerCsv(d.glLines) },
    { name: 'ar-aging-at-year-end.csv', rows: d.aging.rows.length, text: arAgingCsv(d.aging, d.fiscal.end) },
    { name: 'bank-reconciliations.csv', rows: d.bankRecs.length, text: bankRecCsv(d.bankRecs) },
    { name: 'vendor-payments.csv', rows: d.vendorTotals.length, text: vendorPaymentsCsv(d.vendorTotals) },
    { name: 'budget-vs-actual.csv', rows: d.budgets.reduce((s, b) => s + b.rows.length, 0), text: budgetVsActualCsv(d.budgets) },
    { name: 'form-1120-h-worksheet.csv', rows: d.worksheet.incomeLines.length, text: worksheetCsv(d.worksheet, d.fiscal) },
    { name: '1099-nec-candidates.csv', rows: d.nec.length, text: necCsv(d.nec, d.calendarYear) },
  ]
  return files
}

export function readme(d: YearEndData, files: readonly PackageFile[], generatedAt: string): string {
  const width = Math.max(...files.map((f) => f.name.length))
  return [
    `${d.associationName} — year-end package for the CPA`,
    `Fiscal year ${d.fiscal.start} to ${d.fiscal.end} (${d.fiscal.status})`,
    `Generated ${generatedAt}`,
    '',
    NOT_TAX_ADVICE,
    '',
    'All amounts are US dollars from posted journal entries (accrual basis).',
    'Files are UTF-8 CSV and open in Excel, Numbers and Google Sheets.',
    '',
    'Notes:',
    '- The trial balance is the year’s activity per account and KEEPS any',
    '  year-end closing entries, so a closed year shows income and expense',
    '  netted into fund balance. The income statement and general ledger show',
    '  the activity (the ledger marks closing entries with source "closing").',
    '- The balance sheet is the position at the last day of the fiscal year.',
    '- AR aging counts charges due by year end, less payments made by year end.',
    `- 1099-NEC candidates cover calendar year ${d.calendarYear}, vendors paid $600 or more.`,
    '  For payments made after 2025 the federal threshold is $2,000; see the',
    '  "Over $2,000" column. Entity type is not stored, so no vendor is',
    '  excluded as a corporation: verify each W-9. Tax ids are never included.',
    '- Blank cells in the 1120-H worksheet are for the CPA to complete.',
    '',
    'Files:',
    ...files.map((f) => `  ${f.name.padEnd(width)}  ${f.rows} ${f.rows === 1 ? 'row' : 'rows'}`),
    '',
  ].join('\r\n')
}

/** The whole zip, in memory: one association-year of CSVs is small. */
export function buildYearEndZip(d: YearEndData, generatedAt: string): { zip: Uint8Array; files: PackageFile[] } {
  const files = packageFiles(d)
  const entries: Record<string, Uint8Array> = { 'README.txt': strToU8(readme(d, files, generatedAt)) }
  for (const f of files) entries[f.name] = strToU8(f.text)
  return { zip: zipSync(entries, { level: 6 }), files }
}
