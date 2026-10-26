/**
 * BL-162: the "3-year financial packet" a board hands an owner who asks for
 * the accounting records. From 2027 Georgia defines them in § 43-17A-7(1):
 * "the finalized balance sheet, budget, profit and loss statements, and
 * bank statements for the past three years" (quote: lib/owner-rights/law.ts,
 * tested against the SB 406 fixture). The packet is useful in every state.
 *
 * OWNER-SAFE like the BL-153 annual report: the balance sheet, income
 * statement and adopted budgets are rebuilt with that report's field-by-
 * field builders (ownerBalance, ownerIncome, ownerBudgets), so account names
 * pass through ownerAccountLabel (bank and routing numbers masked) and no
 * per-home balance, owner, vendor or payment record is ever read. Bank
 * statements are not generated: the board attaches the files, and the
 * packet lists, per year, the Documents whose names look like bank
 * statements (names masked the same way) and how many months they cover.
 *
 * Pure. The page renders `FinancialPacket`; ./financial-packet-load.ts reads.
 */

import { ownerAccountLabel, type OwnerBalance, type OwnerBudgetFund, type OwnerIncome, type Section } from '@/lib/annual-report/model'
import { periodLabel } from '@/lib/money/format'

/** Finalized years the packet covers. */
export const PACKET_YEARS = 3

export interface PacketFiscalPeriod {
  start_date: string
  end_date: string
}

export interface PacketYear {
  start: string
  end: string
  label: string
  /** No fiscal period on record: a calendar year stands in. */
  calendar: boolean
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The last PACKET_YEARS fiscal years that have ENDED before `today`, most
 * recent first ("finalized": a year in progress is never included). With no
 * fiscal period on record, the three calendar years before today's.
 */
export function packetYears(periods: readonly PacketFiscalPeriod[], today: string): PacketYear[] {
  const ended = periods
    .filter((p) => DAY.test(p.start_date) && DAY.test(p.end_date) && p.end_date < today)
    .slice()
    .sort((a, b) => (a.end_date < b.end_date ? 1 : a.end_date > b.end_date ? -1 : 0))
  const seen = new Set<string>()
  const unique = ended.filter((p) => (seen.has(p.end_date) ? false : (seen.add(p.end_date), true)))
  if (unique.length > 0) {
    return unique.slice(0, PACKET_YEARS).map((p) => ({ start: p.start_date, end: p.end_date, label: periodLabel(p), calendar: false }))
  }
  const y = Number(today.slice(0, 4))
  return [1, 2, 3].map((k) => {
    const p = { start_date: `${y - k}-01-01`, end_date: `${y - k}-12-31` }
    return { start: p.start_date, end: p.end_date, label: periodLabel(p), calendar: true }
  })
}

// ─── Bank statements in Documents ────────────────────────────────────

export interface PacketDocumentRow {
  id: string
  name: string
}

export interface PacketStatementDoc {
  id: string
  /** Through ownerAccountLabel: an account number in the file name is masked. */
  name: string
  /** 'YYYY-MM' the name points at, or null when it names no month. */
  month: string | null
}

export interface PacketStatements {
  docs: PacketStatementDoc[]
  /** Distinct months of the year with a statement. */
  monthsFound: number
  /** Months in the year (12 for a full fiscal year). */
  monthsInYear: number
}

const STATEMENT_NAME = /bank|statement|stmt/i
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** The 'YYYY-MM' a file name points at: 2025-03, 2025_3, 03-2025, 03/2025, "March 2025", "Mar 2025". */
export function statementMonth(name: string): string | null {
  const pad = (m: number) => String(m).padStart(2, '0')
  const ok = (y: number, m: number) => y >= 1990 && y <= 2099 && m >= 1 && m <= 12
  let m = /(?:^|\D)((?:19|20)\d{2})[-_. /](\d{1,2})(?!\d)/.exec(name)
  if (m && ok(Number(m[1]), Number(m[2]))) return `${m[1]}-${pad(Number(m[2]))}`
  m = /(?:^|\D)(\d{1,2})[-_. /]((?:19|20)\d{2})(?!\d)/.exec(name)
  if (m && ok(Number(m[2]), Number(m[1]))) return `${m[2]}-${pad(Number(m[1]))}`
  const word = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s_-]*((?:19|20)\d{2})\b/i.exec(name)
  if (word) {
    const idx = MONTHS.indexOf(word[1]!.toLowerCase().slice(0, 3)) + 1
    if (ok(Number(word[2]), idx)) return `${word[2]}-${pad(idx)}`
  }
  return null
}

function monthsBetween(start: string, end: string): string[] {
  const out: string[] = []
  let y = Number(start.slice(0, 4))
  let m = Number(start.slice(5, 7))
  const endKey = end.slice(0, 7)
  for (let i = 0; i < 240; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    out.push(key)
    if (key >= endKey) break
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/**
 * The Documents that look like bank statements for `year`: the name says
 * bank/statement, and either names a month inside the year or (no month)
 * names one of the year's calendar years.
 */
export function statementsForYear(docs: readonly PacketDocumentRow[], year: Pick<PacketYear, 'start' | 'end'>): PacketStatements {
  const months = monthsBetween(year.start, year.end)
  const years = [...new Set(months.map((k) => k.slice(0, 4)))]
  const picked: PacketStatementDoc[] = []
  for (const d of docs) {
    if (!STATEMENT_NAME.test(d.name)) continue
    const month = statementMonth(d.name)
    if (month ? months.includes(month) : years.some((y) => d.name.includes(y))) {
      picked.push({ id: d.id, name: ownerAccountLabel(d.name), month })
    }
  }
  picked.sort((a, b) => (a.month ?? '9999').localeCompare(b.month ?? '9999') || a.name.localeCompare(b.name))
  return {
    docs: picked,
    monthsFound: new Set(picked.map((p) => p.month).filter((m): m is string => m !== null)).size,
    monthsInYear: months.length,
  }
}

// ─── The packet ──────────────────────────────────────────────────────

export interface PacketYearSection {
  year: PacketYear
  balance: Section<OwnerBalance>
  income: Section<OwnerIncome>
  /** Adopted (approved) budgets only: a draft is not "the budget". */
  budgets: Section<OwnerBudgetFund[]>
  statements: Section<PacketStatements>
}

export interface FinancialPacket {
  associationName: string
  preparedOn: string
  years: PacketYearSection[]
}

/** Budgets the board adopted for exactly this fiscal year. */
export function adoptedForYear<T extends { status: string; fiscalPeriod: { start_date: string; end_date: string } | null }>(
  budgets: readonly T[],
  year: Pick<PacketYear, 'start' | 'end'>,
): T[] {
  return budgets.filter((b) => b.status === 'approved' && b.fiscalPeriod?.start_date === year.start && b.fiscalPeriod?.end_date === year.end)
}
