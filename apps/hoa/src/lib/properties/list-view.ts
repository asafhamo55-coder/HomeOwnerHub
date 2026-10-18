// The properties list's filter, counts, sort and paging, as pure functions
// over rows already read from hoa_property_list_v (search applied there).
// Free of Supabase and React so vitest's node harness runs it, and shared
// by the list page, the detail route's aside and the CSV export, so the
// three cannot disagree about which homes a view contains.
//
// Why in JS rather than in the query: PostgREST can only order `address`
// as text, which puts "1200 Oak" before "128 Oak", and there is no
// migration budget for a sort key. An association's roster is hundreds of
// rows, so reading it whole (paged past the 1000-row cap) and sorting here
// is cheap — and it lets one read drive every filter count, so the counts
// always describe the same search the list does.

import { DEFAULT_SORT_DIR, type PropertyFilter, type PropertyListParams, type PropertySort, type SortDir } from './list-params'

export interface PropertyViewRow {
  id: string
  address: string
  tenure: 'owner_occupied' | 'leased' | 'unknown' | null
  balance: number
  severityRank: number
  needsAttention: boolean
  hasOwner: boolean
  hasTenure: boolean
  /** Bridged to a `units` row. Read, but no longer "missing data": the
   *  link is the system's bookkeeping (P0 makes create/import write both
   *  records), not something a board member can fill in. Counting it put
   *  the "Missing data" pill on 53 of 57 homes. */
  hasUnitLink: boolean
  onWaitingList: boolean
  // Optional so the pure helpers stay usable with a bare row; the list
  // read always fills them. Each one is a sortable column.
  unitNumber?: string | null
  ownerName?: string | null
  ownerEmail?: string | null
  ownerPhone?: string | null
  daysOverdue?: number
  openViolations?: number
  violationsPastCure?: number
  /** Open ARC applications. Null = the ARC read failed (unknown, not 0). */
  openArc?: number | null
  /** Latest dated thing at the home (ISO). Null = none in the window, or unknown. */
  lastActivityAt?: string | null
}

export type MissingField = 'owner' | 'tenure'

/** What the board can fill in to complete this record, in display order. */
export function missingFields(row: Pick<PropertyViewRow, 'hasOwner' | 'hasTenure'>): MissingField[] {
  const out: MissingField[] = []
  if (!row.hasOwner) out.push('owner')
  if (!row.hasTenure) out.push('tenure')
  return out
}

export function isIncompleteRecord(row: Pick<PropertyViewRow, 'hasOwner' | 'hasTenure'>): boolean {
  return missingFields(row).length > 0
}

/** Exhaustive over PropertyFilter, so a new filter is a type error here. */
export function matchesFilter(row: PropertyViewRow, filter: PropertyFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'attention':
      return row.needsAttention
    case 'incomplete':
      return isIncompleteRecord(row)
    case 'waiting':
      // Not a tenure: a queued home is also owner-occupied.
      return row.onWaitingList
    case 'unknown':
      // `tenure` is nullable; never-recorded is NULL, not the string.
      return row.tenure === null || row.tenure === 'unknown'
    case 'owner_occupied':
    case 'leased':
      return row.tenure === filter
  }
}

const FILTER_KEYS: readonly PropertyFilter[] = [
  'all',
  'attention',
  'incomplete',
  'waiting',
  'owner_occupied',
  'leased',
  'unknown',
]

export type PropertyFilterCounts = Record<PropertyFilter, number>

export function filterCounts(rows: readonly PropertyViewRow[]): PropertyFilterCounts {
  const counts = Object.fromEntries(FILTER_KEYS.map((k) => [k, 0])) as PropertyFilterCounts
  for (const r of rows) for (const k of FILTER_KEYS) if (matchesFilter(r, k)) counts[k]++
  return counts
}

const collator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' })

/** Natural order: "13 Oak" < "128 Oak" < "1200 Oak". */
export function compareAddress(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)
}

const TENURE_ORDER: Record<string, number> = { owner_occupied: 0, leased: 1 }

/**
 * The value a column sorts by, ascending. `null` = nothing to sort on
 * (no owner, no contact, unknown tenure, a failed ARC read, no activity):
 * those rows go LAST in both directions, so flipping a column never puts
 * the blanks on top. Tuples compare left to right.
 */
function sortKey(row: PropertyViewRow, sort: PropertySort): Array<number | string> | null {
  switch (sort) {
    case 'severity':
      return [row.severityRank]
    case 'address':
      return null // compared with the natural collator below
    case 'owner':
      return row.ownerName?.trim() ? [row.ownerName.trim().toLowerCase()] : null
    case 'contact': {
      const c = row.ownerEmail?.trim() || row.ownerPhone?.trim()
      return c ? [c.toLowerCase()] : null
    }
    case 'tenure':
      return row.tenure && row.tenure in TENURE_ORDER ? [TENURE_ORDER[row.tenure]] : null
    case 'balance':
      return [row.balance, row.daysOverdue ?? 0]
    case 'violations':
      return [row.violationsPastCure ?? 0, row.openViolations ?? 0]
    case 'arc':
      return row.openArc === null || row.openArc === undefined ? null : [row.openArc]
    case 'activity':
      return row.lastActivityAt ? [Date.parse(row.lastActivityAt)] : null
  }
}

function compareKeys(a: Array<number | string>, b: Array<number | string>): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === y) continue
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (typeof x === 'number' && typeof y === 'number') return x - y
    return collator.compare(String(x), String(y))
  }
  return 0
}

/**
 * Sort by one column. `dir` defaults to the column's natural direction
 * (DEFAULT_SORT_DIR). Ties always fall back to natural address order,
 * ascending, so a page never reshuffles between loads.
 */
export function sortPropertyRows<T extends PropertyViewRow>(
  rows: readonly T[],
  sort: PropertySort,
  dir: SortDir = DEFAULT_SORT_DIR[sort],
): T[] {
  const byAddress = (a: T, b: T) => compareAddress(a.address, b.address) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const sign = dir === 'asc' ? 1 : -1
  const out = [...rows]
  if (sort === 'address') {
    out.sort((a, b) => sign * byAddress(a, b))
    return out
  }
  out.sort((a, b) => {
    const ka = sortKey(a, sort)
    const kb = sortKey(b, sort)
    if (ka === null && kb === null) return byAddress(a, b)
    if (ka === null) return 1
    if (kb === null) return -1
    return sign * compareKeys(ka, kb) || byAddress(a, b)
  })
  return out
}

/** Digits only, for matching phone numbers whatever the punctuation. */
const digits = (s: string) => s.replace(/\D/g, '')

/**
 * Does the home match a search? Address, unit, owner name and email
 * (case-insensitive substring), the owner phone when the search has at
 * least four digits (so "(555) 010-1234", "555-010" and "5550101234"
 * all find it, but "12" doesn't match every phone), or any resident at
 * the home (`residentHits`: property ids whose residents matched).
 */
export function matchesSearch(
  row: Pick<PropertyViewRow, 'id' | 'address' | 'unitNumber' | 'ownerName' | 'ownerEmail' | 'ownerPhone'>,
  term: string,
  residentHits: ReadonlySet<string>,
): boolean {
  const q = term.trim().toLowerCase()
  if (!q) return true
  if (residentHits.has(row.id)) return true
  for (const field of [row.address, row.unitNumber, row.ownerName, row.ownerEmail]) {
    if (field && field.toLowerCase().includes(q)) return true
  }
  const qd = digits(q)
  return qd.length >= 4 && !!row.ownerPhone && digits(row.ownerPhone).includes(qd)
}

export interface PropertyView<T> {
  /** The current page. */
  rows: T[]
  /** Rows matching the filter (and the search the rows were read with). */
  total: number
  counts: PropertyFilterCounts
}

export function selectPropertyView<T extends PropertyViewRow>(
  rows: readonly T[],
  params: Pick<PropertyListParams, 'filter' | 'sort' | 'offset' | 'limit'> & { dir?: SortDir },
): PropertyView<T> {
  const matching = sortPropertyRows(
    rows.filter((r) => matchesFilter(r, params.filter)),
    params.sort,
    params.dir,
  )
  return {
    rows: matching.slice(params.offset, params.offset + params.limit),
    total: matching.length,
    counts: filterCounts(rows),
  }
}
