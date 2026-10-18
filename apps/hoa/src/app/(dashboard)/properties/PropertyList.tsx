import Link from 'next/link'
import { Building2, Plus, Search } from 'lucide-react'
import { Badge, Button, EmptyState, cn } from '@homeowner-portal/ui'
import { TENURE } from '@/lib/status/community'
import type { PropertyListRow } from '@/lib/properties/list'
import { propertyListHref, propertyListQuery, type PropertyListParams } from '@/lib/properties/list-params'
import {
  emptyListMessage,
  reasonPills,
  severityDotClass,
  severityLabel,
  severityTone,
  streetOf,
} from '@/lib/properties/severity'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function PropertyList({
  rows,
  selectedId,
  params,
  noPropertiesYet = false,
  allMatches = null,
}: {
  rows: PropertyListRow[]
  selectedId?: string
  params: PropertyListParams
  /**
   * True only when the org-wide count loaded AND is zero. Then every
   * filter is empty for the same reason, and the next step is adding the
   * first home, not "Show all properties" (which would be empty too).
   * Unknown (count failed) stays false and falls back to the filter copy.
   */
  noPropertiesYet?: boolean
  /** How many homes the search matches across ALL filters (null = unknown).
   *  Lets an empty filtered search point at matches the filter hid. */
  allMatches?: number | null
}) {
  if (rows.length === 0 && noPropertiesYet && !params.search) {
    return (
      <EmptyState
        variant="compact"
        icon={<Building2 aria-hidden />}
        title="No properties yet"
        secondaryAction={
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href="/properties/import">Import a spreadsheet</Link>
            </Button>
            <HowThisWorks href={guideHref('setup-properties-residents')} />
          </>
        }
        description="Add each home in the association, or import them all from a spreadsheet. Owners, residents, dues and violations all hang off a property."
        action={
          <Button asChild size="sm">
            <Link href="/properties/new">
              <Plus aria-hidden />
              Add a property
            </Link>
          </Button>
        }
      />
    )
  }

  if (rows.length === 0 && params.search) {
    const elsewhere = params.filter !== 'all' && allMatches !== null && allMatches > 0
    return (
      <EmptyState
        variant="compact"
        icon={<Search aria-hidden />}
        title={`No ${params.filter === 'attention' ? 'homes needing attention' : 'homes'}${
          params.filter !== 'all' && params.filter !== 'attention' ? ' in this view' : ''
        } match “${params.search}”`}
        description={
          elsewhere
            ? `${allMatches} ${allMatches === 1 ? 'home matches' : 'homes match'} in All.`
            : 'Search looks at the address, unit, owner name and email. Try part of the street name or the house number.'
        }
        action={
          elsewhere ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={propertyListHref(params, { filter: 'all', page: 1 })}>Search all homes</Link>
            </Button>
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link href={propertyListHref(params, { search: '', page: 1 })}>Clear search</Link>
            </Button>
          )
        }
      />
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={<Building2 aria-hidden />}
        title="Nothing in this view"
        description={emptyListMessage(params.filter)}
        action={
          params.filter !== 'all' ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/properties">Show all homes</Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/properties/new">Add a property</Link>
            </Button>
          )
        }
      />
    )
  }

  const query = propertyListQuery(params)
  const qs = query ? `?${query}` : ''

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const tone = severityTone(row.severityRank)
        const pills = reasonPills(row)
        const selected = row.id === selectedId
        // Straight off the view (0051) rather than a side lookup, so the
        // pill and the "Waiting list" filter chip can never disagree about
        // which rows are queued.
        const onWaitingList = row.onWaitingList
        return (
          <li key={row.id}>
            <Link
              href={`/properties/${row.id}${qs}`}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'relative block px-4 py-3 no-underline transition-colors duration-fast hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                selected && 'bg-primary-subtle/60 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary hover:bg-primary-subtle/80',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${severityDotClass(tone)}`}
                    title={severityLabel(row.severityRank)}
                    aria-hidden
                  />
                  <span className="sr-only">{severityLabel(row.severityRank)}</span>
                  <span
                    className="truncate text-sm font-semibold text-foreground"
                    title={row.address}
                  >
                    {streetOf(row.address)}
                    {row.unitNumber ? (
                      <span className="font-normal text-muted"> · {row.unitNumber}</span>
                    ) : null}
                  </span>
                </span>
                {row.balance > 0 ? (
                  <span className="num shrink-0 text-xs font-semibold text-danger">
                    {money(row.balance)}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate pl-4 text-xs text-muted">
                {/* `tenure` is an enum whose values include the literal
                    'unknown'. Rendering it printed the word "unknown"
                    beside every owner name on every row, which reads as
                    broken software rather than as absent data. An unknown
                    tenure now simply shows nothing. */}
                {[
                  row.ownerName ?? 'No owner on file',
                  row.tenure && row.tenure !== 'unknown'
                    ? (TENURE.labels[row.tenure] ?? row.tenure)
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {pills.length > 0 || onWaitingList ? (
                <div className="flex flex-wrap gap-1 pl-4 pt-1.5">
                  {pills.map((p) => (
                    <Badge
                      key={p.text}
                      variant={p.tone === 'red' ? 'danger' : p.tone === 'amber' ? 'warning' : 'neutral'}
                    >
                      {p.text}
                    </Badge>
                  ))}
                  {/* Deliberately not a reasonPill: the severity pills all
                      mean "someone must act on this property", and sitting
                      in a queue is a state, not a problem. Primary tint
                      keeps it visually separate from red/amber work. */}
                  {onWaitingList ? (
                    <Badge variant="default">Waiting list</Badge>
                  ) : null}
                </div>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
