import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState, Tabs } from '@homeowner-portal/ui'
import { listTenants } from '@/lib/platform-admin'

export const metadata = { title: 'Tenants' }

export default async function TenantsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const allTenants = await listTenants()

  const activeFilter = filter === 'archived' ? 'archived' : filter === 'suspended' ? 'suspended' : 'active'

  const filtered = allTenants.filter((t) => {
    if (activeFilter === 'archived') return !!t.archived_at
    if (activeFilter === 'suspended') return !!t.suspended_at && !t.archived_at
    return !t.archived_at && !t.suspended_at
  })

  const activeTenants = allTenants.filter((t) => !t.archived_at && !t.suspended_at)
  const archivedTenants = allTenants.filter((t) => !!t.archived_at)
  const suspendedTenants = allTenants.filter((t) => !!t.suspended_at && !t.archived_at)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-sm text-muted">
            {allTenants.length} total · {activeTenants.filter((t) => !t.suspended_at).length} active
            {archivedTenants.length > 0 ? ` · ${archivedTenants.length} archived` : ''}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/tenants/new">
            <Plus className="h-4 w-4" />
            Create tenant
          </Link>
        </Button>
      </header>

      <Tabs
        currentPath={`/admin/tenants${activeFilter !== 'active' ? `?filter=${activeFilter}` : ''}`}
        items={[
          { label: 'Active', href: '/admin/tenants', badge: activeTenants.length, active: activeFilter === 'active' },
          { label: 'Suspended', href: '/admin/tenants?filter=suspended', badge: suspendedTenants.length || null, active: activeFilter === 'suspended' },
          { label: 'Archived', href: '/admin/tenants?filter=archived', badge: archivedTenants.length || null, active: activeFilter === 'archived' },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10" aria-hidden />}
          title={activeFilter === 'archived' ? 'No archived tenants' : activeFilter === 'suspended' ? 'No suspended tenants' : 'No tenants yet'}
          description={
            activeFilter === 'archived'
              ? 'Archived tenants will appear here. You can archive a tenant from their detail page.'
              : activeFilter === 'suspended'
                ? 'No tenants are currently suspended.'
                : 'Create your first tenant to onboard an HOA onto the platform.'
          }
          action={
            activeFilter === 'active' ? (
              <Button asChild>
                <Link href="/admin/tenants/new">
                  <Plus className="h-4 w-4" />
                  Create first tenant
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2">Tenant</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2 text-right">Members</th>
                <th className="px-4 py-2 text-right">Associations</th>
                <th className="px-4 py-2 text-right">Units</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-border last:border-0 hover:bg-foreground/5"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {t.name}
                    </Link>
                    <p className="text-[10px] font-mono text-muted">{t.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" size="sm" className="capitalize">
                      {t.plan}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.member_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.association_count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.units_count}</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {t.created_at ? format(new Date(t.created_at), 'PP') : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {t.archived_at ? (
                      <Badge variant="destructive" size="sm">
                        Archived
                      </Badge>
                    ) : t.suspended_at ? (
                      <Badge variant="destructive" size="sm">
                        Suspended
                      </Badge>
                    ) : (
                      <Badge variant="success" size="sm">
                        Active
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
