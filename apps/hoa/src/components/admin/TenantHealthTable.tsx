import Link from 'next/link'
import { DataTable, EmptyState, StatusPill, cn, type SortDirection } from '@homeowner-portal/ui'
import type { TenantHealthRow } from '@/lib/platform-admin'

// Tenant health scoreboard (platform analytics). Server-rendered; sorting
// is a URL concern (?sort=&dir=) like every other DataTable.

export const HEALTH_SORT_KEYS = [
  'name',
  'members',
  'units',
  'vendors_at_risk',
  'open_violations',
  'ai_runs_30d',
  'outstanding_dues_usd',
] as const
export type HealthSortKey = (typeof HEALTH_SORT_KEYS)[number]

export function TenantHealthTable({
  rows,
  sort,
  sortHref,
}: {
  rows: TenantHealthRow[]
  sort: { key: HealthSortKey; direction: SortDirection }
  sortHref: (key: string, direction: SortDirection) => string
}) {
  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key]
    const bv = b[sort.key]
    const cmp =
      typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : (av as number) - (bv as number)
    return sort.direction === 'asc' ? cmp : -cmp
  })

  return (
    <DataTable
      caption="Tenant health scoreboard"
      mobile="cards"
      rows={sorted}
      rowKey={(t) => t.id}
      sort={sort}
      sortHref={sortHref}
      linkAs={Link}
      empty={<EmptyState variant="compact" title="No tenants yet" />}
      columns={[
        {
          key: 'name',
          header: 'Tenant',
          sortable: true,
          mobilePrimary: true,
          cell: (t) => (
            <Link href={`/admin/tenants/${t.id}`} className="font-medium text-foreground no-underline hover:text-primary">
              {t.name}
            </Link>
          ),
        },
        { key: 'members', header: 'Members', numeric: true, sortable: true, cell: (t) => t.members.toLocaleString() },
        { key: 'units', header: 'Units', numeric: true, sortable: true, cell: (t) => t.units.toLocaleString() },
        {
          key: 'vendors_at_risk',
          header: 'Vendors at risk',
          numeric: true,
          sortable: true,
          hideBelowLg: true,
          cell: (t) => <span className={cn(t.vendors_at_risk > 0 && 'font-medium text-danger')}>{t.vendors_at_risk}</span>,
        },
        {
          key: 'open_violations',
          header: 'Open violations',
          numeric: true,
          sortable: true,
          cell: (t) => <span className={cn(t.open_violations > 0 && 'font-medium text-warning')}>{t.open_violations}</span>,
        },
        {
          key: 'ai_runs_30d',
          header: 'AI runs (30d)',
          numeric: true,
          sortable: true,
          hideBelowLg: true,
          cell: (t) => t.ai_runs_30d.toLocaleString(),
        },
        {
          key: 'outstanding_dues_usd',
          header: 'Dues outstanding',
          numeric: true,
          sortable: true,
          cell: (t) => (
            <span className={cn(t.outstanding_dues_usd > 0 ? 'font-medium text-foreground' : 'text-muted')}>
              ${Math.round(t.outstanding_dues_usd).toLocaleString()}
            </span>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          cell: (t) => (t.suspended_at ? <StatusPill tone="danger" label="Suspended" /> : <StatusPill tone="success" label="Active" />),
        },
      ]}
    />
  )
}
