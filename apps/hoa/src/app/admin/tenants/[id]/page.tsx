import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Eye, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { getTenantDetail } from '@/lib/platform-admin'
import { TenantActions } from './TenantActions'

export const metadata = { title: 'Tenant' }

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const t = await getTenantDetail(id)
  if (!t) notFound()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href="/admin/tenants"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tenants
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.org.name}</h1>
          <p className="mt-1 font-mono text-xs text-muted">{t.org.id}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" size="sm" className="capitalize">{t.org.plan}</Badge>
            <Badge variant="outline" size="sm" className="capitalize">{t.org.hub_type}</Badge>
            {t.org.organization_type ? (
              <Badge variant="outline" size="sm">
                {t.org.organization_type.replace(/_/g, ' ')}
              </Badge>
            ) : null}
            {t.org.suspended_at ? (
              <Badge variant="destructive" size="sm">
                Suspended {format(new Date(t.org.suspended_at), 'PP')}
              </Badge>
            ) : (
              <Badge variant="success" size="sm">Active</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/tenants/${t.org.id}/preview`}>
                <Eye className="h-3.5 w-3.5" />
                Preview
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/tenants/${t.org.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
          </div>
          <TenantActions orgId={t.org.id} suspendedAt={t.org.suspended_at} />
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Members" value={t.members.total} sub={`${t.members.admin} admin · ${t.members.board} board · ${t.members.resident} resident`} />
        <StatCard label="Units" value={t.units} sub={`${t.associations} association${t.associations === 1 ? '' : 's'}`} />
        <StatCard label="Vendors" value={t.vendors.total} sub={`${t.vendors.green} green · ${t.vendors.yellow} yellow · ${t.vendors.red} red`} />
        <StatCard label="AI runs (30d)" value={t.ai_runs_30d} sub={`${t.documents} documents on file`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Procurement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <KV label="RFPs — total" value={String(t.rfps.total)} />
            <KV label="… draft" value={String(t.rfps.draft)} />
            <KV label="… open / in evaluation" value={String(t.rfps.open)} />
            <KV label="… awarded" value={String(t.rfps.awarded)} />
            <KV label="… cancelled" value={String(t.rfps.cancelled)} />
            <KV label="Bids — submitted" value={String(t.bids.submitted)} />
            <KV label="Bids — awarded" value={String(t.bids.awarded)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <KV label="Violations — open" value={String(t.violations.open)} />
            <KV label="… cured / resolved" value={String(t.violations.cured)} />
            <KV label="… fined" value={String(t.violations.fined)} />
            <KV label="… escalated" value={String(t.violations.escalated)} />
            <KV label="ARC pending" value={String(t.arc_pending)} />
            <KV
              label="Dues outstanding"
              value={`$${Math.round(t.dues.outstanding_usd).toLocaleString()}`}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm sm:grid-cols-2">
          <KV
            label="Created"
            value={t.org.created_at ? format(new Date(t.org.created_at), 'PPp') : '—'}
          />
          <KV label="Doors / units (declared)" value={t.org.doors_count != null ? String(t.org.doors_count) : '—'} />
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: number
  sub?: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        {sub ? <p className="text-xs text-muted">{sub}</p> : null}
      </CardContent>
    </Card>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="truncate text-right tabular-nums">{value}</span>
    </div>
  )
}
