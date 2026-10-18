/**
 * File rows + column mapping → roster rows, each validated (P4 / PR-02).
 * Pure; the same validation runs in the browser (dry run) and again on the
 * server before anything is written (commit.ts), so a hand-crafted request
 * can't skip it.
 */
import type { ImportTenure } from '../import'
import { normalizeHeader, type ColumnMapping, type RosterFieldKey } from './fields'
import type { SheetRow } from './xlsx'

export interface RosterRow {
  /** Spreadsheet row number (the heading row is 1). */
  row: number
  address: string
  unit: string | null
  city: string | null
  state: string | null
  zip: string | null
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  mailingAddress: string | null
  tenure: ImportTenure | null
  /** For reference in the preview only. Never posted, never sent to the server. */
  balance: number | null
  /** Why the row can't be imported, or null. */
  issue: string | null
}

/** The fields the server accepts (no balance, no issue). */
export type RosterRowInput = Omit<RosterRow, 'balance' | 'issue'>

const clean = (v: string | undefined): string | null => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FORMULA = /^[=@]/

const LIMITS: Array<[keyof Omit<RosterRowInput, 'row' | 'tenure'>, string, number]> = [
  ['address', 'The address', 200],
  ['unit', 'The unit / lot #', 50],
  ['city', 'The city', 100],
  ['state', 'The state', 50],
  ['zip', 'The ZIP', 20],
  ['ownerName', 'The owner name', 200],
  ['ownerEmail', 'The owner email', 254],
  ['ownerPhone', 'The owner phone', 50],
  ['mailingAddress', 'The mailing address', 300],
]

/** Why this row can't be imported (user-facing), or null when it can. */
export function validateRosterRow(r: Omit<RosterRowInput, 'row' | 'tenure'>): string | null {
  if (!r.address) return 'The address is missing.'
  if (FORMULA.test(r.address)) return 'The address is a spreadsheet formula, not an address.'
  if (r.ownerName && FORMULA.test(r.ownerName)) return 'The owner name is a spreadsheet formula, not a name.'
  for (const [key, what, max] of LIMITS) {
    const v = r[key]
    if (v && v.length > max) return `${what} is too long (${max} characters at most).`
  }
  if (r.ownerEmail && !EMAIL.test(r.ownerEmail)) return 'The owner email isn’t a valid email address.'
  return null
}

/**
 * "Owner-occupied" / "Rented" text, or a yes/no column whose heading says
 * which way yes points ("Rental", "Tenant occupied", "Owner occupied").
 * Blank → null (not in the file); anything else → 'unknown'.
 */
export function parseTenure(value: string, header: string): ImportTenure | null {
  const v = value.trim().toLowerCase()
  if (!v) return null
  const yes = /^(y|yes|true|1|x)$/.test(v)
  const no = /^(n|no|false|0)$/.test(v)
  if (yes || no) {
    const h = normalizeHeader(header)
    if (/owneroccupied|ownerlives|primaryresidence/.test(h)) return yes ? 'owner_occupied' : 'leased'
    if (/rent|lease|tenant/.test(h)) return yes ? 'leased' : 'owner_occupied'
    return 'unknown'
  }
  if (/rent|leas|tenant|investor|non.?owner|absentee/.test(v)) return 'leased'
  if (/owner|occupied|primary|homestead/.test(v)) return 'owner_occupied'
  return 'unknown'
}

/** "$1,234.50" → 1234.5, "(25.00)" → -25. Null when it isn't a number. */
export function parseBalance(value: string): number | null {
  const t = value.trim()
  if (!t) return null
  const negative = /^\(.*\)$/.test(t) || t.startsWith('-')
  const digits = t.replace(/[^0-9.]/g, '')
  if (!/^\d+(\.\d+)?$/.test(digits)) return null
  const n = Math.round(Number(digits) * 100) / 100
  return negative ? -n : n
}

function firstEmail(v: string | null): string | null {
  if (!v) return null
  const first = v
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .find(Boolean)
  return first ? first.toLowerCase() : null
}

function joinMailing(street: string | null, city: string | null, state: string | null, zip: string | null): string | null {
  const tail = [state, zip].filter(Boolean).join(' ')
  const parts = [street, city, tail || null].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export function toRosterRows(headers: readonly string[], rows: readonly SheetRow[], mapping: ColumnMapping): RosterRow[] {
  const get = (cells: readonly string[], field: RosterFieldKey): string | null => {
    const i = mapping[field]
    return i === undefined ? null : clean(cells[i])
  }
  return rows.map(({ n, cells }) => {
    const first = get(cells, 'owner_first_name')
    const last = get(cells, 'owner_last_name')
    let zip = get(cells, 'zip')
    if (zip && /^\d{3,4}$/.test(zip)) zip = zip.padStart(5, '0')
    let mailingZip = get(cells, 'mailing_zip')
    if (mailingZip && /^\d{3,4}$/.test(mailingZip)) mailingZip = mailingZip.padStart(5, '0')
    const tenureCol = mapping.tenure
    const base = {
      address: get(cells, 'address') ?? '',
      unit: get(cells, 'unit'),
      city: get(cells, 'city'),
      state: get(cells, 'state'),
      zip,
      ownerName: get(cells, 'owner_name') ?? ([first, last].filter(Boolean).join(' ') || null),
      ownerEmail: firstEmail(get(cells, 'owner_email')),
      ownerPhone: get(cells, 'owner_phone'),
      mailingAddress: joinMailing(get(cells, 'mailing_address'), get(cells, 'mailing_city'), get(cells, 'mailing_state'), mailingZip),
    }
    const balanceCell = get(cells, 'balance')
    return {
      row: n,
      ...base,
      tenure: tenureCol === undefined ? null : parseTenure(cells[tenureCol] ?? '', headers[tenureCol] ?? ''),
      balance: balanceCell === null ? null : parseBalance(balanceCell),
      issue: validateRosterRow(base),
    }
  })
}
