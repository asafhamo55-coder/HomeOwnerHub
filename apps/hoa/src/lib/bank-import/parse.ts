// BL-144: read a bank statement file (CSV, or OFX/QFX in SGML or XML form)
// into plain transactions. Pure: no I/O, no database.
//
// The file is untrusted. It came from whoever uploaded it, in whatever shape
// their bank (or an attacker) produced. So:
//   - size and row limits are checked before and during parsing, and a file
//     over either is refused whole (never silently truncated);
//   - nothing is evaluated: OFX is read with plain string scanning, never an
//     XML parser (no entities, no DTDs, no external references);
//   - every regex runs on one bounded field or line, with no nested
//     quantifiers, so a hostile file cannot make it backtrack for long;
//   - descriptions lose control and bidi-override characters and are cut
//     to MAX_DESCRIPTION. Formula characters (= + - @) are KEPT here: the
//     stored text stays faithful, and lib/csv.ts neutralises them in every
//     export.
//
// Amounts are converted from text to integer cents without floating point.
// Sign convention matches bank_transactions.amount: positive is money in.

export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const MAX_ROWS = 5000
export const MAX_DESCRIPTION = 200
/** Problem rows kept for the preview; the count stays exact. */
export const MAX_ISSUES = 200
/** Raw text kept per problem row, for the board to see what was skipped. */
const MAX_RAW = 300
/** Preamble lines a bank CSV may put above its header row. */
const HEADER_SCAN = 25
/** $100M in cents: anything larger is a misread column, not a transaction. */
const MAX_ABS_CENTS = 10_000_000_000

export type StatementFormat = 'csv' | 'ofx'

export interface ParsedTxn {
  /** 1-based line (CSV) or transaction number (OFX) in the file. */
  line: number
  /** YYYY-MM-DD */
  postedDate: string
  /** Positive = money in, negative = money out. */
  amountCents: number
  description: string
}

export interface ParseIssue {
  line: number
  reason: string
  /** The row as it appeared, trimmed and shortened. */
  raw: string
}

export type ParseResult =
  | {
      ok: true
      format: StatementFormat
      /** How the CSV was read, for the preview ("Date", "Description", "Amount"). */
      layout: string
      rows: ParsedTxn[]
      issues: ParseIssue[]
      issueCount: number
    }
  | { ok: false; error: string }

// ─── shared field readers ──────────────────────────────────────────────

const CONTROL = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g

export function cleanDescription(s: string): string {
  return s.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION)
}

function rawOf(s: string): string {
  return s.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_RAW)
}

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d > days) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * A statement date. US banks write month first, so 03/04/2026 is March 4.
 * Accepts 2026-03-04, 2026/03/04, 03/04/2026, 3/4/26, 03-04-2026,
 * 20260304, and a trailing time ("2026-03-04 00:00:00", "2026-03-04T…").
 */
export function parseDate(input: string): string | null {
  const s = input.trim().slice(0, 40)
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s)
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T ].*)?$/.exec(s)
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return validYmd(y, Number(m[1]), Number(m[2]))
  }
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s)
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

/**
 * Money text → integer cents, or null. Handles "$1,234.56", "-12.00",
 * "(12.00)", "12.00-", "12.00 CR" / "12.00 DR", "+5", "1.234,56"-free US
 * forms and a lone decimal comma ("12,50"). Empty → null.
 */
export function parseAmountCents(input: string): number | null {
  let s = input.trim().slice(0, 40).replace(/[\s$ ]/g, '').replace(/USD$/i, '')
  if (s === '') return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  const suffix = /(CR|DR|-)$/i.exec(s)
  if (suffix) {
    if (suffix[1]!.toUpperCase() !== 'CR') negative = !negative
    s = s.slice(0, -suffix[1]!.length)
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) s = s.slice(1)
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.')
  else s = s.replace(/,(?=\d{3}(?:[.,]|$))/g, '')
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s) ?? /^()\.(\d{1,2})$/.exec(s)
  if (!m) return null
  const whole = Number(m[1] || '0')
  const frac = Number((m[2] ?? '').padEnd(2, '0') || '0')
  const cents = whole * 100 + frac
  if (cents > MAX_ABS_CENTS) return null
  return negative ? -cents : cents
}

// ─── format detection ──────────────────────────────────────────────────

export function detectFormat(text: string): StatementFormat {
  const head = text.slice(0, 4096)
  if (/^\s*OFXHEADER\s*:/i.test(head) || /<\?OFX\b/i.test(head) || /<OFX>/i.test(head)) return 'ofx'
  return 'csv'
}

/** Text from an uploaded file's bytes: UTF-8, BOM dropped. Binary is refused. */
export function decodeStatement(bytes: Uint8Array): { ok: true; text: string } | { ok: false; error: string } {
  if (bytes.byteLength === 0) return { ok: false, error: 'The file is empty.' }
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: tooBig() }
  // A NUL byte in the first few KB: a spreadsheet, PDF or image, not text.
  const probe = bytes.subarray(0, 8192)
  if (probe.includes(0)) {
    return { ok: false, error: 'That file isn’t a CSV or OFX export. Download the statement as CSV, OFX or QFX from your bank and try again.' }
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '')
  return { ok: true, text }
}

function tooBig(): string {
  return `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Export a shorter date range and import it in parts.`
}

function tooManyRows(): string {
  return `The file has more than ${MAX_ROWS.toLocaleString('en-US')} transactions. Export a shorter date range and import it in parts.`
}

export function parseStatement(text: string): ParseResult {
  if (text.length > MAX_FILE_BYTES) return { ok: false, error: tooBig() }
  const body = text.replace(/^﻿/, '')
  if (body.trim() === '') return { ok: false, error: 'The file is empty.' }
  return detectFormat(body) === 'ofx' ? parseOfx(body) : parseCsv(body)
}

// ─── CSV ───────────────────────────────────────────────────────────────

type Delim = ',' | ';' | '\t'

/** The delimiter that splits the first lines most consistently. */
function detectDelimiter(text: string): Delim {
  const lines = text.split(/\r\n|\n|\r/, HEADER_SCAN).filter((l) => l.trim() !== '')
  let best: Delim = ','
  let bestScore = -1
  for (const d of [',', ';', '\t'] as Delim[]) {
    const counts = lines.map((l) => countOutsideQuotes(l, d))
    const score = counts.reduce((a, b) => a + b, 0)
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === d && !q) n++
  }
  return n
}

interface CsvRow {
  line: number
  cells: string[]
  raw: string
}

/**
 * RFC 4180 with a chosen delimiter. Returns null past maxRows (the caller
 * refuses the file). Blank lines are dropped; `line` is the 1-based line
 * the row starts on.
 */
function splitCsv(text: string, delim: Delim, maxRows: number): CsvRow[] | null {
  const rows: CsvRow[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let startLine = 1
  let startIdx = 0
  const push = (endIdx: number) => {
    row.push(field)
    field = ''
    if (row.some((c) => c.trim() !== '')) rows.push({ line: startLine, cells: row, raw: text.slice(startIdx, endIdx) })
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }
    if (ch === '"' && field.trim() === '') {
      field = ''
      inQuotes = true
    } else if (ch === delim) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      push(i)
      if (rows.length > maxRows) return null
      if (ch === '\r' && text[i + 1] === '\n') i++
      line++
      startLine = line
      startIdx = i + 1
    } else field += ch
  }
  if (field !== '' || row.length > 0) push(text.length)
  if (rows.length > maxRows) return null
  return rows
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Header names, most specific first. A column claims the first role it fits.
const ROLES = {
  date: ['posted date', 'posting date', 'post date', 'transaction date', 'trans date', 'date posted', 'effective date', 'value date', 'booking date', 'date'],
  description: ['description', 'transaction description', 'payee', 'name', 'merchant', 'details', 'narrative', 'transaction', 'memo description'],
  memo: ['memo', 'notes', 'note', 'reference', 'check or slip', 'check number', 'check'],
  amount: ['amount', 'transaction amount', 'amount usd', 'net amount', 'value'],
  debit: ['debit', 'debits', 'debit amount', 'withdrawal', 'withdrawals', 'withdrawal amount', 'money out', 'paid out', 'amount debit', 'outflow'],
  credit: ['credit', 'credits', 'credit amount', 'deposit', 'deposits', 'deposit amount', 'money in', 'paid in', 'amount credit', 'inflow'],
  type: ['type', 'transaction type', 'cr dr', 'dr cr', 'debit credit', 'credit debit indicator'],
} as const

type Role = keyof typeof ROLES

interface Layout {
  headerIndex: number // -1 for headerless
  date: number
  amount?: number
  debit?: number
  credit?: number
  description?: number
  memo?: number
  type?: number
  label: string
}

/** Roles in the order they claim columns: dates and money first. */
const ROLE_ORDER: Role[] = ['date', 'amount', 'debit', 'credit', 'description', 'memo', 'type']

/**
 * Header cells → roles. Each role takes the column whose name comes
 * earliest in its list (exact match first, then a header that starts or
 * ends with the name, like "Amount (USD)"). A column is claimed once, so
 * "Transaction Date" can't also become the description, and Chase's
 * "Details" column loses to its "Description" column.
 */
function assignRoles(cells: string[]): Partial<Record<Role, number>> {
  const heads = cells.map(norm)
  const claimed = new Set<number>()
  const at: Partial<Record<Role, number>> = {}
  for (const role of ROLE_ORDER) {
    search: for (const exact of [true, false]) {
      for (const name of ROLES[role]) {
        const i = heads.findIndex(
          (h, idx) => !claimed.has(idx) && h !== '' && (exact ? h === name : h.startsWith(`${name} `) || h.endsWith(` ${name}`)),
        )
        if (i !== -1) {
          at[role] = i
          claimed.add(i)
          break search
        }
      }
    }
  }
  return at
}

function headerLayout(cells: string[], index: number): Layout | null {
  const at = assignRoles(cells)
  if (at.date === undefined) return null
  if (at.amount === undefined && at.debit === undefined && at.credit === undefined) return null
  const pick = (r: Role) => (at[r] !== undefined ? cells[at[r]!]!.trim() : null)
  const money = at.amount !== undefined ? pick('amount') : [pick('debit'), pick('credit')].filter(Boolean).join(' / ')
  return {
    headerIndex: index,
    date: at.date,
    amount: at.amount,
    debit: at.debit,
    credit: at.credit,
    description: at.description ?? at.memo,
    memo: at.description !== undefined ? at.memo : undefined,
    type: at.type,
    label: [pick('date'), pick('description') ?? pick('memo'), money].filter(Boolean).join(', '),
  }
}

/**
 * Headerless exports (Wells Fargo: "date","amount","*","","description"):
 * the first row is a date then an amount. Description is the last
 * non-empty column after the amount.
 */
function headerlessLayout(rows: CsvRow[]): Layout | null {
  const first = rows[0]
  if (!first || first.cells.length < 2) return null
  if (!parseDate(first.cells[0]!) || parseAmountCents(first.cells[1]!) === null) return null
  return { headerIndex: -1, date: 0, amount: 1, label: 'no header row: date, amount, description' }
}

function parseCsv(text: string): ParseResult {
  const delim = detectDelimiter(text)
  // Preamble lines + header + MAX_ROWS transactions.
  const rows = splitCsv(text, delim, MAX_ROWS + HEADER_SCAN + 1)
  if (rows === null) return { ok: false, error: tooManyRows() }
  if (rows.length === 0) return { ok: false, error: 'The file is empty.' }

  let layout: Layout | null = null
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN) && !layout; i++) layout = headerLayout(rows[i]!.cells, i)
  layout ??= headerlessLayout(rows)
  if (!layout) {
    return {
      ok: false,
      error:
        'We couldn’t find the date and amount columns. The file needs a header row with a date column and either an amount column or separate debit and credit columns.',
    }
  }

  const out: ParsedTxn[] = []
  const issues: ParseIssue[] = []
  let issueCount = 0
  const problem = (r: CsvRow, reason: string) => {
    issueCount++
    if (issues.length < MAX_ISSUES) issues.push({ line: r.line, reason, raw: rawOf(r.raw) })
  }

  const data = rows.slice(layout.headerIndex + 1)
  // An unquoted comma inside a field (1,500.00) shifts every later column.
  // Such a row is wider than both the header and the usual row (some banks
  // end every data row with one extra empty cell, so the header alone is
  // not the yardstick).
  const headerWidth = layout.headerIndex >= 0 ? rows[layout.headerIndex]!.cells.length : 0
  const widthCounts = new Map<number, number>()
  for (const r of data) widthCounts.set(r.cells.length, (widthCounts.get(r.cells.length) ?? 0) + 1)
  let usualWidth = 0
  let usualCount = -1
  for (const [w, n] of widthCounts) {
    if (n > usualCount || (n === usualCount && w < usualWidth)) {
      usualWidth = w
      usualCount = n
    }
  }
  const maxWidth = Math.max(headerWidth, usualWidth)

  for (const r of data) {
    const c = r.cells
    if (layout.headerIndex >= 0 && c.length > maxWidth) {
      problem(r, 'More columns than the header (a comma inside an unquoted field?)')
      continue
    }
    const cell = (i: number | undefined) => (i === undefined ? '' : (c[i] ?? ''))
    const date = parseDate(cell(layout.date))
    let cents: number | null
    if (layout.amount !== undefined) {
      cents = parseAmountCents(cell(layout.amount))
      if (cents !== null && layout.type !== undefined) {
        // A positive amount with a separate DR/CR column (some credit unions).
        const t = norm(cell(layout.type))
        if (cents > 0 && /^(dr|debit|withdrawal|payment|check|fee)\b/.test(t)) cents = -cents
      }
    } else {
      const debit = parseAmountCents(cell(layout.debit))
      const credit = parseAmountCents(cell(layout.credit))
      cents = debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0)
    }
    let description: string
    if (layout.headerIndex === -1) {
      const rest = c.slice(2).map((x) => x.trim()).filter((x) => x !== '' && x !== '*')
      description = rest[rest.length - 1] ?? ''
    } else {
      const d = cell(layout.description).trim()
      const m = cell(layout.memo).trim()
      description = m && m !== d ? `${d} ${m}` : d
    }

    if (!date) {
      problem(r, 'No readable date')
      continue
    }
    if (cents === null) {
      problem(r, 'No readable amount')
      continue
    }
    if (cents === 0) {
      problem(r, 'Amount is zero')
      continue
    }
    if (out.length >= MAX_ROWS) return { ok: false, error: tooManyRows() }
    out.push({ line: r.line, postedDate: date, amountCents: cents, description: cleanDescription(description) })
  }

  if (out.length === 0 && issueCount === 0) return { ok: false, error: 'The file has a header row but no transactions.' }
  return { ok: true, format: 'csv', layout: layout.label, rows: out, issues, issueCount }
}

// ─── OFX / QFX (1.x SGML and 2.x XML) ──────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (whole, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' '
    }
    return ENTITIES[e.toLowerCase()] ?? whole
  })
}

/**
 * The value of an element inside one transaction block: the text after
 * `<TAG>` up to the next `<` or line end. That reads both SGML (no closing
 * tag) and XML (`<TAG>v</TAG>`). Case-insensitive, first occurrence.
 */
function ofxField(block: string, tag: string): string | null {
  const upper = block.toUpperCase()
  const open = `<${tag}>`
  const at = upper.indexOf(open)
  if (at === -1) return null
  const start = at + open.length
  let end = start
  while (end < block.length && block[end] !== '<' && block[end] !== '\n' && block[end] !== '\r') end++
  return decodeEntities(block.slice(start, end)).trim()
}

function parseOfx(text: string): ParseResult {
  const upper = text.toUpperCase()
  const out: ParsedTxn[] = []
  const issues: ParseIssue[] = []
  let issueCount = 0
  let n = 0
  let from = 0
  for (;;) {
    const open = upper.indexOf('<STMTTRN>', from)
    if (open === -1) break
    const close = upper.indexOf('</STMTTRN>', open)
    // SGML files close aggregates; a missing close means the file is cut off.
    const nextOpen = upper.indexOf('<STMTTRN>', open + 9)
    const end = close === -1 ? (nextOpen === -1 ? text.length : nextOpen) : nextOpen !== -1 && nextOpen < close ? nextOpen : close
    const block = text.slice(open, end)
    from = end
    n++
    if (n > MAX_ROWS) return { ok: false, error: tooManyRows() }

    const date = parseDate(ofxField(block, 'DTPOSTED') ?? ofxField(block, 'DTUSER') ?? '')
    const cents = parseAmountCents(ofxField(block, 'TRNAMT') ?? '')
    const name = ofxField(block, 'NAME') ?? ''
    const memo = ofxField(block, 'MEMO') ?? ''
    const checkNum = ofxField(block, 'CHECKNUM')
    let description = name && memo && memo !== name ? `${name} ${memo}` : name || memo
    if (!description && checkNum) description = `Check ${checkNum}`
    const raw = rawOf(block.replace(/<[^>\n]{0,40}>/g, ' '))
    const problem = (reason: string) => {
      issueCount++
      if (issues.length < MAX_ISSUES) issues.push({ line: n, reason, raw })
    }
    if (!date) {
      problem('No readable date')
      continue
    }
    if (cents === null) {
      problem('No readable amount')
      continue
    }
    if (cents === 0) {
      problem('Amount is zero')
      continue
    }
    out.push({ line: n, postedDate: date, amountCents: cents, description: cleanDescription(description) })
  }
  if (n === 0) return { ok: false, error: 'The OFX file has no transactions in it.' }
  return { ok: true, format: 'ofx', layout: 'OFX transactions', rows: out, issues, issueCount }
}
