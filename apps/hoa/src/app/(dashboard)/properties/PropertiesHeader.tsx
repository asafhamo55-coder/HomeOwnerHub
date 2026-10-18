import Link from 'next/link'
import { Download, MoreHorizontal, Plus, ScrollText, Upload } from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, PageHeader } from '@homeowner-portal/ui'
import { propertyExportHref, type PropertyFilter } from '@/lib/properties/list-params'
import { propertyCountLabel } from '@/lib/properties/count-label'

/**
 * The /properties page header. The count reads truthfully: the
 * "attention" filter is a subset, not the whole association, so it's
 * shown alongside the true home count rather than replacing it.
 */
export function PropertiesHeader({
  orgName,
  filter,
  total,
  allCount,
  search,
  searchMatches = null,
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
      <Button asChild variant="secondary">
        <Link href="/properties/import">
          <Upload aria-hidden />
          Import
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More property actions" icon={<MoreHorizontal aria-hidden />} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Statutory owner roster and voter list (Properties P5). */}
          <DropdownMenuItem asChild>
            <Link href="/properties/roster" className="no-underline">
              <ScrollText aria-hidden />
              <span className="flex-1">Owner roster & voter list</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button asChild>
        <Link href="/properties/new">
          <Plus aria-hidden />
          Add property
        </Link>
      </Button>
    </>
  )
  return <PageHeader title="Properties" description={description} actions={actions} />
}
