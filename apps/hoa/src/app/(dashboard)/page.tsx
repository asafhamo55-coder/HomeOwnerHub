import { Suspense } from 'react'
import { AlertTriangle, Briefcase, ClipboardList, Wallet } from 'lucide-react'
import { Card, CardContent, Skeleton } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import {
  getApprovalsInbox,
  getAtRiskThisWeek,
  getComplianceHeatMap,
  getLatestDigest,
  getLeaseSummary,
  getNextMeeting,
} from '@/lib/dashboard/queries'
import {
  getDashboardKpis,
  getThirtyDayActivity,
  getVendorComplianceDonut,
  getViolationStatusDonut,
} from '@/lib/dashboard/charts'
import { listUnfinishedDrafts } from '@/lib/drafts'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ActivityBar } from '@/components/dashboard/ActivityBar'
import { ApprovalsInbox } from '@/components/dashboard/ApprovalsInbox'
import { AtRiskThisWeek } from '@/components/dashboard/AtRiskThisWeek'
import { ComplianceHeatMap } from '@/components/dashboard/ComplianceHeatMap'
import { DailyDigestCard } from '@/components/dashboard/DailyDigestCard'
import { KpiHero } from '@/components/dashboard/KpiHero'
import { LeaseSummaryCard } from '@/components/dashboard/LeaseSummaryCard'
import { NextMeeting } from '@/components/dashboard/NextMeeting'
import { StatusDonut } from '@/components/dashboard/StatusDonut'
import { UnfinishedWorkflowsCard } from '@/components/dashboard/UnfinishedWorkflowsCard'

export const metadata = { title: 'Dashboard' }

function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardHome() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userName = user?.email ? user.email.split('@')[0] : null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1>
          {greeting()}
          {userName ? `, ${userName}` : ''}
        </h1>
        <p className="text-sm text-muted">{org.name}</p>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent orgId={org.id} />
      </Suspense>
    </div>
  )
}

async function DashboardContent({ orgId }: { orgId: string }) {
  const [
    kpis,
    violationsDonut,
    vendorComplianceDonut,
    activity,
    approvals,
    atRisk,
    nextMeeting,
    leaseSummary,
    digest,
    heatMapCells,
    drafts,
  ] = await Promise.all([
    getDashboardKpis(orgId),
    getViolationStatusDonut(orgId),
    getVendorComplianceDonut(orgId),
    getThirtyDayActivity(orgId),
    getApprovalsInbox(orgId),
    getAtRiskThisWeek(orgId),
    getNextMeeting(orgId),
    getLeaseSummary(orgId),
    getLatestDigest(orgId),
    getComplianceHeatMap(orgId),
    listUnfinishedDrafts(),
  ])

  return (
    <div className="space-y-6">
      {/* KPI heroes — the four numbers that should answer "what should I
          care about today?" before scrolling. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiHero
          label="Dues outstanding"
          value={kpis.duesOutstandingUsd.value}
          display={`$${Math.round(kpis.duesOutstandingUsd.value).toLocaleString()}`}
          previous={kpis.duesOutstandingUsd.previous}
          upIsBad
          href="/dues"
          tone={kpis.duesOutstandingUsd.value > 0 ? 'warning' : 'success'}
        />
        <KpiHero
          label="Open violations"
          value={kpis.openViolations.value}
          previous={kpis.openViolations.previous}
          upIsBad
          href="/violations"
          tone={kpis.openViolations.value > 0 ? 'warning' : 'success'}
        />
        <KpiHero
          label="Vendors at risk"
          value={kpis.vendorsAtRisk.value}
          sub={
            kpis.vendorsAtRisk.value === 0
              ? 'all compliant'
              : `${kpis.vendorsAtRisk.value} with yellow or red status`
          }
          href="/vendors/approval-queue"
          tone={kpis.vendorsAtRisk.value > 0 ? 'warning' : 'success'}
        />
        <KpiHero
          label="ARC pending"
          value={kpis.arcPending.value}
          sub={
            kpis.arcPending.value === 0
              ? 'no applications waiting'
              : 'awaiting board response'
          }
          href="/arc"
          tone={kpis.arcPending.value > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* At-a-glance breakdowns. Three equal columns when lease summary
          is present (org has associations); two when it isn't. */}
      <div className={`grid gap-4 ${leaseSummary.hasAssociation ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        <StatusDonut
          title="Violations by status"
          icon={<AlertTriangle className="h-4 w-4 text-muted" />}
          segments={violationsDonut.segments}
          total={violationsDonut.total}
          emptyTitle="No violations on file"
          emptyDescription="When violations are reported, the status breakdown will show here."
        />
        <StatusDonut
          title="Vendor compliance"
          icon={<Briefcase className="h-4 w-4 text-muted" />}
          segments={vendorComplianceDonut.segments}
          total={vendorComplianceDonut.total}
          emptyTitle="No vendors graded yet"
          emptyDescription="Run a compliance check on your vendors to populate this view."
        />
        <LeaseSummaryCard summary={leaseSummary} />
      </div>

      {/* 30-day activity bar. */}
      <ActivityBar buckets={activity.buckets} />

      {/* "What needs you this week" — collapsed by default to keep the
          chart-led layout uncluttered. Tap to expand. */}
      <details className="rounded-xl border border-border bg-surface" open={approvals.totalCount + atRisk.totalCount > 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium hover:bg-foreground/5">
          <span>This week</span>
          <span className="text-xs text-muted">
            {approvals.totalCount + atRisk.totalCount === 0
              ? 'nothing urgent'
              : `${approvals.totalCount + atRisk.totalCount} items`}
          </span>
        </summary>
        <div className="space-y-4 border-t border-border p-4">
          <ApprovalsInbox items={approvals.items} />
          <div className="grid gap-4 sm:grid-cols-2">
            <AtRiskThisWeek items={atRisk.items} totalCount={atRisk.totalCount} />
            <NextMeeting meeting={nextMeeting} />
          </div>
        </div>
      </details>

      {/* Daily digest — narrative context, collapsed by default. */}
      <details className="rounded-xl border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium hover:bg-foreground/5">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted" />
            Daily digest
          </span>
          <span className="text-xs text-muted">
            {digest.content ? 'AI-summarised' : 'not yet generated'}
          </span>
        </summary>
        <div className="border-t border-border p-2">
          <DailyDigestCard
            initialContent={digest.content}
            initialGeneratedAt={digest.generatedAt}
          />
        </div>
      </details>

      {/* Drafts the user left mid-flow. Self-hides when empty. */}
      <UnfinishedWorkflowsCard drafts={drafts} />

      {/* Year-view heat map — collapsed. */}
      <details className="rounded-xl border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium hover:bg-foreground/5">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted" />
            3-month compliance heat map
          </span>
        </summary>
        <div className="border-t border-border p-2">
          <ComplianceHeatMap cells={heatMapCells} />
        </div>
      </details>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-4 p-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
