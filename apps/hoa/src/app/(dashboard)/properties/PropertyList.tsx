import Link from 'next/link'
import { Building2, Clock, Plus, Search } from 'lucide-react'
import { Badge, Button, DataTable, EmptyState, StatusBadge, cn, type DataTableColumn } from '@homeowner-portal/ui'
import { TENURE } from '@/lib/status/community'
import type { PropertyListRow } from '@/lib/properties/list'
import type { ActivityKind } from '@/lib/properties/list-signals'
import {
  DEFAULT_SORT_DIR,
  propertyListHref,
  propertyListQuery,
  type PropertyListParams,
  type PropertySort,
} from '@/lib/properties/list-params'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import {
  emptyListMessage,
  severityDotClass,
  severityLabel,
  severityTone,
  statusLine,
  streetOf,
} from '@/lib/properties/severity'
import { formatShortDate } from '@/lib/format-datetime'
import { ContactIcons } from '@/components/contact/ContactIcons'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'
import { RowKeyNav } from './RowKeyNav'

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  history: 'Record change',
  violation: 'Violation',
  arc: 'ARC',
  mail: 'Email',
  payment: 'Payment',
}

/**
 * The properties list: a dense, sortable table from `md` up (every
 * header sorts — the sort is a URL, list-params.ts), and cards on phones
 * (street, owner, balance, one status line, tap-to-call). The whole row
 * opens the home: the address link is stretched over its row, with the
 * contact icons raised above it. ↑/↓ (or j/k) move between rows.
 */
export function PropertyList({
  rows,
  params,
  noPropertiesYet = false,
  allMatches = null,
  signalsOk = true,
  footer,
}: {
  rows: PropertyListRow[]
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
  /** False when open ARC / last activity couldn't be read. */
  signalsOk?: boolean
  /** The Pager, inside the frame. */
  footer?: React.ReactNode
}) {
  if (rows.length === 0 && noPropertiesYet && !params.search) {
    return (
      <EmptyState
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
        icon={<Search aria-hidden />}
        title={`No ${params.filter === 'attention' ? 'homes needing attention' : 'homes'}${
          params.filter !== 'all' && params.filter !== 'attention' ? ' in this view' : ''
        } match “${params.search}”`}
        description={
          elsewhere
            ? `${allMatches} ${allMatches === 1 ? 'home matches' : 'homes match'} in All.`
            : 'Search looks at the address, unit, owner name, email and phone, and at everyone living there. Try part of the street name or the house number.'
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

  // The list state rides along to the property page, so its back link
  // returns to this exact view.
  const query = propertyListQuery(params)
  const open = (row: PropertyListRow) => propertyHref(asPropertyId(row.id), { query })

  // An inactive column's header starts in that column's natural direction
  // (balance biggest first); the active one toggles.
  const sortHref = (key: string, direction: 'asc' | 'desc') => {
    const sort = key as PropertySort
    const dir = sort === params.sort ? direction : DEFAULT_SORT_DIR[sort]
    return propertyListHref(params, { sort, dir, page: 1 })
  }

  const unknown = (
    <span className="text-muted" title="Couldn’t load">
      —<span className="sr-only"> (couldn’t load)</span>
    </span>
  )

  const columns: DataTableColumn<PropertyListRow>[] = [
    {
      key: 'address',
      header: 'Address · Unit',
      sortable: true,
      className: 'w-[26%] min-w-[13rem]',
      cell: (row) => {
        const tone = severityTone(row.severityRank)
        return (
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn('size-2 shrink-0 rounded-full', severityDotClass(tone))} title={severityLabel(row.severityRank)} aria-hidden />
            <Link
              href={open(row)}
              data-row-link
              title={row.address}
              className="min-w-0 truncate font-medium text-foreground no-underline after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
            >
              {streetOf(row.address)}
              {row.unitNumber ? <span className="font-normal text-muted"> · {row.unitNumber}</span> : null}
              <span className="sr-only">, {severityLabel(row.severityRank)}</span>
            </Link>
          </span>
        )
      },
    },
    {
      key: 'owner',
      header: 'Owner',
      sortable: true,
      className: 'max-w-[14rem]',
      cell: (row) =>
        row.ownerName ? (
          <span className="block truncate" title={row.ownerName}>
            {row.ownerName}
          </span>
        ) : (
          <span className="text-muted">No owner on file</span>
        ),
    },
    {
      key: 'contact',
      header: 'Contact',
      sortable: true,
      className: 'py-0',
      cell: (row) =>
        row.ownerPhone || row.ownerEmail ? (
          <ContactIcons name={row.ownerName} phone={row.ownerPhone} email={row.ownerEmail} raised className="-my-1" />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'tenure',
      header: 'Tenure',
      sortable: true,
      hideBelowLg: true,
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          {row.tenure && row.tenure !== 'unknown' ? (
            <StatusBadge status={row.tenure} tones={TENURE.tones} labels={TENURE.labels} size="sm" />
          ) : (
            <span className="text-muted">Not recorded</span>
          )}
          {row.onWaitingList ? (
            <Badge variant="default" size="sm">
              Waiting list
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      sortable: true,
      numeric: true,
      cell: (row) =>
        row.balance > 0 ? (
          <span className="inline-flex items-baseline justify-end gap-1.5 whitespace-nowrap">
            <span className={cn('font-medium', row.daysOverdue > 0 && 'text-danger')}>{money(row.balance)}</span>
            <span className={cn('text-xs', row.daysOverdue > 0 ? 'text-danger' : 'text-muted')}>
              {row.daysOverdue > 0 ? `${row.daysOverdue}d overdue` : 'not due'}
            </span>
          </span>
        ) : (
          <span className="text-muted">$0</span>
        ),
    },
    {
      key: 'violations',
      header: 'Violations',
      sortable: true,
      numeric: true,
      cell: (row) =>
        row.openViolations > 0 ? (
          <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
            {row.violationsPastCure > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-danger">
                <Clock className="size-3.5" aria-hidden />
                {row.violationsPastCure} past cure
              </span>
            ) : null}
            <span className={cn('font-medium', row.violationsPastCure > 0 ? 'text-danger' : 'text-foreground')}>
              {row.openViolations}
              <span className="sr-only"> open</span>
            </span>
          </span>
        ) : (
          <span className="text-muted">0</span>
        ),
    },
    {
      key: 'arc',
      header: 'Open ARC',
      sortable: true,
      numeric: true,
      hideBelowLg: true,
      cell: (row) =>
        row.openArc === null ? (
          unknown
        ) : row.openArc > 0 ? (
          <span className="font-medium text-warning">{row.openArc}</span>
        ) : (
          <span className="text-muted">0</span>
        ),
    },
    {
      key: 'activity',
      header: 'Last activity',
      sortable: true,
      hideBelowLg: true,
      cell: (row) =>
        !signalsOk ? (
          unknown
        ) : row.lastActivityAt ? (
          <span className="whitespace-nowrap">
            <time dateTime={row.lastActivityAt} className="num text-foreground-secondary">
              {formatShortDate(row.lastActivityAt)}
            </time>
            {row.lastActivityKind ? <span className="ml-1.5 text-xs text-muted">{ACTIVITY_LABEL[row.lastActivityKind]}</span> : null}
          </span>
        ) : (
          <span className="text-muted" title="Nothing recorded in the last 12 months">
            None this year
          </span>
        ),
    },
  ]

  // Each <td> is the positioning box for the row's links, never the <tr>:
  // Safari does not treat position:relative on a table row as a containing
  // block, so a stretched link anchored to the row covered the whole table
  // and every click opened the last property (bug 2026-10-26). The address
  // cell keeps the real, focusable link; every other cell gets a hidden
  // overlay link to the same home, so a click anywhere on the row still works.
  const cellLinkedColumns: DataTableColumn<PropertyListRow>[] = columns.map((col) => ({
    ...col,
    className: cn(col.className, 'relative'),
    cell:
      col.key === 'address'
        ? col.cell
        : (row: PropertyListRow) => (
            <>
              {col.cell(row)}
              <Link href={open(row)} tabIndex={-1} aria-hidden className="absolute inset-0" />
            </>
          ),
  }))

  return (
    <RowKeyNav className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="hidden md:block">
        <DataTable
          caption="Properties"
          framed={false}
          density="compact"
          columns={cellLinkedColumns}
          rows={rows}
          rowKey={(r) => r.id}
          sort={params.sort === 'severity' ? undefined : { key: params.sort, direction: params.dir }}
          sortHref={sortHref}
          linkAs={Link}
        />
      </div>

      <ul className="divide-y divide-border md:hidden" aria-label="Properties">
        {rows.map((row) => {
          const status = statusLine(row)
          return (
            <li key={row.id} data-row className="relative flex items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={open(row)}
                    data-row-link
                    title={row.address}
                    className="min-w-0 truncate text-sm font-semibold text-foreground no-underline after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                  >
                    {streetOf(row.address)}
                    {row.unitNumber ? <span className="font-normal text-muted"> · {row.unitNumber}</span> : null}
                  </Link>
                  {row.balance > 0 ? (
                    <span className={cn('num shrink-0 text-sm font-semibold', row.daysOverdue > 0 ? 'text-danger' : 'text-foreground')}>
                      {money(row.balance)}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted">{row.ownerName ?? 'No owner on file'}</p>
                <p
                  className={cn(
                    'mt-0.5 truncate text-xs font-medium',
                    status.tone === 'danger' ? 'text-danger' : status.tone === 'warning' ? 'text-warning' : 'text-muted',
                  )}
                >
                  {status.text}
                </p>
              </div>
              {/* Tap-to-call is the phone card's one action; email stays on the property page. */}
              <ContactIcons name={row.ownerName} phone={row.ownerPhone} email={null} raised />
            </li>
          )
        })}
      </ul>

      {footer ? <div className="border-t border-border">{footer}</div> : null}
    </RowKeyNav>
  )
}
