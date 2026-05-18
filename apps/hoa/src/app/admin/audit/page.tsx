import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import { listPlatformAuditLog } from '@/lib/platform-admin'

export const metadata = { title: 'Audit log' }

const ACTION_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  'tenant.create': 'success',
  'tenant.update': 'default',
  'tenant.suspend': 'destructive',
  'tenant.resume': 'success',
  'platform_admin.grant': 'warning',
  'platform_admin.revoke': 'destructive',
}

export default async function AuditLogPage() {
  const rows = await listPlatformAuditLog(200)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          <h1 className="text-2xl font-bold">Audit log</h1>
        </div>
        <p className="text-sm text-muted">
          Every action a platform admin takes. Append-only at the database level —
          UPDATE / DELETE on this table are revoked from the authenticated role.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" aria-hidden />}
          title="No platform-admin activity yet"
          description="Actions taken from the /admin tree (create tenant, suspend, change plan, grant another platform admin) land here."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={ACTION_VARIANT[r.action] ?? 'outline'} size="sm">
                      {r.action}
                    </Badge>
                    {r.target_org_id ? (
                      <Link
                        href={`/admin/tenants/${r.target_org_id}`}
                        className="font-medium hover:text-primary"
                      >
                        {r.target_org_name ?? '(unknown tenant)'}
                      </Link>
                    ) : (
                      <span className="text-muted">(no target)</span>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {format(new Date(r.created_at), 'PPpp')}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  by {r.actor_email ?? r.actor_user_id.slice(0, 8) + '…'}
                </p>
                {r.payload ? (
                  <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-foreground/5 px-2 py-1 text-[11px] text-muted">
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
