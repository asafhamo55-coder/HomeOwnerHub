import Link from 'next/link'
import { X } from 'lucide-react'
import { FilterChips, SearchForm, cn } from '@homeowner-portal/ui'
import {
  DEFAULT_SORT_DIR,
  MENU_FILTER_LABELS,
  isMenuFilter,
  propertyListHref,
  type MenuFilter,
  type PropertyFilter,
  type PropertyListParams,
  type PropertySort,
} from '@/lib/properties/list-params'
import type { PropertyFilterCounts } from '@/lib/properties/list-view'
import { PropertyFilterMenu } from './PropertyFilterMenu'

// Phones only: from `md` the table's column headers are the sort.
const SORTS: Array<{ key: PropertySort; label: string }> = [
  { key: 'severity', label: 'Severity' },
  { key: 'address', label: 'Address' },
  { key: 'balance', label: 'Balance' },
  { key: 'activity', label: 'Recent' },
]

/**
 * Search, the two views boards actually switch between ("All" and "Needs
 * attention"), and everything else behind one "Filters" menu, on one
 * toolbar row above the full-width table (it wraps on phones).
 *
 * Every count comes from the same read as the list, so with a search
 * active they count the homes that search found — "Needs attention 1" means
 * one of the matches needs attention, not one in the association.
 */
export function PropertyListFilters({
  params,
  counts,
}: {
  params: PropertyListParams
  /** Null when the counts could not be loaded — chips then show no number
   *  rather than a 0 that reads as "none". */
  counts: PropertyFilterCounts | null
}) {
  const href = (filter: PropertyFilter) => propertyListHref(params, { filter, page: 1 })
  const menuFilter = isMenuFilter(params.filter) ? params.filter : null

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <SearchForm
        action="/properties"
        label="Search properties"
        placeholder="Search address, name, email or phone"
        defaultValue={params.search}
        // A new search covers every home: the filter is deliberately NOT
        // kept. Searching inside "Needs attention" is how a board member
        // typed a real address and was told no such home exists.
        keep={{
          sort: params.sort !== 'severity' ? params.sort : null,
          dir: params.dir !== DEFAULT_SORT_DIR[params.sort] ? params.dir : null,
        }}
        clearHref={propertyListHref(params, { search: '', page: 1 })}
        linkAs={Link}
        className="md:w-80"
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterChips
          label="Show"
          linkAs={Link}
          items={[
            { label: 'All', href: href('all'), active: params.filter === 'all', count: counts?.all ?? null },
            {
              label: 'Needs attention',
              href: href('attention'),
              active: params.filter === 'attention',
              count: counts?.attention ?? null,
            },
          ]}
        />
        <PropertyFilterMenu
          active={menuFilter}
          counts={counts}
          hrefs={Object.fromEntries((Object.keys(MENU_FILTER_LABELS) as MenuFilter[]).map((k) => [k, href(k)])) as Record<MenuFilter, string>}
        />
        {menuFilter ? (
          <Link
            href={href('all')}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-primary/30 bg-primary-subtle px-2.5 text-xs font-medium text-primary no-underline hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-7 coarse:min-h-11"
          >
            {MENU_FILTER_LABELS[menuFilter]}
            <X className="size-3.5" aria-hidden />
            <span className="sr-only">— remove filter</span>
          </Link>
        ) : null}
      </div>
      </div>

      <div className="flex items-center gap-1 text-xs text-muted md:hidden">
        <span className="mr-1 font-medium">Sort by</span>
        {SORTS.map((s) => {
          const active = params.sort === s.key
          return (
            <Link
              key={s.key}
              href={propertyListHref(params, { sort: s.key, page: 1 })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 items-center rounded-md px-2.5 coarse:min-h-11 no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-subtle font-semibold text-foreground' : 'hover:bg-subtle hover:text-foreground',
              )}
            >
              {s.label}
            </Link>
          )
        })}
      </div>
      {params.sort === 'severity' ? (
        <p className="hidden text-xs text-muted md:block">
          What needs action comes first. Select a column heading to sort by it; ↑ and ↓ move between homes.
        </p>
      ) : (
        <p className="hidden text-xs text-muted md:block">
          <Link href={propertyListHref(params, { sort: 'severity', page: 1 })} className="text-primary">
            Sort by what needs action
          </Link>
        </p>
      )}
    </div>
  )
}
