import { Suspense } from 'react'
import { Card, CardContent, Skeleton } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import {
  getApprovalsInbox,
  getAtRiskThisWeek,
  getComplianceHeatMap,
  getDashboardStats,
  getLatestDigest,
  getNextMeeting,
} from '@/lib/dashboard/queries'
import { listUnfinishedDrafts } from '@/lib/drafts'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ApprovalsInbox } from '@/components/dashboard/ApprovalsInbox'
import { AtRiskThisWeek } from '@/components/dashboard/AtRiskThisWeek'
import { ComplianceHeatMap } from '@/components/dashboard/ComplianceHeatMap'
import { NextMeeting } from '@/components/dashboard/NextMeeting'
import { DailyDigestCard } from '@/components/dashboard/DailyDigestCard'
import {
  DuesOverviewCard,
  PendingApprovalsCard,
  ViolationSummaryCard,
} from '@/components/dashboard/StatCards'
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
  // Layout already redirects to /onboarding when there's no org, but TS
  // doesn't know that — short-circuit defensively.
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userName = user?.email ? user.email.split('@')[0] : null

  return (
    <div className="mx-auto max-w-5xl space-y-8">
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
  const [stats, digest, heatMapCells, drafts, approvals, atRisk, nextMeeting] =
    await Promise.all([
      getDashboardStats(orgId),
      getLatestDigest(orgId),
      getComplianceHeatMap(orgId),
      listUnfinishedDrafts(),
      getApprovalsInbox(orgId),
      getAtRiskThisWeek(orgId),
      getNextMeeting(orgId),
    ])

  const actionTotal =
    approvals.totalCount +
    atRisk.totalCount +
    stats.overdueViolations +
    stats.propertiesBehind

  return (
    <div className="space-y-8">
      {/* What needs you this week — the Monday morning answer. */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2>This week</h2>
          <p className="text-sm text-muted">
            {actionTotal === 0
              ? 'Nothing urgent. Have a good Monday.'
              : `${actionTotal} ${actionTotal === 1 ? 'thing' : 'things'} need attention`}
          </p>
        </div>

        {/* New: unified approvals inbox — the foreground signal. */}
        <ApprovalsInbox items={approvals.items} />

        {/* Time-sensitive risks + the next board moment, side-by-side. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <AtRiskThisWeek items={atRisk.items} totalCount={atRisk.totalCount} />
          <NextMeeting meeting={nextMeeting} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <PendingApprovalsCard count={stats.pendingApprovals} />
          <ViolationSummaryCard
            open={stats.openViolations}
            overdue={stats.overdueViolations}
          />
          <DuesOverviewCard
            amount={stats.overdueDuesAmount}
            propertiesBehind={stats.propertiesBehind}
          />
        </div>
      </section>

      {/* Daily Digest — narrative context, still important but no longer
          the visual lead. */}
      <DailyDigestCard
        initialContent={digest.content}
        initialGeneratedAt={digest.generatedAt}
      />

      {/* Drafts the user left mid-flow. Self-hides when empty. */}
      <UnfinishedWorkflowsCard drafts={drafts} />

      {/* Heat map demoted to a collapsible — it answers "show me my year"
          not "what needs me today". */}
      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer list-none px-6 py-4 text-sm font-medium text-muted hover:text-foreground">
          3-month compliance heat map
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
    <div className="space-y-8">
      <section className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <Card variant="elevated">
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    </div>
  )
}
