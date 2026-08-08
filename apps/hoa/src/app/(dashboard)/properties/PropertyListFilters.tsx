import Link from 'next/link'
import { Search } from 'lucide-react'
import { Input } from '@homeowner-portal/ui'
import type { PropertyListParams, PropertyFilter, PropertySort } from '@/lib/properties/list-params'

const FILTERS: Array<{ key: PropertyFilter; label: string }> = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'all', label: 'All' },
  { key: 'owner_occupied', label: 'Owner-occupied' },
  { key: 'leased', label: 'Leased' },
  { key: 'unknown', label: 'Unknown' },
]

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

export function PropertyListFilters({ params }: { params: PropertyListParams }) {
  return (
    <div className="space-y-2 border-b border-border p-2">
      <form action="/properties" method="get" className="flex items-center gap-2">
        {params.filter !== 'attention' ? (
          <input type="hidden" name="filter" value={params.filter} />
        ) : null}
        {params.sort !== 'severity' ? (
          <input type="hidden" name="sort" value={params.sort} />
        ) : null}
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            defaultValue={params.search}
            placeholder="Search address, unit, owner, email"
            aria-label="Search properties"
            className="pl-8 text-sm"
          />
        </div>
      </form>

      <nav aria-label="Filter properties" className="flex flex-wrap gap-1 text-xs">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={hrefWith(params, { filter: f.key })}
            aria-current={params.filter === f.key ? 'page' : undefined}
            className={`rounded-full px-2.5 py-1 ${
              params.filter === f.key
                ? 'bg-primary text-primary-fg'
                : 'text-muted hover:bg-muted/10'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-1 text-[11px] text-muted">
        <span className="uppercase tracking-wide">Sort</span>
        {SORTS.map((s) => (
          <Link
            key={s.key}
            href={hrefWith(params, { sort: s.key })}
            aria-current={params.sort === s.key ? 'page' : undefined}
            className={`rounded px-1.5 py-0.5 ${
              params.sort === s.key ? 'font-semibold text-foreground' : 'hover:text-foreground'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
