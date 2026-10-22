// BL-126 — opening balances, the pure part.
//
// A board taking over books from a manager (or from a spreadsheet) has, as
// of a start date: money in the bank per fund, homeowners who owe money,
// and maybe prepaid assessments and unpaid bills. This module turns those
// figures into ONE journal entry that balances in every fund — the
// difference going to that fund's balance account (opening equity, "the
// plug") — plus one charge per home that owes.
//
// Nothing here posts. The figures go to /approvals as a proposal
// (proposal.ts) and the executor (executor.ts) posts them once a board
// member approves.
//
// Pure: zod and relative imports only. The wizard (client), the server
// action and the approvals executor all build the entry with the SAME
// function, so the review screen is exactly what gets posted.

import { normalizeAddress } from '../../properties/normalize-address'
import { normalizeUnit } from '../../properties/match-home'
import { parseCsvTable } from '../../properties/import'
import { csvLine } from '../../csv'

/** Largest single amount accepted, in cents ($10,000,000). Anything bigger is a typo. */
export const MAX_AMOUNT_CENTS = 1_000_000_000
/** Homes per opening balance — the roster import's own row cap. */
export const MAX_HOMES = 5000

// ─── the books ───────────────────────────────────────────────────────

export interface BooksFundRow {
  id: string
  code: string
  name: string
  fund_type: string
  is_active: boolean
}

export interface BooksAccountRow {
  id: string
  account_number: string
  account_name: string
  account_type: string
  fund_id: string | null
  is_active: boolean
}

export interface OpeningFund {
  fundId: string
  code: string
  name: string
  cash: { accountId: string; label: string }
  equity: { accountId: string; label: string }
}

export interface OpeningBooks {
  funds: OpeningFund[]
  /** The fund homeowner charges post in (Operating) — what dues use. */
  operatingFundId: string | null
  ar: { accountId: string; label: string } | null
  prepaid: { accountId: string; fundId: string; label: string } | null
  payable: { accountId: string; label: string } | null
  /** Funds left out, and why (no cash or no fund balance account). */
  notes: string[]
}

const label = (a: BooksAccountRow) => `${a.account_number} ${a.account_name}`
const byNumber = (a: BooksAccountRow, b: BooksAccountRow) => a.account_number.localeCompare(b.account_number)

/**
 * Which accounts each figure posts to, from the association's own chart.
 * Cash is the fund's lowest-numbered 10xx asset account; the plug is the
 * fund's lowest-numbered equity account (3000 Fund Balance — Operating,
 * 3010 Fund Balance — Reserve in the standard chart). Homeowner balances
 * use 1100 Accounts Receivable in the Operating fund, exactly as dues do.
 */
export function resolveOpeningBooks(funds: readonly BooksFundRow[], accounts: readonly BooksAccountRow[]): OpeningBooks {
  const active = accounts.filter((a) => a.is_active).slice().sort(byNumber)
  const notes: string[] = []
  const out: OpeningFund[] = []
  for (const f of funds.filter((x) => x.is_active).slice().sort((a, b) => a.code.localeCompare(b.code))) {
    const cash = active.find((a) => a.fund_id === f.id && a.account_type === 'asset' && a.account_number.startsWith('10'))
    const equity = active.find((a) => a.fund_id === f.id && a.account_type === 'equity')
    if (!cash || !equity) {
      notes.push(
        `${f.name} has no ${!cash ? 'cash account' : 'fund balance account'} in the chart of accounts, so it isn’t offered here. Add one under Accounts first.`,
      )
      continue
    }
    out.push({
      fundId: f.id,
      code: f.code,
      name: f.name,
      cash: { accountId: cash.id, label: label(cash) },
      equity: { accountId: equity.id, label: label(equity) },
    })
  }
  const operating =
    out.find((f) => f.code === 'OPERATING') ??
    out.find((f) => funds.find((x) => x.id === f.fundId)?.fund_type === 'operating') ??
    null
  const ar = active.find((a) => a.account_number === '1100')
  const prepaid = active.find((a) => a.account_number === '2100')
  const payable = active.find((a) => a.account_number === '2010')
  const prepaidFund = prepaid?.fund_id && out.some((f) => f.fundId === prepaid.fund_id) ? prepaid.fund_id : operating?.fundId
  return {
    funds: out,
    operatingFundId: operating?.fundId ?? null,
    ar: ar && operating ? { accountId: ar.id, label: label(ar) } : null,
    prepaid: prepaid && prepaidFund ? { accountId: prepaid.id, fundId: prepaidFund, label: label(prepaid) } : null,
    payable: payable ? { accountId: payable.id, label: label(payable) } : null,
    notes,
  }
}

// ─── money ───────────────────────────────────────────────────────────

/**
 * "$1,234.56", "1234.5", "(12.00)" and "-12" → cents. Null when it isn't a
 * number. Parentheses and a leading minus are negative (accountant style).
 */
export function parseCents(raw: string): number | null {
  let s = raw.trim().replace(/[$,\s]/g, '').replace(/^USD/i, '')
  if (s === '' || s === '-') return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  }
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  const cents = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2))
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

export function centsToUsd(c: number): string {
  const abs = Math.abs(c) / 100
  return `${c < 0 ? '−' : ''}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── homes ───────────────────────────────────────────────────────────

export interface BooksUnitRow {
  id: string
  address_line1: string
  unit_number: string | null
  lot_number: string | null
}

export function unitLabel(u: Pick<BooksUnitRow, 'address_line1' | 'unit_number'>): string {
  return u.unit_number ? `${u.address_line1}, unit ${u.unit_number}` : u.address_line1
}

export interface HomeBalanceRow {
  /** 1-based line in what was pasted (the header counts). */
  line: number
  unitId: string
  label: string
  cents: number
}

export interface HomeBalanceError {
  line: number
  reason: string
}

export interface ParsedHomeBalances {
  rows: HomeBalanceRow[]
  errors: HomeBalanceError[]
  /** Lines with a zero balance: nothing to charge. */
  zero: number
}

type Lookup = { kind: 'match'; unit: BooksUnitRow } | { kind: 'none' } | { kind: 'ambiguous' }

interface UnitIndex {
  byAddress: Map<string, BooksUnitRow[]>
  byUnit: Map<string, BooksUnitRow[]>
  byLot: Map<string, BooksUnitRow[]>
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  m.set(k, [...(m.get(k) ?? []), v])
}

function indexUnits(units: readonly BooksUnitRow[]): UnitIndex {
  const idx: UnitIndex = { byAddress: new Map(), byUnit: new Map(), byLot: new Map() }
  for (const u of units) {
    const a = normalizeAddress(u.address_line1)
    if (a) push(idx.byAddress, a, u)
    const n = normalizeUnit(u.unit_number)
    if (n) push(idx.byUnit, n, u)
    const l = normalizeUnit(u.lot_number)
    if (l) push(idx.byLot, l, u)
  }
  return idx
}

const one = (list: BooksUnitRow[] | undefined): Lookup =>
  !list || list.length === 0 ? { kind: 'none' } : list.length === 1 ? { kind: 'match', unit: list[0] } : { kind: 'ambiguous' }

/** Address + unit, the roster import's rule: never guesses between several homes. */
function lookupAddress(idx: UnitIndex, address: string, unit: string | null): Lookup {
  const hits = idx.byAddress.get(normalizeAddress(address)) ?? []
  if (hits.length === 0) return { kind: 'none' }
  const u = normalizeUnit(unit)
  if (u) {
    const same = hits.filter((h) => normalizeUnit(h.unit_number) === u)
    if (same.length > 0) return one(same)
    return hits.length === 1 && !normalizeUnit(hits[0].unit_number) ? { kind: 'match', unit: hits[0] } : { kind: 'none' }
  }
  return one(hits)
}

/** One "home" cell: a unit number, a lot number, or a street address. */
function lookupHome(idx: UnitIndex, home: string): Lookup {
  const key = normalizeUnit(home)
  if (key && /^[a-z]?\d+[a-z]?$/.test(key)) {
    const byUnit = one(idx.byUnit.get(key))
    if (byUnit.kind !== 'none') return byUnit
    const byLot = one(idx.byLot.get(key))
    if (byLot.kind !== 'none') return byLot
  }
  return lookupAddress(idx, home, null)
}

/**
 * The same matching rules for other importers (the CINC aging import,
 * cinc-aging.ts): `address` is address + unit, `key` is an exact unit or
 * lot number. Both never guess between several homes.
 */
export interface UnitMatcher {
  address(address: string, unit: string | null): Lookup
  key(key: string): Lookup
}

export type { Lookup as UnitLookup }

export function createUnitMatcher(units: readonly BooksUnitRow[]): UnitMatcher {
  const idx = indexUnits(units)
  return {
    address: (address, unit) => lookupAddress(idx, address, unit),
    key: (raw) => {
      const k = normalizeUnit(raw)
      if (!k) return { kind: 'none' }
      const byUnit = one(idx.byUnit.get(k))
      return byUnit.kind !== 'none' ? byUnit : one(idx.byLot.get(k))
    },
  }
}

type Columns = { home: number } | { address: number; unit: number | null }

const AMOUNT_HEAD = /^(amount|balance|owed|amount owed|balance due|due|total|opening balance|current balance)$/
const ADDRESS_HEAD = /^(address|property|property address|street|street address|address line ?1)$/
const UNIT_HEAD = /^(unit|unit number|unit #|apt|lot|lot number|home|account)$/

/**
 * An unquoted "1,200.00" in a CSV line arrives as two cells, "1" and
 * "200.00". When the amount is the last column, put thousands groups back
 * together: a trailing run of 3-digit cells after a 1–3-digit one.
 */
function mergeGroupedAmount(row: string[]): string[] {
  const out = [...row]
  while (
    out.length >= 3 &&
    /^\d{3}(\.\d{0,2})?\)?$/.test(out[out.length - 1]) &&
    /^\(?-?\$?\s*\d{1,3}(,\d{3})*$/.test(out[out.length - 2])
  ) {
    const last = out.pop()!
    out[out.length - 1] = `${out[out.length - 1]},${last}`
  }
  return out
}

function splitTable(text: string): string[][] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  // A paste from a spreadsheet arrives tab-separated.
  if (firstLine.includes('\t') && !firstLine.includes(',')) {
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '')
      .map((l) => l.split('\t'))
  }
  return parseCsvTable(text)
}

/**
 * Pasted or uploaded per-home balances → one charge per home.
 *
 * Accepted shapes (with or without a heading row):
 *   home, amount            — home is a unit number, a lot number or an address
 *   address, unit, amount
 * A heading row is recognised by its amount column ("Amount", "Balance",
 * "Owed", …), and then the address/unit columns are found by name.
 *
 * Every home must be one of THIS association's homes (`units` is that
 * list): anything else is an error, never a guess. A home listed twice, a
 * negative (credit) balance, or an amount that isn't a number is an error
 * on its line. A zero balance is counted and skipped.
 */
export function parseHomeBalances(text: string, units: readonly BooksUnitRow[]): ParsedHomeBalances {
  const table = splitTable(text).map((r) => r.map((c) => c.trim()))
  const rows: HomeBalanceRow[] = []
  const errors: HomeBalanceError[] = []
  let zero = 0
  if (table.length === 0) return { rows, errors, zero }
  const idx = indexUnits(units)

  const head = table[0].map((c) => c.toLowerCase().replace(/\s+/g, ' ').replace(/[:*]/g, '').trim())
  const amountAt = head.findIndex((c) => AMOUNT_HEAD.test(c))
  let start = 0
  // Per line: which cell is the amount, and which say the home.
  let layout: (r: string[]) => { amountCol: number; cols: Columns; r: string[] }
  if (amountAt >= 0) {
    start = 1
    const addressAt = head.findIndex((c) => ADDRESS_HEAD.test(c))
    const unitAt = head.findIndex((c) => UNIT_HEAD.test(c))
    const cols: Columns =
      addressAt >= 0
        ? { address: addressAt, unit: unitAt >= 0 ? unitAt : null }
        : unitAt >= 0
          ? { home: unitAt }
          : { home: amountAt === 0 ? 1 : 0 }
    const amountLast = amountAt === head.length - 1
    layout = (row) => {
      const r = amountLast && row.length > head.length ? mergeGroupedAmount(row) : row
      return { amountCol: amountLast ? r.length - 1 : amountAt, cols, r }
    }
  } else {
    // No heading: "home, amount" or "address, unit, amount", line by line.
    // "40 Elm Court, 101, 200" is address, unit, amount — but so could
    // "Unit 7, 1,200" be home, amount. Merging wins only when the cells
    // don't already name a home as address + unit.
    layout = (row) => {
      let r = mergeGroupedAmount(row)
      if (r.length < row.length && row.length === 3 && lookupAddress(idx, row[0], row[1]).kind !== 'none') r = row
      return { amountCol: r.length - 1, cols: r.length >= 3 ? { address: 0, unit: 1 } : { home: 0 }, r }
    }
  }

  if (table.length - start > MAX_HOMES) {
    return { rows, errors: [{ line: 1, reason: `That’s more than ${MAX_HOMES.toLocaleString('en-US')} homes. Split the list.` }], zero }
  }

  const seen = new Map<string, number>()
  for (let i = start; i < table.length; i++) {
    const line = i + 1
    const { amountCol, cols, r } = layout(table[i])
    const amountRaw = r[amountCol] ?? ''
    const homeText = 'home' in cols ? (r[cols.home] ?? '') : [r[cols.address] ?? '', cols.unit === null ? '' : (r[cols.unit] ?? '')].filter(Boolean).join(', unit ')
    if (r.every((c) => c === '')) continue
    if (!homeText.trim()) {
      errors.push({ line, reason: 'No home on this line.' })
      continue
    }
    const cents = parseCents(amountRaw)
    if (cents === null) {
      errors.push({ line, reason: `“${amountRaw || '(blank)'}” isn’t an amount.` })
      continue
    }
    if (cents < 0) {
      errors.push({
        line,
        reason: 'A credit balance can’t be a charge. Leave this home out and add its credit to Prepaid assessments in step 3.',
      })
      continue
    }
    if (cents > MAX_AMOUNT_CENTS) {
      errors.push({ line, reason: 'That amount is too large. Check the number.' })
      continue
    }
    const found = 'home' in cols ? lookupHome(idx, r[cols.home] ?? '') : lookupAddress(idx, r[cols.address] ?? '', cols.unit === null ? null : (r[cols.unit] ?? null))
    if (found.kind === 'none') {
      errors.push({ line, reason: 'No home in this association matches. Check the address or unit number.' })
      continue
    }
    if (found.kind === 'ambiguous') {
      errors.push({ line, reason: 'Several homes match. Add the unit number to tell them apart.' })
      continue
    }
    const prev = seen.get(found.unit.id)
    if (prev !== undefined) {
      errors.push({ line, reason: `This home is already on line ${prev}. List each home once.` })
      continue
    }
    seen.set(found.unit.id, line)
    if (cents === 0) {
      zero += 1
      continue
    }
    rows.push({ line, unitId: found.unit.id, label: unitLabel(found.unit), cents })
  }
  return { rows, errors, zero }
}

/** The roster import's balances, as text the paste box reads (address, unit, amount). */
export function rosterBalancesText(rows: ReadonlyArray<{ address: string; unit: string | null; balance: number }>): string {
  return [csvLine(['address', 'unit', 'amount']), ...rows.map((r) => csvLine([r.address, r.unit ?? '', Math.round(r.balance * 100) / 100]))].join(
    '\n',
  )
}

// ─── the entry ───────────────────────────────────────────────────────

export interface OpeningInput {
  cutoverDate: string
  /** When the homes' opening charges fall due. Late fees run on charges past due, so this is the board's choice. */
  chargesDueDate: string
  cash: Array<{ fundId: string; cents: number }>
  homes: Array<{ unitId: string; cents: number }>
  prepaidCents: number
  payables: Array<{ fundId: string; cents: number }>
}

export interface OpeningLine {
  accountId: string
  fundId: string
  debitCents: number
  creditCents: number
  /** "1010 Cash — Operating": the account, for the review and the approval. */
  label: string
}

export interface FundTotal {
  fundId: string
  name: string
  debitCents: number
  creditCents: number
  /** What goes to the fund balance account: + credit, − debit. */
  equityCents: number
}

export interface OpeningEntry {
  lines: OpeningLine[]
  charges: Array<{ unitId: string; cents: number }>
  funds: FundTotal[]
  arCents: number
  totalDebitCents: number
}

export type BuildResult = { ok: true; entry: OpeningEntry } | { ok: false; errors: string[] }

const ISO = /^\d{4}-\d{2}-\d{2}$/

function validAmount(c: number): boolean {
  return Number.isSafeInteger(c) && c >= 0 && c <= MAX_AMOUNT_CENTS
}

/**
 * The opening journal entry. Per fund: debit cash (and, in the Operating
 * fund, accounts receivable for the homes' total); credit prepaid
 * assessments and accounts payable; the difference goes to the fund's
 * balance account — a credit normally, a debit if the fund owes more than
 * it holds. So every fund balances by construction, which is what the
 * ledger's validate_je_balances trigger demands.
 *
 * `unitIds` is the association's homes: a charge for any other home is
 * refused here (and again by the executor).
 */
export function buildOpeningEntry(input: OpeningInput, books: OpeningBooks, unitIds: ReadonlySet<string>): BuildResult {
  const errors: string[] = []
  if (!ISO.test(input.cutoverDate)) errors.push('Choose a start date.')
  if (input.homes.length > 0) {
    if (!ISO.test(input.chargesDueDate)) errors.push('Choose when the homes’ balances are due.')
    else if (ISO.test(input.cutoverDate) && input.chargesDueDate < input.cutoverDate) {
      errors.push('The due date for the homes’ balances can’t be before the start date.')
    }
  }

  const fundById = new Map(books.funds.map((f) => [f.fundId, f]))
  const cash = new Map<string, number>()
  for (const c of input.cash) {
    if (!fundById.has(c.fundId)) errors.push('A bank balance is for a fund this association doesn’t have.')
    else if (cash.has(c.fundId)) errors.push(`${fundById.get(c.fundId)!.name} is listed twice.`)
    else if (!validAmount(c.cents)) errors.push(`The ${fundById.get(c.fundId)!.name} bank balance isn’t a valid amount.`)
    else cash.set(c.fundId, c.cents)
  }
  const payables = new Map<string, number>()
  for (const p of input.payables) {
    if (!fundById.has(p.fundId)) errors.push('Unpaid bills are for a fund this association doesn’t have.')
    else if (payables.has(p.fundId)) errors.push(`Unpaid bills for ${fundById.get(p.fundId)!.name} are listed twice.`)
    else if (!validAmount(p.cents)) errors.push(`Unpaid bills for ${fundById.get(p.fundId)!.name} aren’t a valid amount.`)
    else payables.set(p.fundId, p.cents)
  }

  const seen = new Set<string>()
  let arCents = 0
  let badHomes = 0
  for (const h of input.homes) {
    if (!unitIds.has(h.unitId) || seen.has(h.unitId) || !validAmount(h.cents) || h.cents === 0) badHomes += 1
    else {
      seen.add(h.unitId)
      arCents += h.cents
    }
  }
  if (badHomes > 0) errors.push(`${badHomes} ${badHomes === 1 ? 'home amount is' : 'home amounts are'} not valid. Check step 2 again.`)
  if (input.homes.length > MAX_HOMES) errors.push(`More than ${MAX_HOMES.toLocaleString('en-US')} homes.`)
  if (arCents > 0 && (!books.ar || !books.operatingFundId)) {
    errors.push('The chart of accounts has no 1100 Accounts Receivable in the Operating fund, so homeowner balances can’t be entered.')
  }
  if (!validAmount(input.prepaidCents)) errors.push('Prepaid assessments isn’t a valid amount.')
  else if (input.prepaidCents > 0 && !books.prepaid) {
    errors.push('The chart of accounts has no 2100 Prepaid Assessments account, so prepaid assessments can’t be entered.')
  }
  const payableTotal = [...payables.values()].reduce((n, c) => n + c, 0)
  if (payableTotal > 0 && !books.payable) {
    errors.push('The chart of accounts has no 2010 Accounts Payable account, so unpaid bills can’t be entered.')
  }
  if (errors.length > 0) return { ok: false, errors }

  const lines: OpeningLine[] = []
  const funds: FundTotal[] = []
  for (const f of books.funds) {
    const fundLines: OpeningLine[] = []
    const dr = (accountId: string, lbl: string, c: number) => {
      if (c > 0) fundLines.push({ accountId, fundId: f.fundId, debitCents: c, creditCents: 0, label: lbl })
    }
    const cr = (accountId: string, lbl: string, c: number) => {
      if (c > 0) fundLines.push({ accountId, fundId: f.fundId, debitCents: 0, creditCents: c, label: lbl })
    }
    dr(f.cash.accountId, f.cash.label, cash.get(f.fundId) ?? 0)
    if (books.ar && f.fundId === books.operatingFundId) dr(books.ar.accountId, books.ar.label, arCents)
    if (books.prepaid && f.fundId === books.prepaid.fundId) cr(books.prepaid.accountId, books.prepaid.label, input.prepaidCents)
    if (books.payable) cr(books.payable.accountId, books.payable.label, payables.get(f.fundId) ?? 0)
    if (fundLines.length === 0) continue
    const debit = fundLines.reduce((n, l) => n + l.debitCents, 0)
    const credit = fundLines.reduce((n, l) => n + l.creditCents, 0)
    const equity = debit - credit
    if (equity > 0) cr(f.equity.accountId, f.equity.label, equity)
    else dr(f.equity.accountId, f.equity.label, -equity)
    funds.push({
      fundId: f.fundId,
      name: f.name,
      debitCents: Math.max(debit, credit),
      creditCents: Math.max(debit, credit),
      equityCents: equity,
    })
    lines.push(...fundLines)
  }

  if (lines.length === 0) return { ok: false, errors: ['Enter at least one balance.'] }
  const totalDebitCents = lines.reduce((n, l) => n + l.debitCents, 0)
  const charges = input.homes.filter((h) => seen.has(h.unitId))
  return { ok: true, entry: { lines, charges, funds, arCents, totalDebitCents } }
}

/**
 * Re-checks a stored entry before posting: every line one-sided and
 * positive, every fund netting to zero, and the homes' charges adding up
 * to the receivable lines. True when it is safe to post.
 */
export function entryBalances(lines: readonly OpeningLine[], charges: ReadonlyArray<{ cents: number }>, arAccountId: string | null): string | null {
  if (lines.length < 2) return 'The entry has fewer than two lines.'
  const net = new Map<string, number>()
  for (const l of lines) {
    const okSide = (l.debitCents > 0 && l.creditCents === 0) || (l.creditCents > 0 && l.debitCents === 0)
    if (!okSide || !Number.isSafeInteger(l.debitCents) || !Number.isSafeInteger(l.creditCents)) return 'A line is not a single debit or credit.'
    net.set(l.fundId, (net.get(l.fundId) ?? 0) + l.debitCents - l.creditCents)
  }
  if ([...net.values()].some((n) => n !== 0)) return 'The entry doesn’t balance in every fund.'
  const ar = arAccountId ? lines.filter((l) => l.accountId === arAccountId).reduce((n, l) => n + l.debitCents - l.creditCents, 0) : 0
  const charged = charges.reduce((n, c) => n + c.cents, 0)
  if (ar !== charged) return 'The homes’ charges don’t add up to accounts receivable.'
  return null
}
