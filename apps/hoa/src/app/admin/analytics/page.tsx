import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Kpi, Page, type SortDirection } from '@homeowner-portal/ui'
import { getAnalyticsData, getPlatformDraftQuality } from '@/lib/platform-admin'
import { formatApproveTime, formatPercent, LIGHT_EDIT_RATIO } from '@/lib/inbox/draft/metrics'
import {
  FeatureAdoptionChart,
  GrowthChart,
  VendorComplianceDonut,
  ViolationsDonut,
  WorkflowUsageChart,
} from '@/components/admin/AnalyticsCharts'
import { HEALTH_SORT_KEYS, TenantHealthTable, type HealthSortKey } from '@/components/admin/TenantHealthTable'
import { BarList } from '../_components/BarList'
import { planLabel } from '../_components/tenant-status'

export const metadata = { title: 'Platform analytics' }

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>
}) {
  const sp = await searchParams
  const [data, draftQuality] = await Promise.all([
    getAnalyticsData(),
    // BL-101 A10. A failed read hides the section rather than the page.
    getPlatformDraftQuality().catch((err: unknown) => {
      console.error('AnalyticsPage: draft quality read failed', {
        message: err instanceof Error ? err.message : String(err),
      })
      return null
    }),
  ])

  const sortKey: HealthSortKey = (HEALTH_SORT_KEYS as readonly string[]).includes(sp.sort ?? '')
    ? (sp.sort as HealthSortKey)
    : 'outstanding_dues_usd'
  const dir: SortDirection = sp.dir === 'asc' || sp.dir === 'desc' ? sp.dir : sortKey === 'name' ? 'asc' : 'desc'

  const perTenant = (n: number) => (data.total_tenants > 0 ? Math.round(n / data.total_tenants) : 0)
  const atRisk = data.vendor_compliance.yellow + data.vendor_compliance.red

  return (
    <Page
      width="wide"
      title="Platform analytics"
      description="Growth, adoption and tenant health across every tenant on the platform."
    >
      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Tenants"
          value={data.total_tenants.toLocaleString()}
          hint={`${data.active_tenants} active · ${data.suspended_tenants} suspended`}
          href="/admin/tenants"
          linkAs={Link}
        />
        <Kpi label="Members" value={data.total_members.toLocaleString()} hint={`${perTenant(data.total_members)} per tenant on average`} />
        <Kpi label="Units managed" value={data.total_units.toLocaleString()} hint={`${perTenant(data.total_units)} per tenant on average`} />
        <Kpi
          label="AI runs (30 days)"
          value={data.total_ai_runs_30d.toLocaleString()}
          hint={`${data.workflows_30d.length} active workflow${data.workflows_30d.length === 1 ? '' : 's'}`}
        />
        <Kpi label="Vendors" value={data.total_vendors.toLocaleString()} hint={`${atRisk} at risk`} />
        <Kpi
          label="Open violations"
          value={data.total_open_violations.toLocaleString()}
          hint={`${data.total_violations.toLocaleString()} recorded in total`}
        />
        <Kpi label="Dues outstanding" value={usd(data.total_outstanding_dues_usd)} hint="Across all tenants" />
        <Kpi
          label="Vendors at risk"
          value={atRisk.toLocaleString()}
          hint={`${data.vendor_compliance.red} non-compliant · ${data.vendor_compliance.yellow} expiring`}
        />
      </section>

      {draftQuality ? (
        <section aria-labelledby="draft-quality" className="space-y-3">
          <div>
            <h2 id="draft-quality" className="text-lg">
              Inbox AI drafts (30 days)
            </h2>
            <p className="text-sm text-muted">
              Approved AI reply drafts across {draftQuality.orgs} tenant{draftQuality.orgs === 1 ? '' : 's'}. Light edits = at most{' '}
              {Math.round(LIGHT_EDIT_RATIO * 100)}% of words changed.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Drafts sent" value={draftQuality.summary.drafts.toLocaleString()} hint={`${formatPercent(draftQuality.summary.unchangedShare)} unedited`} />
            <Kpi label="Sent with light edits" value={formatPercent(draftQuality.summary.lightEditShare)} hint={`Median edit ${formatPercent(draftQuality.summary.medianEditRatio)} of words`} />
            <Kpi label="Median time to approve" value={formatApproveTime(draftQuality.summary.medianSecondsToApprove)} hint={`Median blanks per draft: ${draftQuality.summary.medianBlanks ?? '—'}`} />
            <Kpi label="Citations kept" value={formatPercent(draftQuality.summary.citationsKeptShare)} hint="Drafts that kept every quoted citation" />
          </div>
        </section>
      ) : null}

      <GrowthChart tenants={data.tenants_over_time} members={data.members_over_time} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ViolationsDonut data={data.violations_by_status} />
        <VendorComplianceDonut data={data.vendor_compliance} />
        <FeatureAdoptionChart features={data.feature_adoption} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Building2 className="size-4 text-muted" aria-hidden />
              Plan distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.tenants_by_plan.length === 0 ? (
              <EmptyState variant="compact" title="No tenants yet" />
            ) : (
              <BarList
                max={data.total_tenants}
                items={[...data.tenants_by_plan]
                  .sort((a, b) => b.count - a.count)
                  .map((p) => ({
                    key: p.plan,
                    label: planLabel(p.plan),
                    value: p.count,
                    display: (
                      <>
                        {p.count}{' '}
                        <span className="font-normal text-muted">
                          ({data.total_tenants > 0 ? Math.round((p.count / data.total_tenants) * 100) : 0}%)
                        </span>
                      </>
                    ),
                  }))}
              />
            )}
          </CardContent>
        </Card>
        <WorkflowUsageChart workflows={data.workflows_30d} />
      </div>

      <section className="space-y-3" aria-labelledby="tenant-health">
        <div>
          <h2 id="tenant-health" className="text-lg">
            Tenant health
          </h2>
          <p className="text-sm text-muted">Sort by any column. Vendors at risk and open violations are highlighted.</p>
        </div>
        <TenantHealthTable
          rows={data.tenant_health}
          sort={{ key: sortKey, direction: dir }}
          sortHref={(key, direction) => `/admin/analytics?sort=${key}&dir=${direction}`}
        />
      </section>
    </Page>
  )
}
