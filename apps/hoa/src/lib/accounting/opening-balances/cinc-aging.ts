// BL-031 remainder — a CINC Systems aging report (CSV) → per-home opening
// balances for the BL-126 wizard. Pure: no I/O, no database.
//
// The file is untrusted, in a layout we have never seen from a real
// customer (no CINC export has been supplied yet), so the reader is
// defensive rather than exact:
//   - size and row limits are checked before and during parsing; a file
//     over either is refused whole, never silently truncated;
//   - the header row is searched for in the first lines (aging reports
//     put the association name and report date above it), and the board
//     can re-map the columns in the preview;
//   - repeated page headers and "Total" / "Grand Total" rows are skipped,
//     and the grand total is used to reconcile the file;
//   - amounts are text → integer cents with no floating point (the bank
//     import's reader: "$1,234.56", "(12.00)", "12.00-", "12.00 CR");
//   - the homeowner name column is never read. Only account number,
//     address, unit and amounts are.
//
// Every row is matched to one of THIS association's homes by address (+
// unit) or by account number against the homes' unit or lot numbers. It
// never guesses: no match, several matches, or an account number and an
// address that point at different homes are all listed as unmatched.
//
// Nothing here posts. Matched rows feed the wizard, which proposes ONE
// journal entry through /approvals.

import { parseAmountCents, detectDelimiter, splitCsv, type CsvRow } from '../../bank-import/parse'
import { MAX_AMOUNT_CENTS, MAX_HOMES, createUnitMatcher, unitLabel, type BooksUnitRow, type UnitLookup } from './model'

export const AGING_MAX_FILE_BYTES = 2 * 1024 * 1024
export const AGING_MAX_ROWS = MAX_HOMES
/** Lines above the header an aging report may carry (title, date, community). */
const HEADER_SCAN = 25
/** Unmatched rows kept for the preview; the count stays exact. */
export const AGING_MAX_ISSUES = 200
/** Characters kept per echoed cell (account, address, unit). */
const MAX_CELL = 120

const CONTROL = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g
const clip = (s: string) => s.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CELL)
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ─── columns ─────────────────────────────────────────────────────────

export interface AgingMapping {
  /** Column index, or -1 for none. */
  account: number
  address: number
  unit: number
  total: number
}

const ROLE_NAMES = {
  account: ['account', 'account number', 'account no', 'acct', 'acct no', 'acct number', 'homeowner account', 'owner account', 'account id'],
  address: ['property address', 'address', 'street address', 'property', 'address line 1', 'address 1', 'property address 1', 'site address'],
  unit: ['unit', 'unit number', 'unit no', 'lot', 'lot number', 'lot no', 'unit lot'],
  total: [
    'total',
    'total balance',
    'balance',
    'current balance',
    'balance due',
    'total due',
    'amount due',
    'ending balance',
    'total owed',
    'total amount due',
  ],
} as const

type Role = keyof typeof ROLE_NAMES
const ROLES: Role[] = ['total', 'account', 'address', 'unit']

/** "Current", "0-30", "31-60 Days", "Over 90", "90+", "120 Days": an aging bucket. */
const BUCKET = /^(current|\d{1,3}( \d{1,3})?( days?)?( over| plus)?|(over|past) \d{1,3}( days?)?)$/

function assign(cells: readonly string[]): { mapping: AgingMapping; buckets: number[] } {
  const heads = cells.map(norm)
  const claimed = new Set<number>()
  const mapping: AgingMapping = { account: -1, address: -1, unit: -1, total: -1 }
  for (const role of ROLES) {
    for (const name of ROLE_NAMES[role]) {
      const i = heads.findIndex((h, idx) => !claimed.has(idx) && h === name)
      if (i !== -1) {
        mapping[role] = i
        claimed.add(i)
        break
      }
    }
  }
  const buckets = heads.flatMap((h, i) => (!claimed.has(i) && h !== '' && BUCKET.test(h) ? [i] : []))
  return { mapping, buckets }
}

function bucketsFor(cells: readonly string[], mapping: AgingMapping): number[] {
  const taken = new Set([mapping.account, mapping.address, mapping.unit, mapping.total])
  return cells.map(norm).flatMap((h, i) => (!taken.has(i) && h !== '' && BUCKET.test(h) ? [i] : []))
}

function usable(m: AgingMapping, buckets: readonly number[]): boolean {
  return (m.account >= 0 || m.address >= 0) && (m.total >= 0 || buckets.length > 0)
}

// ─── results ─────────────────────────────────────────────────────────

export interface AgingMatch {
  line: number
  unitId: string
  label: string
  cents: number
  via: 'account' | 'address'
}

export interface AgingIssue {
  line: number
  reason: string
  account: string
  address: string
  unit: string
  /** The row's balance, when it could be read. */
  cents: number | null
}

export interface AgingTotals {
  /** Matched homes that owe. */
  matchedCents: number
  /** Matched homes in credit (a positive number): prepaid. */
  creditCents: number
  /** Readable balances of unmatched rows (net). */
  unmatchedCents: number
  /** Every readable home balance in the file (net, credits included). */
  fileCents: number
  /** The report's own grand total row, when it has one. */
  reportCents: number | null
  /** fileCents equals reportCents; null when there is no report total. */
  reconciles: boolean | null
}

export type AgingParse =
  | {
      ok: true
      headers: string[]
      mapping: AgingMapping
      /** The aging bucket columns used when there is no total column. */
      buckets: number[]
      /** Rows that looked like homes (after the header, page headers and totals skipped). */
      rowsRead: number
      matched: AgingMatch[]
      /** Matched homes with a credit balance: counted, never charged. */
      credits: number
      /** Matched homes with a zero balance: counted, nothing to charge. */
      zero: number
      unmatched: AgingIssue[]
      unmatchedCount: number
      /** Total and subtotal rows skipped. */
      summaryRows: number
      totals: AgingTotals
    }
  | { ok: false; error: string; headers?: string[]; mapping?: AgingMapping }

// ─── decoding ────────────────────────────────────────────────────────

const tooBig = () => `The file is larger than ${AGING_MAX_FILE_BYTES / 1024 / 1024} MB. Export the aging report as CSV with just the account, address, unit and balance columns.`
const tooMany = () => `The file has more than ${AGING_MAX_ROWS.toLocaleString('en-US')} rows. Split the report and import it in parts.`

/** Text from an uploaded file's bytes: UTF-8, BOM dropped. Binary (xlsx, PDF) is refused. */
export function decodeAgingFile(bytes: Uint8Array): { ok: true; text: string } | { ok: false; error: string } {
  if (bytes.byteLength === 0) return { ok: false, error: 'The file is empty.' }
  if (bytes.byteLength > AGING_MAX_FILE_BYTES) return { ok: false, error: tooBig() }
  if (bytes.subarray(0, 8192).includes(0)) {
    return { ok: false, error: 'That file isn’t a CSV. In CINC, export the aging report to Excel, then in Excel use File › Save As › CSV.' }
  }
  return { ok: true, text: new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '') }
}

// ─── parsing ─────────────────────────────────────────────────────────

const TOTAL_ROW = /^(grand )?totals?\b|^report total|^association total|^community total|^sub ?total/

function isSummaryRow(cells: readonly string[], m: AgingMapping): boolean {
  const first = cells.map((c) => norm(c)).find((c) => c !== '') ?? ''
  if (TOTAL_ROW.test(first)) return true
  // "Total" sits in the account or address cell on many report layouts.
  const keyCells = [m.account, m.address].filter((i) => i >= 0).map((i) => norm(cells[i] ?? ''))
  return keyCells.some((c) => TOTAL_ROW.test(c))
}

function validMapping(raw: unknown, width: number): AgingMapping | null {
  if (!raw || typeof raw !== 'object') return null
  const out: AgingMapping = { account: -1, address: -1, unit: -1, total: -1 }
  const used = new Set<number>()
  for (const role of ROLES) {
    const v = (raw as Record<string, unknown>)[role]
    if (v === undefined || v === null || v === -1) continue
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= width || used.has(v)) return null
    out[role] = v
    used.add(v)
  }
  return out
}

/** A row's balance: the total column, else the sum of the aging buckets. Null when unreadable. */
function balanceOf(cells: readonly string[], m: AgingMapping, buckets: readonly number[]): { cents: number | null; reason?: string } {
  const read = (i: number) => {
    const s = (cells[i] ?? '').trim()
    return s === '' ? 0 : parseAmountCents(s)
  }
  const bucketVals = buckets.map(read)
  const bucketOk = bucketVals.every((v) => v !== null)
  const bucketSum = bucketOk ? (bucketVals as number[]).reduce((n, v) => n + v, 0) : null
  if (m.total >= 0) {
    const raw = (cells[m.total] ?? '').trim()
    const total = raw === '' ? (bucketSum ?? null) : parseAmountCents(raw)
    if (total === null) return { cents: null, reason: `“${clip(raw) || '(blank)'}” isn’t an amount.` }
    if (raw !== '' && buckets.length > 0 && bucketSum !== null && bucketSum !== total) {
      return { cents: total, reason: 'The aging columns don’t add up to the total on this row. Check the report.' }
    }
    return { cents: total }
  }
  if (bucketSum === null) return { cents: null, reason: 'An aging column on this row isn’t an amount.' }
  return { cents: bucketSum }
}

/**
 * Parse and match an aging report. `mappingOverride` (from the preview's
 * column pickers) replaces the detected columns; it is checked, and an
 * invalid one is refused rather than half-applied.
 */
export function parseCincAging(text: string, units: readonly BooksUnitRow[], mappingOverride?: unknown): AgingParse {
  if (text.length > AGING_MAX_FILE_BYTES) return { ok: false, error: tooBig() }
  const body = text.replace(/^﻿/, '')
  if (body.trim() === '') return { ok: false, error: 'The file is empty.' }
  const rows = splitCsv(body, detectDelimiter(body), AGING_MAX_ROWS + HEADER_SCAN + 1)
  if (rows === null) return { ok: false, error: tooMany() }
  if (rows.length === 0) return { ok: false, error: 'The file is empty.' }

  // The header: the first row (within HEADER_SCAN) that names an account
  // or address column and a balance or aging columns.
  let headerAt = -1
  let detected: { mapping: AgingMapping; buckets: number[] } | null = null
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN); i++) {
    const a = assign(rows[i]!.cells)
    if (usable(a.mapping, a.buckets)) {
      headerAt = i
      detected = a
      break
    }
  }
  if (headerAt === -1 || !detected) {
    // Unknown headings: take the widest early row (titles above it are one
    // cell wide) as the header, so the board can pick the columns.
    let widest = 0
    for (let i = 1; i < Math.min(rows.length, HEADER_SCAN); i++) if (rows[i]!.cells.length > rows[widest]!.cells.length) widest = i
    if (mappingOverride === undefined || mappingOverride === null) {
      return {
        ok: false,
        error:
          'We couldn’t recognise the columns. Choose the account number or property address column, and the balance column, below.',
        headers: rows[widest]!.cells.map(clip),
        mapping: { account: -1, address: -1, unit: -1, total: -1 },
      }
    }
    headerAt = widest
    detected = { mapping: { account: -1, address: -1, unit: -1, total: -1 }, buckets: [] }
  }
  const header = rows[headerAt]!.cells
  const headers = header.map(clip)

  let mapping = detected.mapping
  let buckets = detected.buckets
  if (mappingOverride !== undefined && mappingOverride !== null) {
    const m = validMapping(mappingOverride, header.length)
    if (!m) return { ok: false, error: 'That column choice isn’t valid. Pick each column once.', headers, mapping }
    mapping = m
    buckets = bucketsFor(header, m)
    if (!usable(m, buckets)) {
      return { ok: false, error: 'Choose an account number or address column, and a balance column.', headers, mapping: m }
    }
  }

  const matcher = createUnitMatcher(units)
  const headerKey = header.map(norm).join('|')
  const matched: AgingMatch[] = []
  const unmatched: AgingIssue[] = []
  let unmatchedCount = 0
  let credits = 0
  let zero = 0
  let summaryRows = 0
  let rowsRead = 0
  let reportCents: number | null = null
  const totals = { matchedCents: 0, creditCents: 0, unmatchedCents: 0, fileCents: 0 }
  const seen = new Map<string, number>()

  const cell = (r: CsvRow, i: number) => (i >= 0 ? (r.cells[i] ?? '').trim() : '')

  for (const r of rows.slice(headerAt + 1)) {
    // A page header repeated in the export.
    if (r.cells.map(norm).join('|') === headerKey) continue
    if (isSummaryRow(r.cells, mapping)) {
      summaryRows++
      const b = balanceOf(r.cells, mapping, buckets)
      if (b.cents !== null) reportCents = b.cents // the last one is the grand total
      continue
    }
    const account = clip(cell(r, mapping.account))
    const address = clip(cell(r, mapping.address))
    const unit = clip(cell(r, mapping.unit))
    const b = balanceOf(r.cells, mapping, buckets)
    // A section heading ("Madison Park HOA") or a blank-ish line: no home and no money.
    if (!account && !address) {
      const anyMoney = mapping.total >= 0 ? cell(r, mapping.total) !== '' : buckets.some((i) => cell(r, i) !== '')
      if (!anyMoney) continue
    }
    rowsRead++
    if (rowsRead > AGING_MAX_ROWS) return { ok: false, error: tooMany() }

    const issue = (reason: string, cents: number | null) => {
      unmatchedCount++
      if (cents !== null) {
        totals.unmatchedCents += cents
      }
      if (unmatched.length < AGING_MAX_ISSUES) unmatched.push({ line: r.line, reason, account, address, unit, cents })
    }
    if (b.cents !== null) totals.fileCents += b.cents

    if (b.reason) {
      issue(b.reason, b.cents)
      continue
    }
    const cents = b.cents!
    if (Math.abs(cents) > MAX_AMOUNT_CENTS) {
      issue('That amount is too large. Check the number.', cents)
      continue
    }
    if (!account && !address) {
      issue('No account number or address on this row.', cents)
      continue
    }

    const byAddress: UnitLookup = address ? matcher.address(address, unit || null) : { kind: 'none' }
    const byAccount: UnitLookup = account ? matcher.key(account) : { kind: 'none' }
    let found: { unit: BooksUnitRow; via: 'account' | 'address' } | null = null
    if (byAddress.kind === 'match' && byAccount.kind === 'match' && byAddress.unit.id !== byAccount.unit.id) {
      issue('The account number and the address point to different homes.', cents)
      continue
    }
    if (byAddress.kind === 'match') found = { unit: byAddress.unit, via: 'address' }
    else if (byAccount.kind === 'match') found = { unit: byAccount.unit, via: 'account' }
    if (!found) {
      issue(
        byAddress.kind === 'ambiguous' || byAccount.kind === 'ambiguous'
          ? 'Several homes match. Add the unit number to tell them apart.'
          : 'No home in this association matches this account number or address.',
        cents,
      )
      continue
    }
    const prev = seen.get(found.unit.id)
    if (prev !== undefined) {
      issue(`This is the same home as line ${prev}. CINC can list a past owner’s account too: combine them in the file, then import again.`, cents)
      continue
    }
    seen.set(found.unit.id, r.line)
    if (cents === 0) {
      zero++
      continue
    }
    if (cents < 0) {
      credits++
      totals.creditCents += -cents
      continue
    }
    totals.matchedCents += cents
    matched.push({ line: r.line, unitId: found.unit.id, label: unitLabel(found.unit), cents, via: found.via })
  }

  if (rowsRead === 0) return { ok: false, error: 'The report has a heading row but no homes under it.', headers, mapping }

  return {
    ok: true,
    headers,
    mapping,
    buckets,
    rowsRead,
    matched,
    credits,
    zero,
    unmatched,
    unmatchedCount,
    summaryRows,
    totals: { ...totals, reportCents, reconciles: reportCents === null ? null : reportCents === totals.fileCents },
  }
}

/** The "rows we couldn't match" download, through the guarded CSV writer. */
export const UNMATCHED_HEADER = ['Line', 'Problem', 'Account #', 'Property address', 'Unit', 'Balance'] as const

export function unmatchedRows(issues: readonly AgingIssue[]): Array<Array<string | number>> {
  // The balance stays a number (a text "-12.00" would be quote-guarded as a formula).
  return issues.map((i) => [i.line, i.reason, i.account, i.address, i.unit, i.cents === null ? '' : i.cents / 100])
}
