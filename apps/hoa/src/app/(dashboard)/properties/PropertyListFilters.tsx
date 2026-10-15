import Link from 'next/link'
import { SearchForm, cn } from '@homeowner-portal/ui'
import type { PropertyListParams, PropertyFilter, PropertySort } from '@/lib/properties/list-params'

const FILTERS: Array<{ key: PropertyFilter; label: string }> = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'incomplete', label: 'Incomplete' },
  { key: 'all', label: 'All' },
  { key: 'owner_occupied', label: 'Owner-occupied' },
  { key: 'leased', label: 'Leased' },
  { key: 'waiting', label: 'Waiting list' },
  { key: 'unknown', label: 'Unknown' },
]

/** Chips that show a count. The tenure chips deliberately don't — their
 *  counts would need three more head-only queries per render for numbers
 *  nobody triages by. */
const COUNTED: ReadonlySet<PropertyFilter> = new Set<PropertyFilter>([
  'attention',
  'incomplete',
  'all',
  // Counted, unlike the tenure chips: the queue length is a number boards
  // actually triage by — the dashboard already headlines it — and it costs
  // the same single head-only query the three above cost.
  'waiting',
])

const SORTS: Array<{ key: PropertySort; label: string }> = [
  { key: 'severity', label: 'Severity' },
  { key: 'address', label: 'Address' },
  { key: 'balance', label: 'Balance' },
]

function hrefWith(params: PropertyListParams, patch: Partial<Record<string, string>>): string {
  const q = new URLSearchParams()
  const filter = patch.filter ?? params.filter
  const sort = patch.sort ?? params.sort
  if (filter !== 'attention') q.set('filter', filter)
  if (sort !== 'severity') q.set('sort', sort)
  if (params.search) q.set('q', params.search)
  // Changing a filter or sort always returns to page 1 — staying on page 7
  // of a list that just became 2 pages long shows an empty pane.
  const s = q.toString()
  return s ? `/properties?${s}` : '/properties'
}

/** Same filter/sort, with the search term dropped — the escape hatch for a
 * zero-result search, since every chip and sort link otherwise carries the
 * search forward and stays empty too. */
function clearSearchHref(params: PropertyListParams): string {
  const q = new URLSearchParams()
  if (params.filter !== 'attention') q.set('filter', params.filter)
  if (params.sort !== 'severity') q.set('sort', params.sort)
  const s = q.toString()
  return s ? `/properties?${s}` : '/properties'
}

export function PropertyListFilters({
  params,
  counts,
}: {
  params: PropertyListParams
  /** Null when the counts could not be loaded — chips then show no number
   *  rather than a 0 that reads as "none". */
  counts: { attention: number; incomplete: number; all: number; waiting: number } | null
}) {
  return (
    <div className="space-y-3 border-b border-border p-3">
      <SearchForm
        action="/properties"
        label="Search properties"
        placeholder="Search address, unit, owner, email"
        defaultValue={params.search}
        keep={{
          filter: params.filter !== 'attention' ? params.filter : null,
          sort: params.sort !== 'severity' ? params.sort : null,
        }}
        clearHref={clearSearchHref(params)}
        linkAs={Link}
        className="sm:w-full"
      />

      <div className="flex flex-wrap gap-1" role="navigation" aria-label="Filter properties">
        {FILTERS.map((f) => {
          const active = params.filter === f.key
          const count = COUNTED.has(f.key) && counts ? counts[f.key as keyof typeof counts] ?? 0 : null
          return (
            <Link
              key={f.key}
              href={hrefWith(params, { filter: f.key })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium no-underline transition-colors duration-fast sm:h-7',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary/30 bg-primary-subtle text-primary'
                  : 'border-border bg-surface text-foreground-secondary hover:border-border-strong hover:text-foreground',
              )}
            >
              {f.label}
              {count !== null ? <span className={cn('num', active ? 'text-primary' : 'text-muted')}>{count}</span> : null}
            </Link>
          )
        })}
      </div>

      <div className="flex items-center gap-1 text-xs text-muted">
        <span className="mr-1 font-medium">Sort by</span>
        {SORTS.map((s) => {
          const active = params.sort === s.key
          return (
            <Link
              key={s.key}
              href={hrefWith(params, { sort: s.key })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-2 py-1 no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-subtle font-semibold text-foreground' : 'hover:bg-subtle hover:text-foreground',
              )}
            >
              {s.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
