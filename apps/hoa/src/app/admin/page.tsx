import Link from 'next/link'
import { Building2, Sparkles, Users, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { KpiHero } from '@/components/dashboard/KpiHero'
import { getPlatformStats } from '@/lib/platform-admin'

export const metadata = { title: 'Platform overview' }

export default async function AdminOverviewPage() {
  const stats = await getPlatformStats()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Platform overview</h1>
        <p className="text-sm text-muted">
          Cross-tenant snapshot of HomeownerHub. {stats.total_tenants} tenants ·{' '}
          {stats.total_members.toLocaleString()} accounts ·{' '}
          {stats.total_units.toLocaleString()} units under management.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiHero
          label="Total tenants"
          value={stats.total_tenants}
          sub={`${stats.active_tenants} active${stats.suspended_tenants ? ` · ${stats.suspended_tenants} suspended` : ''}`}
          href="/admin/tenants"
        />
        <KpiHero
          label="Total accounts"
          value={stats.total_members}
          sub="across all tenants"
        />
        <KpiHero
          label="Units under management"
          value={stats.total_units}
        />
        <KpiHero
          label="AI runs (30d)"
          value={stats.ai_runs_30d}
          sub={`${stats.workflows_30d.length} active workflow${stats.workflows_30d.length === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-muted" />
              Plan distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.tenants_by_plan.length === 0 ? (
              <p className="text-sm text-muted">No tenants yet.</p>
            ) : (
              <ul className="space-y-2">
                {stats.tenants_by_plan
                  .sort((a, b) => b.count - a.count)
                  .map((p) => {
                    const pct = stats.total_tenants > 0 ? (p.count / stats.total_tenants) * 100 : 0
                    return (
                      <li key={p.plan} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="capitalize text-muted">{p.plan}</span>
                          <span className="font-medium tabular-nums">
                            {p.count} · {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/5">
                          <div
                            className="h-full bg-primary"
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-muted" />
              Workflow usage — last 30 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.workflows_30d.length === 0 ? (
              <p className="text-sm text-muted">
                No AI workflow runs yet in the last 30 days.
              </p>
            ) : (
              <ul className="space-y-2">
                {stats.workflows_30d.slice(0, 8).map((w) => {
                  const max = stats.workflows_30d[0]?.runs ?? 1
                  const pct = max > 0 ? (w.runs / max) * 100 : 0
                  return (
                    <li key={w.workflow_id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs text-muted">{w.workflow_id}</span>
                        <span className="font-medium tabular-nums">{w.runs}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/5">
                        <div
                          className="h-full bg-primary"
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenants over time</CardTitle>
          <p className="text-xs text-muted">Created per month, last 12 months.</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1.5 h-24">
            {stats.tenants_over_time.map((m) => {
              const max = Math.max(...stats.tenants_over_time.map((x) => x.count), 1)
              const height = (m.count / max) * 100
              return (
                <div
                  key={m.month}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${m.month}: ${m.count}`}
                >
                  <div
                    className="w-full rounded-t bg-primary/70 hover:bg-primary"
                    style={{ height: `${height}%`, minHeight: m.count > 0 ? '2px' : '0' }}
                  />
                  <span className="text-[9px] text-muted">{m.month.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/tenants/new"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg hover:bg-primary/90"
            >
              + Create tenant
            </Link>
            <Link
              href="/admin/tenants"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-foreground/5"
            >
              All tenants
            </Link>
            <Link
              href="/admin/audit"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-foreground/5"
            >
              Audit log
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
