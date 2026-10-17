// The properties header's count line. Pure (vitest node harness).
//
// Every subset names what it selected beside the association's size, so a
// number is never mistaken for the whole roster, and a search says how
// many homes it found rather than reusing the unsearched counts.

import type { PropertyFilter } from './list-params'

const SUBSET: Record<Exclude<PropertyFilter, 'all'>, (n: number) => string> = {
  attention: () => 'needing attention',
  incomplete: (n) => `incomplete ${n === 1 ? 'record' : 'records'}`,
  waiting: () => 'on the waiting list',
  owner_occupied: () => 'owner-occupied',
  leased: () => 'leased',
  unknown: () => 'with tenure unknown',
}

export function propertyCountLabel({
  filter,
  total,
  allCount,
  search,
  searchMatches,
}: {
  filter: PropertyFilter
  total: number | null
  allCount: number | null
  search: string
  searchMatches: number | null
}): string {
  const homes = allCount === null ? 'home count unavailable' : `${allCount} ${allCount === 1 ? 'home' : 'homes'}`
  if (total === null) return homes
  const q = `“${search}”`
  if (search && searchMatches !== null) {
    if (filter === 'all') return `${total} ${total === 1 ? 'matches' : 'match'} ${q} · ${homes}`
    return `${total} ${SUBSET[filter](total)} of ${searchMatches} matching ${q} · ${homes}`
  }
  if (filter === 'all') return homes
  return `${total} ${SUBSET[filter](total)} · ${homes}`
}
