import { Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { KpiHero } from '@/components/dashboard/KpiHero'
import { getAnalyticsData } from '@/lib/platform-admin'
import {
  FeatureAdoptionChart,
  GrowthChart,
  VendorComplianceDonut,
  ViolationsDonut,
  WorkflowUsageChart,
} from '@/components/admin/AnalyticsCharts'
import { TenantHealthTable } from '@/components/admin/TenantHealthTable'

export const metadata = { title: 'Platform analytics' }

export default async function AnalyticsPage() {
  const data = await getAnalyticsData()

  const avgMembersPerTenant =
    data.total_tenants > 0
      ? Math.round(data.total_members / data.total_tenants)
      : 0
  const avgUnitsPerTenant =
    data.total_tenants > 0
      ? Math.round(data.total_units / data.total_tenants)
      : 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Platform analytics</h1>
        <p className="text-sm text-muted">
          Cross-tenant metrics, feature adoption, and tenant health across the
          entire platform.
        </p>
      </header>

      {/* ── KPI row ───────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiHero
          label="Total tenants"
          value={data.total_tenants}
          sub={`${data.active_tenants} active · ${data.suspended_tenants} suspended`}
          href="/admin/tenants"
        />
        <KpiHero
          label="Total members"
          value={data.total_members}
          sub={`avg ${avgMembersPerTenant} per tenant`}
        />
        <KpiHero
          label="Units managed"
          value={data.total_units}
          sub={`avg ${avgUnitsPerTenant} per tenant`}
        />
        <KpiHero
          label="AI runs (30d)"
          value={data.total_ai_runs_30d}
          sub={`${data.workflows_30d.length} active workflow${data.workflows_30d.length === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiHero
          label="Total vendors"
          value={data.total_vendors}
          sub={`${data.vendor_compliance.yellow + data.vendor_compliance.red} at risk`}
        />
        <KpiHero
          label="Open violations"
          value={data.total_open_violations}
          sub={`${data.total_violations} total across all tenants`}
        />
        <KpiHero
          label="Outstanding dues"
          value={data.total_outstanding_dues_usd}
          display={`$${data.total_outstanding_dues_usd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          sub="across all tenants"
        />
        <KpiHero
          label="Vendors at risk"
          value={data.vendor_compliance.yellow + data.vendor_compliance.red}
          sub={`${data.vendor_compliance.red} non-compliant · ${data.vendor_compliance.yellow} expiring soon`}
        />
      </div>

      {/* ── Growth chart ──────────────────────────────────────────── */}
      <GrowthChart
        tenants={data.tenants_over_time}
        members={data.members_over_time}
      />

      {/* ── Donuts + feature adoption ─────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ViolationsDonut data={data.violations_by_status} />
        <VendorComplianceDonut data={data.vendor_compliance} />
        <FeatureAdoptionChart features={data.feature_adoption} />
      </div>

      {/* ── Plan distribution + workflow usage ────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-muted" />
              Plan distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-2">
            {data.tenants_by_plan.length === 0 ? (
              <p className="text-sm text-muted">No tenants yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.tenants_by_plan
                  .sort((a, b) => b.count - a.count)
                  .map((p) => {
                    const pct =
                      data.total_tenants > 0
                        ? (p.count / data.total_tenants) * 100
                        : 0
                    return (
                      <li key={p.plan} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="capitalize font-medium">{p.plan}</span>
                          <span className="font-medium tabular-nums">
                            {p.count}{' '}
                            <span className="text-muted font-normal">
                              ({pct.toFixed(0)}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-foreground/5">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    )
                  })}
              </ul>
            )}
          </CardContent>
        </Card>

        <WorkflowUsageChart workflows={data.workflows_30d} />
      </div>

      {/* ── Tenant health scoreboard ──────────────────────────────── */}
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Tenant health scoreboard</h2>
          <p className="text-sm text-muted">
            Click column headers to sort. Red values indicate attention needed.
          </p>
        </div>
        <TenantHealthTable rows={data.tenant_health} />
      </section>
    </div>
  )
}
