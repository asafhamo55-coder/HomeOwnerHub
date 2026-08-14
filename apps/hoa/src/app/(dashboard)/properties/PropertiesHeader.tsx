import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import type { PropertyFilter } from '@/lib/properties/list-params'

/**
 * Shared chrome for /properties and /properties/[id] so opening a property
 * doesn't hide Export/Add property (they used to vanish on the detail
 * route), and so the two routes read the count the same truthful way: the
 * "attention" filter is a subset, not the whole association, so it's shown
 * alongside the true home count rather than replacing it.
 */
export function PropertiesHeader({
  orgName,
  filter,
  total,
  allCount,
  search,
  onDetailRoute = false,
}: {
  orgName: string
  filter: PropertyFilter
  /** Row count for the *current* filter — only meaningful to show for 'attention'. */
  total: number
  /** Row count across the whole org, unfiltered. */
  allCount: number
  search: string
  /**
   * True on /properties/[id]. There, the open property's address is the
   * page's subject and owns the `h1` (PropertyPanel), so this title steps
   * down to a link back to the unfiltered list — which also gives desktop
   * users a way out that previously only existed below `lg` via BackLink.
   * Two `h1`s on one route is valid HTML but breaks heading navigation for
   * screen-reader users, who get a generic "Properties" competing with the
   * actual subject.
   */
  onDetailRoute?: boolean
}) {
  // Export must see exactly what the list pane is showing: forward the
  // search term, and forward tenure only for the three filters the export
  // route actually understands ('attention' and 'all' have no tenure
  // equivalent there, so they forward nothing).
  const exportParams = new URLSearchParams()
  if (search) exportParams.set('q', search)
  if (filter === 'owner_occupied' || filter === 'leased' || filter === 'unknown') {
    exportParams.set('tenure', filter)
  }
  const exportQuery = exportParams.toString()
  const exportHref = exportQuery ? `/properties/export?${exportQuery}` : '/properties/export'

  const homesLabel = `${allCount} ${allCount === 1 ? 'home' : 'homes'}`
  // Both subset filters name what they selected, so the number is never
  // mistaken for the association's size. 'incomplete' says "record" rather
  // than "needing attention": an unfilled tenure field is data-entry
  // backlog, not something the board owes anyone work on.
  const countLabel =
    filter === 'attention'
      ? `${total} needing attention · ${homesLabel}`
      : filter === 'incomplete'
        ? `${total} incomplete ${total === 1 ? 'record' : 'records'} · ${homesLabel}`
        : homesLabel

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div>
        {onDetailRoute ? (
          <Link
            href="/properties"
            className="text-lg font-semibold text-foreground hover:text-primary"
          >
            Properties
          </Link>
        ) : (
          <h1 className="text-lg font-semibold text-foreground">Properties</h1>
        )}
        <p className="text-xs text-muted">
          {countLabel} in {orgName}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          {/* Plain anchor — Link would prefetch the CSV. */}
          <a href={exportHref}>
            <Download className="h-4 w-4" />
            Export
          </a>
        </Button>
        <Button asChild size="sm">
          <Link href="/properties/new">
            <Plus className="h-4 w-4" />
            Add property
          </Link>
        </Button>
      </div>
    </header>
  )
}
