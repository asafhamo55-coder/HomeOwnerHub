import Link from 'next/link'
import { Building2, Plus, Sparkles } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Kpi,
  Page,
} from '@homeowner-portal/ui'
import { getPlatformStats, listTenants } from '@/lib/platform-admin'
import { BarList } from './_components/BarList'
import { MonthBars } from './_components/MonthBars'
import { TenantStatusPill, planLabel } from './_components/tenant-status'
import { formatShortDate } from '@/lib/format-datetime'

export const metadata = { title: 'Platform overview' }

/** A count that failed to load reads "Not available", never 0. */
const n = (v: number | null) => (v === null ? 'Not available' : v.toLocaleString())

export default async function AdminOverviewPage() {
  const [stats, tenants] = await Promise.all([getPlatformStats(), listTenants()])
  const recent = tenants.slice(0, 5)

  return (
    <Page
      width="wide"
      title="Platform overview"
      description={`Cross-tenant snapshot of HomeownerHub · ${stats.total_tenants.toLocaleString()} tenants · ${n(stats.total_members)} accounts · ${n(stats.total_units)} units`}
      actions={
        <Button asChild>
          <Link href="/admin/tenants/new" className="no-underline">
            <Plus aria-hidden />
            Create tenant
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Tenants"
          value={stats.total_tenants.toLocaleString()}
          hint={`${stats.active_tenants} active${stats.suspended_tenants ? ` · ${stats.suspended_tenants} suspended` : ''}`}
          href="/admin/tenants"
          linkAs={Link}
        />
        <Kpi label="Accounts" value={n(stats.total_members)} hint={stats.total_members === null ? 'Count failed to load' : 'Across all tenants'} />
        <Kpi
          label="Units under management"
          value={n(stats.total_units)}
          {...(stats.total_units === null ? { hint: 'Count failed to load' } : {})}
        />
        <Kpi
          label="AI runs (30 days)"
          value={n(stats.ai_runs_30d)}
          hint={
            stats.ai_runs_30d === null
              ? 'Count failed to load'
              : `${stats.workflows_30d.length} active workflow${stats.workflows_30d.length === 1 ? '' : 's'}`
          }
          href="/admin/analytics"
          linkAs={Link}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Building2 className="size-4 text-muted" aria-hidden />
              Plan distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.tenants_by_plan.length === 0 ? (
              <EmptyState variant="compact" title="No tenants yet" description="Plans appear once a tenant exists." />
            ) : (
              <BarList
                max={stats.total_tenants}
                items={[...stats.tenants_by_plan]
                  .sort((a, b) => b.count - a.count)
                  .map((p) => ({
                    key: p.plan,
                    label: planLabel(p.plan),
                    value: p.count,
                    display: (
                      <>
                        {p.count}{' '}
                        <span className="font-normal text-muted">
                          ({stats.total_tenants > 0 ? Math.round((p.count / stats.total_tenants) * 100) : 0}%)
                        </span>
                      </>
                    ),
                  }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted" aria-hidden />
              AI workflow usage
            </CardTitle>
            <CardDescription>Runs per workflow, last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.workflows_30d.length === 0 ? (
              <EmptyState
                variant="compact"
                title="No AI runs in the last 30 days"
                description="Runs from every tenant are counted here."
              />
            ) : (
              <BarList
                mono
                items={stats.workflows_30d.slice(0, 8).map((w) => ({ key: w.workflow_id, label: w.workflow_id, value: w.runs }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Tenants created</CardTitle>
          <CardDescription>Per month, last 12 months</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthBars months={stats.tenants_over_time} label="tenants created" />
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="recent-tenants">
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-tenants" className="text-lg">
            Newest tenants
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/tenants" className="no-underline">
              View all
            </Link>
          </Button>
        </div>
        <DataTable
          caption="Newest tenants"
          mobile="cards"
          rows={recent}
          rowKey={(t) => t.id}
          empty={
            <EmptyState
              variant="compact"
              title="No tenants yet"
              description="Create the first tenant to onboard an HOA."
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Tenant',
              mobilePrimary: true,
              cell: (t) => (
                <Link href={`/admin/tenants/${t.id}`} className="font-medium text-foreground no-underline hover:text-primary">
                  {t.name}
                </Link>
              ),
            },
            { key: 'plan', header: 'Plan', cell: (t) => planLabel(t.plan) },
            { key: 'units', header: 'Units', numeric: true, cell: (t) => t.units_count.toLocaleString() },
            {
              key: 'created',
              header: 'Created',
              hideBelowLg: true,
              cell: (t) => (t.created_at ? formatShortDate(t.created_at) : '—'),
            },
            { key: 'status', header: 'Status', cell: (t) => <TenantStatusPill tenant={t} /> },
          ]}
        />
      </section>
    </Page>
  )
}
