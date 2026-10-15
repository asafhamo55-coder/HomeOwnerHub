import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { Button, PageHeader } from '@homeowner-portal/ui'
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
  total: number | null
  /** Row count across the whole org, unfiltered. Null when it could not be
   *  loaded — shown as unavailable, never as "0 homes". */
  allCount: number | null
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

  const homesLabel =
    allCount === null
      ? 'home count unavailable'
      : `${allCount} ${allCount === 1 ? 'home' : 'homes'}`
  // Both subset filters name what they selected, so the number is never
  // mistaken for the association's size. 'incomplete' says "record" rather
  // than "needing attention": an unfilled tenure field is data-entry
  // backlog, not something the board owes anyone work on.
  const countLabel =
    total === null
      ? homesLabel
      : filter === 'attention'
      ? `${total} needing attention · ${homesLabel}`
      : filter === 'incomplete'
        ? `${total} incomplete ${total === 1 ? 'record' : 'records'} · ${homesLabel}`
        : homesLabel

  const actions = (
    <>
      <Button asChild variant="secondary">
        {/* Plain anchor — Link would prefetch the CSV. */}
        <a href={exportHref}>
          <Download aria-hidden />
          Export
        </a>
      </Button>
      <Button asChild>
        <Link href="/properties/new">
          <Plus aria-hidden />
          Add property
        </Link>
      </Button>
    </>
  )
  const description = `${countLabel} in ${orgName}`

  if (!onDetailRoute) {
    return <PageHeader title="Properties" description={description} actions={actions} />
  }
  // Detail route: the open property owns the h1 (PropertyPanel). This strip
  // keeps the same shape and actions, with the title as a way back to the
  // unfiltered list. Hidden below lg, where the panel is the whole page and
  // carries its own breadcrumb.
  return (
    <div className="hidden flex-wrap items-start justify-between gap-3 lg:flex">
      <div className="min-w-0 space-y-1">
        <Link
          href="/properties"
          className="text-2xl font-semibold tracking-[-0.015em] text-foreground no-underline transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Properties
        </Link>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}
