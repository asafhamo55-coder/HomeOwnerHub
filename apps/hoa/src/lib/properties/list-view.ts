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

import type { PropertyFilter, PropertyListParams, PropertySort } from './list-params'

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

export function sortPropertyRows<T extends PropertyViewRow>(rows: readonly T[], sort: PropertySort): T[] {
  const byAddress = (a: T, b: T) => compareAddress(a.address, b.address) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const out = [...rows]
  if (sort === 'severity') out.sort((a, b) => a.severityRank - b.severityRank || byAddress(a, b))
  else if (sort === 'balance') out.sort((a, b) => b.balance - a.balance || byAddress(a, b))
  else out.sort(byAddress)
  return out
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
  params: Pick<PropertyListParams, 'filter' | 'sort' | 'offset' | 'limit'>,
): PropertyView<T> {
  const matching = sortPropertyRows(
    rows.filter((r) => matchesFilter(r, params.filter)),
    params.sort,
  )
  return {
    rows: matching.slice(params.offset, params.offset + params.limit),
    total: matching.length,
    counts: filterCounts(rows),
  }
}
