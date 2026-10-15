import Link from 'next/link'
import { format } from 'date-fns'
import { Building2, Plus } from 'lucide-react'
import { Button, DataTable, EmptyState, Page, Tabs, type SortDirection } from '@homeowner-portal/ui'
import { listTenants, type TenantRow } from '@/lib/platform-admin'
import { TenantStatusPill, planLabel, tenantStatus } from '../_components/tenant-status'

export const metadata = { title: 'Tenants' }

type Filter = 'active' | 'suspended' | 'archived'
type SortKey = 'name' | 'members' | 'associations' | 'units' | 'created'

const SORT_KEYS: SortKey[] = ['name', 'members', 'associations', 'units', 'created']

function sortValue(t: TenantRow, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return t.name.toLowerCase()
    case 'members':
      return t.member_count
    case 'associations':
      return t.association_count
    case 'units':
      return t.units_count
    case 'created':
      return t.created_at ?? ''
  }
}

export default async function TenantsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string; dir?: string }>
}) {
  const sp = await searchParams
  const allTenants = await listTenants()

  const filter: Filter = sp.filter === 'archived' ? 'archived' : sp.filter === 'suspended' ? 'suspended' : 'active'
  const sortKey: SortKey = SORT_KEYS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : 'created'
  const dir: SortDirection = sp.dir === 'asc' ? 'asc' : sp.dir === 'desc' ? 'desc' : sortKey === 'name' ? 'asc' : 'desc'

  const counts = { active: 0, suspended: 0, archived: 0 }
  for (const t of allTenants) counts[tenantStatus(t)]++

  const rows = allTenants
    .filter((t) => tenantStatus(t) === filter)
    .sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return dir === 'asc' ? cmp : -cmp
    })

  const href = (params: { filter?: Filter; sort?: SortKey; dir?: SortDirection }) => {
    const q = new URLSearchParams()
    const f = params.filter ?? filter
    if (f !== 'active') q.set('filter', f)
    if (params.sort) {
      q.set('sort', params.sort)
      if (params.dir) q.set('dir', params.dir)
    }
    const s = q.toString()
    return `/admin/tenants${s ? `?${s}` : ''}`
  }

  const emptyCopy: Record<Filter, { title: string; description: string }> = {
    active: { title: 'No active tenants', description: 'Create a tenant to onboard an HOA onto the platform.' },
    suspended: { title: 'No suspended tenants', description: 'Suspend a tenant from its detail page; it will be listed here.' },
    archived: { title: 'No archived tenants', description: 'Archived tenants are kept here and can be restored.' },
  }

  return (
    <Page
      width="wide"
      title="Tenants"
      description={`${allTenants.length.toLocaleString()} total · ${counts.active} active${counts.suspended ? ` · ${counts.suspended} suspended` : ''}${counts.archived ? ` · ${counts.archived} archived` : ''}`}
      actions={
        <Button asChild>
          <Link href="/admin/tenants/new" className="no-underline">
            <Plus aria-hidden />
            Create tenant
          </Link>
        </Button>
      }
      tabs={
        <Tabs
          linkAs={Link}
          currentPath={href({})}
          items={[
            { label: 'Active', href: href({ filter: 'active' }), badge: counts.active, active: filter === 'active' },
            { label: 'Suspended', href: href({ filter: 'suspended' }), badge: counts.suspended || null, active: filter === 'suspended' },
            { label: 'Archived', href: href({ filter: 'archived' }), badge: counts.archived || null, active: filter === 'archived' },
          ]}
        />
      }
    >
      <DataTable
        caption={`${filter[0].toUpperCase()}${filter.slice(1)} tenants`}
        mobile="cards"
        rows={rows}
        rowKey={(t) => t.id}
        sort={{ key: sortKey, direction: dir }}
        sortHref={(key, direction) => href({ sort: key as SortKey, dir: direction })}
        linkAs={Link}
        empty={
          <EmptyState
            variant="compact"
            icon={<Building2 aria-hidden />}
            title={emptyCopy[filter].title}
            description={emptyCopy[filter].description}
          />
        }
        columns={[
          {
            key: 'name',
            header: 'Tenant',
            sortable: true,
            mobilePrimary: true,
            cell: (t) => (
              <div className="min-w-0">
                <Link href={`/admin/tenants/${t.id}`} className="font-medium text-foreground no-underline hover:text-primary">
                  {t.name}
                </Link>
                <p className="font-mono text-xs text-muted">{t.id.slice(0, 8)}</p>
              </div>
            ),
          },
          { key: 'plan', header: 'Plan', cell: (t) => planLabel(t.plan) },
          { key: 'members', header: 'Members', numeric: true, sortable: true, cell: (t) => t.member_count.toLocaleString() },
          {
            key: 'associations',
            header: 'Associations',
            numeric: true,
            sortable: true,
            hideBelowLg: true,
            hideOnMobile: true,
            cell: (t) => t.association_count.toLocaleString(),
          },
          { key: 'units', header: 'Units', numeric: true, sortable: true, cell: (t) => t.units_count.toLocaleString() },
          {
            key: 'created',
            header: 'Created',
            sortable: true,
            hideBelowLg: true,
            cell: (t) => <span className="text-foreground-secondary">{t.created_at ? format(new Date(t.created_at), 'PP') : '—'}</span>,
          },
          { key: 'status', header: 'Status', cell: (t) => <TenantStatusPill tenant={t} /> },
        ]}
      />
    </Page>
  )
}
