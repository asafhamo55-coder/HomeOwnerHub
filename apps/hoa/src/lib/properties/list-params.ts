// Pure URL-parameter handling for the properties list. Deliberately free of
// Supabase and Next imports so it runs under vitest's node-only harness
// (vitest.config.ts is scoped to pure modules).

export type PropertyFilter =
  | 'attention'
  | 'incomplete'
  | 'all'
  | 'owner_occupied'
  | 'leased'
  // Not a tenure, despite sitting beside the three that are: a property is
  // on the waiting list *and* owner-occupied. listProperties therefore
  // branches on it before the tenure fall-through, which maps the filter
  // string straight onto hoa_properties.tenure.
  | 'waiting'
  | 'unknown'

/** The filters behind the list's "Filters" menu — everything except the
 *  two views on the toggle (All, Needs attention). Order is display order. */
export const MENU_FILTER_LABELS = {
  incomplete: 'Incomplete record',
  waiting: 'Waiting list',
  owner_occupied: 'Owner-occupied',
  leased: 'Leased',
  unknown: 'Tenure unknown',
} as const satisfies Partial<Record<PropertyFilter, string>>

export type MenuFilter = keyof typeof MENU_FILTER_LABELS

export function isMenuFilter(f: PropertyFilter): f is MenuFilter {
  return f in MENU_FILTER_LABELS
}

/** Severity (the default) plus one sort per column of the list table. */
export type PropertySort =
  | 'severity'
  | 'address'
  | 'owner'
  | 'contact'
  | 'tenure'
  | 'balance'
  | 'violations'
  | 'arc'
  | 'activity'

export type SortDir = 'asc' | 'desc'

/**
 * The direction a column sorts in when its header is first clicked: text
 * A→Z, money and counts biggest first, activity newest first. Severity
 * "asc" is worst first (rank 1 is the most urgent).
 */
export const DEFAULT_SORT_DIR: Record<PropertySort, SortDir> = {
  severity: 'asc',
  address: 'asc',
  owner: 'asc',
  contact: 'asc',
  tenure: 'asc',
  balance: 'desc',
  violations: 'desc',
  arc: 'desc',
  activity: 'desc',
}

export interface PropertyListParams {
  filter: PropertyFilter
  sort: PropertySort
  dir: SortDir
  search: string
  page: number
  offset: number
  limit: number
}

/** Matches the inbox's page size so the two lists paginate identically. */
export const PROPERTY_PAGE_SIZE = 50

const FILTERS: readonly PropertyFilter[] = [
  'attention',
  'incomplete',
  'all',
  'owner_occupied',
  'leased',
  'waiting',
  'unknown',
]

const SORTS = Object.keys(DEFAULT_SORT_DIR) as readonly PropertySort[]

/**
 * The page opens on every home, worst first. It used to open on the
 * 'attention' queue, and a search ran inside whatever filter was active —
 * so a board member typing an address found nothing unless that home
 * happened to need attention (UX audit, 2026-10). The queue is one click
 * away ("Needs attention"); 'severity' still puts the work at the top.
 */
export const DEFAULT_PROPERTY_FILTER: PropertyFilter = 'all'
export const DEFAULT_PROPERTY_SORT: PropertySort = 'severity'

export function parsePropertyListParams(raw: {
  filter?: string
  sort?: string
  dir?: string
  q?: string
  page?: string
}): PropertyListParams {
  const filter = FILTERS.includes(raw.filter as PropertyFilter)
    ? (raw.filter as PropertyFilter)
    : DEFAULT_PROPERTY_FILTER

  const sort = SORTS.includes(raw.sort as PropertySort)
    ? (raw.sort as PropertySort)
    : DEFAULT_PROPERTY_SORT

  const parsedPage = Number.parseInt(raw.page ?? '', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  const dir: SortDir = raw.dir === 'asc' || raw.dir === 'desc' ? raw.dir : DEFAULT_SORT_DIR[sort]

  return {
    filter,
    sort,
    dir,
    search: (raw.q ?? '').trim(),
    page,
    offset: (page - 1) * PROPERTY_PAGE_SIZE,
    limit: PROPERTY_PAGE_SIZE,
  }
}

/**
 * The list's query string (no leading `?`), defaults omitted. The one
 * builder every properties link uses — the chips, sorts, pager, the row
 * links and the detail route's breadcrumb used to carry four hand-copied
 * versions, which is how a default change silently breaks one of them.
 * Overrides replace a field; `page: 1` (or less) drops the page.
 */
export function propertyListQuery(
  params: Pick<PropertyListParams, 'filter' | 'sort' | 'search' | 'page'> & { dir?: SortDir },
  overrides: Partial<{ filter: PropertyFilter; sort: PropertySort; dir: SortDir; search: string; page: number }> = {},
): string {
  const filter = overrides.filter ?? params.filter
  const sort = overrides.sort ?? params.sort
  // A new sort starts in its own default direction unless one is given.
  const dir =
    overrides.dir ?? (overrides.sort !== undefined && overrides.sort !== params.sort ? undefined : params.dir) ?? DEFAULT_SORT_DIR[sort]
  const search = overrides.search ?? params.search
  const page = overrides.page ?? params.page
  const q = new URLSearchParams()
  if (filter !== DEFAULT_PROPERTY_FILTER) q.set('filter', filter)
  if (sort !== DEFAULT_PROPERTY_SORT) q.set('sort', sort)
  if (dir !== DEFAULT_SORT_DIR[sort]) q.set('dir', dir)
  if (search) q.set('q', search)
  if (page > 1) q.set('page', String(page))
  return q.toString()
}

/** `/properties` plus the query above. */
export function propertyListHref(
  params: Parameters<typeof propertyListQuery>[0],
  overrides: Parameters<typeof propertyListQuery>[1] = {},
): string {
  const s = propertyListQuery(params, overrides)
  return s ? `/properties?${s}` : '/properties'
}

/**
 * The CSV export of exactly the rows the list shows: the same filter and
 * search, all pages. Used to forward only three tenure filters, so the
 * "Needs attention", "Incomplete" and "Waiting list" views exported every
 * home in the association.
 */
export function propertyExportHref(params: Pick<PropertyListParams, 'filter' | 'search'>): string {
  const q = new URLSearchParams()
  if (params.filter !== 'all') q.set('filter', params.filter)
  if (params.search) q.set('q', params.search)
  const s = q.toString()
  return s ? `/properties/export?${s}` : '/properties/export'
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
