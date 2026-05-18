import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState } from '@homeowner-portal/ui'
import { listTenants } from '@/lib/platform-admin'

export const metadata = { title: 'Tenants' }

export default async function TenantsListPage() {
  const tenants = await listTenants()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-sm text-muted">
            {tenants.length} total · {tenants.filter((t) => !t.suspended_at).length} active
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/tenants/new">
            <Plus className="h-4 w-4" />
            Create tenant
          </Link>
        </Button>
      </header>

      {tenants.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10" aria-hidden />}
          title="No tenants yet"
          description="Create your first tenant to onboard an HOA onto the platform."
          action={
            <Button asChild>
              <Link href="/admin/tenants/new">
                <Plus className="h-4 w-4" />
                Create first tenant
              </Link>
            </Button>
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
              {tenants.map((t) => (
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
                    {t.suspended_at ? (
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
