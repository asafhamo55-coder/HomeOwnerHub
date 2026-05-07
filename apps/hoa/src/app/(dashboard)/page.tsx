import { Suspense } from 'react'
import { Card, CardContent, Skeleton } from '@homeownerhub/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getDashboardStats, getLatestDigest } from '@/lib/dashboard/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { DailyDigestCard } from '@/components/dashboard/DailyDigestCard'
import {
  DuesOverviewCard,
  PendingApprovalsCard,
  ViolationSummaryCard,
} from '@/components/dashboard/StatCards'

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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-muted">
          {greeting()}
          {user?.email ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-fg">{org.name}</p>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent orgId={org.id} />
      </Suspense>
    </div>
  )
}

async function DashboardContent({ orgId }: { orgId: string }) {
  const [stats, digest] = await Promise.all([
    getDashboardStats(orgId),
    getLatestDigest(orgId),
  ])

  return (
    <div className="space-y-6">
      <DailyDigestCard
        initialContent={digest.content}
        initialGeneratedAt={digest.generatedAt}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PendingApprovalsCard count={stats.pendingApprovals} />
        <ViolationSummaryCard open={stats.openViolations} overdue={stats.overdueViolations} />
        <DuesOverviewCard
          amount={stats.overdueDuesAmount}
          propertiesBehind={stats.propertiesBehind}
        />
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Card variant="elevated">
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
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
    </div>
  )
}
