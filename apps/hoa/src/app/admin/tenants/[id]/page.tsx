import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  KeyValue,
  KeyValueList,
  Kpi,
  Page,
} from '@homeowner-portal/ui'
import { getTenantDetail } from '@/lib/platform-admin'
import { TenantStatusPill, planLabel } from '../../_components/tenant-status'
import { TenantActions } from './TenantActions'
import { formatShortDate } from '@/lib/format-datetime'
import { usd as fmtUsd } from '@/lib/money/format'

export const metadata = { title: 'Tenant' }

const usd = (n: number) => fmtUsd(n, { whole: true })

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const t = await getTenantDetail(id)
  if (!t) notFound()

  return (
    <Page
      width="wide"
      linkAs={Link}
      breadcrumbs={[{ label: 'Tenants', href: '/admin/tenants' }, { label: t.org.name }]}
      title={t.org.name}
      meta={<TenantStatusPill tenant={t.org} withDate />}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="neutral">{planLabel(t.org.plan)} plan</Badge>
          <Badge variant="outline" className="uppercase">
            {t.org.hub_type}
          </Badge>
          {t.org.organization_type ? <Badge variant="outline">{t.org.organization_type.replace(/_/g, ' ')}</Badge> : null}
          <span className="font-mono text-xs text-muted">{t.org.id}</span>
        </span>
      }
      actions={
        <TenantActions orgId={t.org.id} orgName={t.org.name} suspendedAt={t.org.suspended_at} archivedAt={t.org.archived_at} />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Members"
          value={t.members.total.toLocaleString()}
          hint={`${t.members.admin} admin · ${t.members.board} board · ${t.members.resident} resident`}
        />
        <Kpi
          label="Units"
          value={t.units.toLocaleString()}
          hint={`${t.associations} association${t.associations === 1 ? '' : 's'}`}
        />
        <Kpi label="Dues outstanding" value={usd(t.dues.outstanding_usd)} hint={`${t.dues.properties_behind} properties behind`} />
        <Kpi label="AI runs (30 days)" value={t.ai_runs_30d.toLocaleString()} hint={`${t.documents} documents on file`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Operations</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Open violations" value={<span className="num">{t.violations.open}</span>} />
              <KeyValue label="Cured or resolved" value={<span className="num">{t.violations.cured}</span>} />
              <KeyValue label="Fined" value={<span className="num">{t.violations.fined}</span>} />
              <KeyValue label="Escalated" value={<span className="num">{t.violations.escalated}</span>} />
              <KeyValue label="ARC pending" value={<span className="num">{t.arc_pending}</span>} />
            </KeyValueList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Vendors &amp; procurement</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Vendors" value={<span className="num">{t.vendors.total}</span>} />
              <KeyValue
                label="Compliance"
                value={
                  <span className="num">
                    {t.vendors.green} ok · {t.vendors.yellow} soon · {t.vendors.red} lapsed
                  </span>
                }
              />
              <KeyValue label="RFPs" value={<span className="num">{t.rfps.total}</span>} />
              <KeyValue
                label="RFP status"
                value={
                  <span className="num">
                    {t.rfps.draft} draft · {t.rfps.open} open · {t.rfps.awarded} awarded
                  </span>
                }
              />
              <KeyValue label="Bids submitted" value={<span className="num">{t.bids.submitted}</span>} />
              <KeyValue label="Bids awarded" value={<span className="num">{t.bids.awarded}</span>} />
            </KeyValueList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Created" value={t.org.created_at ? formatShortDate(t.org.created_at) : null} />
              <KeyValue label="Declared doors" value={t.org.doors_count != null ? t.org.doors_count.toLocaleString() : null} />
              <KeyValue label="Plan" value={planLabel(t.org.plan)} />
              <KeyValue label="Hub" value={t.org.hub_type.toUpperCase()} />
            </KeyValueList>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Recent activity</CardTitle>
          <CardDescription>Latest records created inside this tenant</CardDescription>
        </CardHeader>
        <CardContent>
          {t.recent_activity.length === 0 ? (
            <EmptyState variant="compact" title="No recent activity" description="Nothing has been recorded in this tenant yet." />
          ) : (
            <ul className="divide-y divide-border">
              {t.recent_activity.map((a, i) => (
                <li key={`${a.kind}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                  <Badge variant="neutral" className="capitalize">
                    {a.kind.replace(/_/g, ' ')}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.title}</span>
                  <time dateTime={a.occurred_at} className="text-xs text-muted">
                    {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Page>
  )
}
