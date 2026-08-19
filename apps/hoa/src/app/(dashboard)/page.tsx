import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, MessageSquare, Wallet } from 'lucide-react'
import { Alert, Card, CardContent, Skeleton } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
// EMERGENCY ROLLBACK (v2 — second attempt) 2026-05-25: cached layer
// broke prod AGAIN at runtime with reference 2236965075. Both the
// dynamic factory pattern (v1) and the canonical module-scoped pattern
// (v2) fail. Not pushing a v3 without a real Vercel-environment repro.
// Reverting to cookie-bound fetchers — they're slower but they work.
import {
  getApprovalsInbox,
  getAtRiskThisWeek,
  getCommunitySnapshot,
  getComplianceHeatMap,
  getLatestDigest,
  getLeaseSummary,
  getNextMeeting,
} from '@/lib/dashboard/queries'
import {
  getDashboardKpis,
  getThirtyDayActivity,
  getTicketCategoryDonut,
  getViolationStatusDonut,
} from '@/lib/dashboard/charts'
import { getSetupProgress } from '@/lib/inbox/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTriageSnapshot } from '@/lib/dashboard/triage'
import {
  buildBullets,
  countNewSince,
  formatNextMeeting,
  readBaseline,
  todayISO,
} from '@/lib/dashboard/digest-facts'
import { MailTriageCard } from '@/components/dashboard/MailTriageCard'
import { ActivityBar } from '@/components/dashboard/ActivityBar'
import { ApprovalsInbox } from '@/components/dashboard/ApprovalsInbox'
import { AtRiskThisWeek } from '@/components/dashboard/AtRiskThisWeek'
import { ComplianceHeatMap } from '@/components/dashboard/ComplianceHeatMap'
import { DailyDigestCard } from '@/components/dashboard/DailyDigestCard'
import { KpiHero } from '@/components/dashboard/KpiHero'
import { LeaseSummaryCard } from '@/components/dashboard/LeaseSummaryCard'
import { NextMeeting } from '@/components/dashboard/NextMeeting'
import { StatusBar } from '@/components/dashboard/StatusBar'
import { StatusDonut } from '@/components/dashboard/StatusDonut'
import { GreetingHeadline } from '@/components/dashboard/GreetingHeadline'

export const metadata = { title: 'Dashboard' }

// The dashboard surfaces near-real-time state across every entity
// (dues, violations, lease occupancy, approvals, etc.) and is the
// single page where staleness is most visible. Default page caching
// would serve stale renders even when server actions revalidated
// underlying tables. Force-dynamic — the queries below are all cheap
// indexed lookups, total render time is well inside the budget.
export const dynamic = 'force-dynamic'

// Server-rendered placeholder date shown until GreetingHeadline swaps in
// the visitor's local date on mount. UTC on Vercel, so only used briefly.
const serverDateLabel = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

export default async function DashboardHome() {
  const org = await getCurrentOrg()
  if (!org) return null

  // Prefer the user's set full_name from profiles. Fall back to the
  // email-prefix only when no name has been set yet, so the greeting
  // always shows something. Editable on /settings via ProfileForm.
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profileRow } = user
    ? await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle<{ full_name: string | null }>()
    : { data: null }
  const fullName = profileRow?.full_name?.trim() || null
  const firstName = fullName ? fullName.split(/\s+/)[0] : null
  const userName =
    firstName ?? (user?.email ? user.email.split('@')[0] : null)

  const setupSteps = await getSetupProgress(supabase, org.id)
  const pendingSetup = setupSteps.filter((step) => !step.done)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <GreetingHeadline name={userName} contextLabel={org.name} fallbackDate={serverDateLabel} />
      </header>

      {pendingSetup.length > 0 ? (
        <Alert variant="info" title="Finish setting up">
          {pendingSetup.length} step{pendingSetup.length === 1 ? '' : 's'} left —{' '}
          {pendingSetup[0].title}.{' '}
          <Link href="/onboarding/setup" className="underline">
            Continue
          </Link>
        </Alert>
      ) : null}

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent orgId={org.id} />
      </Suspense>
    </div>
  )
}

async function DashboardContent({ orgId }: { orgId: string }) {
  const supabase = await getSupabaseServerClient()

  const [
    kpis,
    violationsDonut,
    ticketCategoryDonut,
    activity,
    approvals,
    atRisk,
    nextMeeting,
    leaseSummary,
    digest,
    heatMapCells,
    triage,
    community,
  ] = await Promise.all([
    getDashboardKpis(orgId),
    getViolationStatusDonut(orgId),
    getTicketCategoryDonut(orgId),
    getThirtyDayActivity(orgId),
    getApprovalsInbox(orgId),
    getAtRiskThisWeek(orgId),
    getNextMeeting(orgId),
    getLeaseSummary(orgId),
    getLatestDigest(orgId),
    getComplianceHeatMap(orgId),
    getTriageSnapshot(supabase, orgId),
    getCommunitySnapshot(orgId),
  ])

  const today = todayISO()
  const baseline = await readBaseline(supabase, orgId, today)
  const newSinceBaseline =
    baseline !== null ? await countNewSince(supabase, orgId, baseline.capturedAt) : null

  const bullets = buildBullets({
    newSinceBaseline,
    waitingOverThree: triage.threads.filter((t) => t.waitingDays > 3).length,
    nextMeeting: formatNextMeeting(nextMeeting),
  })

  return (
    <div className="space-y-6">
      {/* Today — the AI suggestion line plus deterministic bullets. The
          bullets deliberately never restate a tile below; they carry what
          CHANGED, which a tile structurally cannot show. */}
      <DailyDigestCard
        initialSuggestion={digest.content}
        initialBullets={bullets}
        initialGeneratedAt={digest.generatedAt}
      />

      {/* The four numbers that are about today. "Active vendors" was cut:
          reference data, not a daily decision. The two mail tiles that used
          to sit here ("Needs a reply", "Oldest waiting") were cut too — the
          MailTriageCard directly below already carries both, per-thread. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiHero
          label="Open tickets"
          value={kpis.openTickets.value}
          sub="awaiting work"
          href="/tickets"
          upIsBad
        />
        <KpiHero
          label="Residents"
          value={community.residentCount}
          sub={
            community.propertyCount === 0
              ? 'no properties on file'
              : `across ${community.propertyCount.toLocaleString()} ${
                  community.propertyCount === 1 ? 'property' : 'properties'
                }`
          }
          href="/properties"
        />
        {/* Occupancy, not leased-%: `tenure` cannot express "empty", so a
            lease-based figure sits at 100% for any filled-in roster. This
            counts properties with at least one current resident. */}
        <KpiHero
          label="Occupancy"
          value={community.occupiedPct ?? 0}
          display={
            community.occupiedPct === null
              ? '—'
              : `${Math.round(community.occupiedPct)}%`
          }
          sub={
            community.propertyCount === 0
              ? 'no properties on file'
              : `${community.occupiedCount} of ${community.propertyCount} occupied · ${community.waitingListCount} on waitlist`
          }
          href="/leases"
        />
        <KpiHero
          label="Dues overdue"
          value={kpis.duesOutstandingUsd.value}
          display={`$${Math.round(kpis.duesOutstandingUsd.value).toLocaleString()}`}
          previous={kpis.duesOutstandingUsd.previous}
          upIsBad
          href="/dues"
        />
      </div>

      <MailTriageCard snapshot={triage} />

      {/* Open by default — a confirmed "nothing urgent" is worth seeing. */}
      <details className="rounded-xl border border-border bg-surface" open>
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

      {/* Demoted, not deleted. These stopped competing with today's work. */}
      <details className="rounded-xl border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium hover:bg-foreground/5">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted" />
            Money &amp; compliance
          </span>
        </summary>
        <div className="space-y-4 border-t border-border p-4">
          {/* "Open tickets" was promoted to the top KPI row; repeating it
              here would show the same number twice on one page. */}
          <KpiHero
            label="Open violations"
            value={kpis.openViolations.value}
            previous={kpis.openViolations.previous}
            upIsBad
            href="/violations"
          />
          <div
            className={`grid gap-4 ${leaseSummary.hasAssociation ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}
          >
            <StatusDonut
              title="Violations by status"
              icon={<AlertTriangle className="h-4 w-4 text-muted" />}
              segments={violationsDonut.segments}
              total={violationsDonut.total}
              emptyTitle="No violations on file"
              emptyDescription="When violations are reported, the status breakdown will show here."
            />
            <StatusBar
              title="Tickets by category"
              icon={<MessageSquare className="h-4 w-4 text-muted" />}
              segments={ticketCategoryDonut.segments}
              total={ticketCategoryDonut.total}
              emptyTitle="No tickets yet"
              emptyDescription="When residents submit tickets, the category breakdown will show here."
            />
            <LeaseSummaryCard summary={leaseSummary} />
          </div>
          <ActivityBar buckets={activity.buckets} />
        </div>
      </details>

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
