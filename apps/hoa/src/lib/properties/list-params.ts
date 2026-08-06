// Pure URL-parameter handling for the properties list. Deliberately free of
// Supabase and Next imports so it runs under vitest's node-only harness
// (vitest.config.ts is scoped to pure modules).

export type PropertyFilter =
  | 'attention'
  | 'all'
  | 'owner_occupied'
  | 'leased'
  | 'unknown'

export type PropertySort = 'severity' | 'address' | 'balance'

export interface PropertyListParams {
  filter: PropertyFilter
  sort: PropertySort
  search: string
  page: number
  offset: number
  limit: number
}

/** Matches the inbox's page size so the two lists paginate identically. */
export const PROPERTY_PAGE_SIZE = 50

const FILTERS: readonly PropertyFilter[] = [
  'attention',
  'all',
  'owner_occupied',
  'leased',
  'unknown',
]

const SORTS: readonly PropertySort[] = ['severity', 'address', 'balance']

/**
 * The page opens on the work queue, not on an alphabetical inventory —
 * hence 'attention' and 'severity' as the defaults rather than 'all'.
 */
export function parsePropertyListParams(raw: {
  filter?: string
  sort?: string
  q?: string
  page?: string
}): PropertyListParams {
  const filter = FILTERS.includes(raw.filter as PropertyFilter)
    ? (raw.filter as PropertyFilter)
    : 'attention'

  const sort = SORTS.includes(raw.sort as PropertySort)
    ? (raw.sort as PropertySort)
    : 'severity'

  const parsedPage = Number.parseInt(raw.page ?? '', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  return {
    filter,
    sort,
    search: (raw.q ?? '').trim(),
    page,
    offset: (page - 1) * PROPERTY_PAGE_SIZE,
    limit: PROPERTY_PAGE_SIZE,
  }
}

/**
 * Carried forward from the existing list page. Caps length against
 * pathological input, escapes LIKE wildcards so a stray `%` doesn't match
 * every property, and strips the `,` `(` `)` characters PostgREST uses as
 * `.or()` separators — inside an or() filter those would otherwise change
 * the shape of the query rather than the value being matched.
 */
export function sanitizeSearch(term: string): string {
  return term
    .slice(0, 100)
    .replace(/[%_\\]/g, '\\$&')
    .replace(/[,()]/g, ' ')
}
