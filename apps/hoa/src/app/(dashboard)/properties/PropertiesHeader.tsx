import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { Button, PageHeader } from '@homeowner-portal/ui'
import { propertyExportHref, type PropertyFilter } from '@/lib/properties/list-params'
import { propertyCountLabel } from '@/lib/properties/count-label'

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
  searchMatches = null,
  onDetailRoute = false,
}: {
  orgName: string
  filter: PropertyFilter
  /** Row count for the current filter (and search). */
  total: number | null
  /** Homes in the whole org, unfiltered and unsearched. Null when it could
   *  not be loaded — shown as unavailable, never as "0 homes". */
  allCount: number | null
  search: string
  /** Homes the search matched across every filter (null = no search or unknown). */
  searchMatches?: number | null
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
  // Export sees exactly what the list pane shows: every filter and the
  // search are forwarded (it used to forward only the three tenures).
  const exportHref = propertyExportHref({ filter, search })

  const description = `${propertyCountLabel({ filter, total, allCount, search, searchMatches })} in ${orgName}`

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
