import Link from 'next/link'
import { format } from 'date-fns'
import { ClipboardList } from 'lucide-react'
import { DataTable, EmptyState, Page, StatusPill, type StatusTone } from '@homeowner-portal/ui'
import { listPlatformAuditLog } from '@/lib/platform-admin'

export const metadata = { title: 'Audit log' }

const LIMIT = 200

const ACTIONS: Record<string, { tone: StatusTone; label: string }> = {
  'tenant.create': { tone: 'success', label: 'Tenant created' },
  'tenant.update': { tone: 'info', label: 'Tenant updated' },
  'tenant.suspend': { tone: 'danger', label: 'Tenant suspended' },
  'tenant.resume': { tone: 'success', label: 'Tenant resumed' },
  'tenant.archive': { tone: 'danger', label: 'Tenant archived' },
  'tenant.restore': { tone: 'success', label: 'Tenant restored' },
  'tenant.preview': { tone: 'neutral', label: 'Tenant previewed' },
  'platform_admin.grant': { tone: 'warning', label: 'Admin granted' },
  'platform_admin.revoke': { tone: 'danger', label: 'Admin revoked' },
}

export default async function AuditLogPage() {
  const rows = await listPlatformAuditLog(LIMIT)

  return (
    <Page
      width="wide"
      title="Audit log"
      description={`Every action a platform admin takes, newest first. Append-only: updates and deletes are revoked at the database level.${rows.length >= LIMIT ? ` Showing the latest ${LIMIT}.` : ''}`}
    >
      <DataTable
        caption="Platform audit log"
        mobile="cards"
        density="compact"
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            variant="compact"
            icon={<ClipboardList aria-hidden />}
            title="No platform-admin activity yet"
            description="Creating, suspending or previewing a tenant and granting admin access are recorded here."
          />
        }
        columns={[
          {
            key: 'action',
            header: 'Action',
            mobilePrimary: true,
            cell: (r) => {
              const a = ACTIONS[r.action]
              return <StatusPill tone={a?.tone ?? 'neutral'} label={a?.label ?? r.action} icon={null} />
            },
          },
          {
            key: 'tenant',
            header: 'Tenant',
            cell: (r) =>
              r.target_org_id ? (
                <Link href={`/admin/tenants/${r.target_org_id}`} className="font-medium text-foreground no-underline hover:text-primary">
                  {r.target_org_name ?? 'Unknown tenant'}
                </Link>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: 'actor',
            header: 'By',
            cell: (r) => <span className="text-foreground-secondary">{r.actor_email ?? `${r.actor_user_id.slice(0, 8)}…`}</span>,
          },
          {
            key: 'details',
            header: 'Details',
            hideBelowLg: true,
            cell: (r) =>
              r.payload && Object.keys(r.payload).length > 0 ? (
                <details className="group max-w-md">
                  <summary className="cursor-pointer text-xs font-medium text-primary">
                    {Object.keys(r.payload).length} field{Object.keys(r.payload).length === 1 ? '' : 's'}
                  </summary>
                  <pre className="mt-1.5 overflow-x-auto rounded-md border border-border bg-subtle px-2 py-1.5 font-mono text-xs text-foreground-secondary">
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                </details>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: 'when',
            header: 'When',
            className: 'whitespace-nowrap',
            cell: (r) => (
              <time dateTime={r.created_at} className="text-foreground-secondary">
                {format(new Date(r.created_at), 'PP · p')}
              </time>
            ),
          },
        ]}
      />
    </Page>
  )
}
