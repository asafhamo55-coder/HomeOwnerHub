import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, ClipboardCheck, Mail, Wallet } from 'lucide-react'
import { cookies } from 'next/headers'
import {
  Card,
  CardContent,
  Kpi,
  NoOrgSelected,
  Page,
  Skeleton,
} from '@homeowner-portal/ui'
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
  getNextMeetingResult,
  getResidentQueueCounts,
  getStaleApprovalCount,
} from '@/lib/dashboard/queries'
import { buildBoardSignals, STALE_APPROVAL_DAYS } from '@/lib/dashboard/board-signals'
import { MAX_INSIGHTS } from '@homeowner-portal/ai'
import {
  getDashboardKpis,
  getThirtyDayActivity,
  getTicketCategoryDonut,
  getViolationStatusDonut,
} from '@/lib/dashboard/charts'
import { kpiDelta } from '@/lib/dashboard/kpi-delta'
import { loadSetupChecklist, setupDismissedCookie } from '@/lib/dashboard/setup-checklist'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { getTriageSnapshot } from '@/lib/dashboard/triage'
import {
  buildBullets,
  countNewSince,
  formatNextMeeting,
  readBaseline,
  todayISO,
} from '@/lib/dashboard/digest-facts'
import { MailTriageCard } from '@/components/dashboard/MailTriageCard'
import { ActivityTrend } from '@/components/dashboard/ActivityTrend'
import { ApprovalsInbox } from '@/components/dashboard/ApprovalsInbox'
import { AtRiskThisWeek } from '@/components/dashboard/AtRiskThisWeek'
import { BreakdownList } from '@/components/dashboard/BreakdownList'
import { ComplianceHeatMap } from '@/components/dashboard/ComplianceHeatMap'
import { DailyDigestCard } from '@/components/dashboard/DailyDigestCard'
import { LeaseSummaryCard } from '@/components/dashboard/LeaseSummaryCard'
import { NextMeeting } from '@/components/dashboard/NextMeeting'
import { GreetingHeadline } from '@/components/dashboard/GreetingHeadline'
import { SetupChecklistCard } from '@/components/dashboard/SetupChecklistCard'

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

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

export default async function DashboardHome() {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  // Prefer the user's set full_name from profiles. Fall back to the
  // email-prefix only when no name has been set yet, so the greeting
  // always shows something. Editable on /settings via ProfileForm.
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const profile = user
    ? await loadOrFail(
        'profile name',
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle<{ full_name: string | null }>(),
      )
    : null
  // A failed name lookup only costs the greeting its name; the email
  // prefix below is a fine stand-in. Logged by loadOrFail either way.
  const profileRow = profile?.ok ? profile.data : null
  const fullName = profileRow?.full_name?.trim() || null
  const firstName = fullName ? fullName.split(/\s+/)[0] : null
  const userName =
    firstName ?? (user?.email ? user.email.split('@')[0] : null)

  // Each step's read fails on its own ("Couldn't check"), so this never
  // takes the dashboard down. The dismiss cookie only counts while the
  // checklist is still complete — a step that regresses brings it back.
  const checklist = await loadSetupChecklist(supabase, org.id)
  const dismissed = (await cookies()).get(setupDismissedCookie(org.id))?.value === '1'
  const showChecklist = !(checklist.complete && dismissed)

  return (
    <Page
      width="wide"
      header={
        <header className="space-y-1">
          {/* GreetingHeadline renders the page's one <h1>. */}
          <GreetingHeadline name={userName} contextLabel={org.name} fallbackDate={serverDateLabel} />
          <p className="text-sm text-muted">Here’s what needs your attention today.</p>
        </header>
      }
    >
      {showChecklist ? <SetupChecklistCard checklist={checklist} /> : null}

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent orgId={org.id} />
      </Suspense>
    </Page>
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
    heatMap,
    triage,
    community,
    residentQueues,
    staleApprovals,
  ] = await Promise.all([
    getDashboardKpis(orgId),
    getViolationStatusDonut(orgId),
    getTicketCategoryDonut(orgId),
    getThirtyDayActivity(orgId),
    getApprovalsInbox(orgId),
    getAtRiskThisWeek(orgId),
    getNextMeetingResult(orgId),
    getLeaseSummary(orgId),
    getLatestDigest(orgId),
    getComplianceHeatMap(orgId),
    getTriageSnapshot(supabase, orgId),
    getCommunitySnapshot(orgId),
    getResidentQueueCounts(orgId),
    getStaleApprovalCount(orgId, STALE_APPROVAL_DAYS),
  ])

  const today = todayISO()
  const baseline = await readBaseline(supabase, orgId, today)
  const newSinceBaseline =
    baseline !== null ? await countNewSince(supabase, orgId, baseline.capturedAt) : null

  const bullets = buildBullets({
    newSinceBaseline,
    waitingOverThree: triage.threads.filter((t) => t.waitingDays > 3).length,
    nextMeeting: formatNextMeeting(nextMeeting.meeting),
  })

  // The insights the server renders carry no `why`: writing one costs an AI
  // round trip, and putting that in the critical path of the dashboard
  // would make every page load wait on a model. The card's once-a-day
  // refresh fills the reasoning in. Until it does, the findings are already
  // on screen and already true.
  const initialInsights = buildBoardSignals({
    atRisk,
    staleApprovals,
    lease: leaseSummary,
    residentQueues,
    kpis,
    triage,
  })
    .slice(0, MAX_INSIGHTS)
    .map((signal) => ({ ...signal, why: null }))

  const overdueAtRisk = atRisk.counts.cureDeadlinesElapsed
  const approvalsFailed = approvals.failed === true

  return (
    <div className="cq space-y-8">
      {/* ── Needs attention ─────────────────────────────────────────────
          Four counts, each a decision waiting on the board, each linking
          to where it is acted on. A failed source shows "—" and says so. */}
      <section aria-labelledby="attention-heading" className="space-y-3">
        <h2 id="attention-heading" className="sr-only">
          Needs your attention
        </h2>
        <div className="grid grid-cols-2 gap-3 cq-sm:gap-4 cq-md:grid-cols-4">
          <Kpi
            label="Approvals"
            icon={<ClipboardCheck />}
            value={approvals.totalCount.toLocaleString()}
            hint={approvals.totalCount === 0 ? 'Inbox zero' : 'waiting on you'}
            href="#approvals"
            linkAs={Link}
            state={approvalsFailed && approvals.totalCount === 0 ? 'failed' : 'ready'}
          />
          <Kpi
            label="At risk this week"
            icon={<AlertTriangle />}
            value={atRisk.totalCount.toLocaleString()}
            hint={
              atRisk.totalCount === 0
                ? 'All on track'
                : overdueAtRisk > 0
                  ? `${overdueAtRisk} cure ${overdueAtRisk === 1 ? 'deadline' : 'deadlines'} passed`
                  : 'deadlines this week'
            }
            href="#at-risk"
            linkAs={Link}
            state={atRisk.failed ? 'failed' : 'ready'}
          />
          <Kpi
            label="Mail to answer"
            icon={<Mail />}
            value={triage.needsReply.count.toLocaleString()}
            hint={
              triage.needsReply.oldestWaitingDays != null && triage.needsReply.count > 0
                ? `oldest ${triage.needsReply.oldestWaitingDays}d`
                : 'all replied'
            }
            href="/inbox"
            linkAs={Link}
            state={triage.failed ? 'failed' : 'ready'}
          />
          <Kpi
            label="Dues overdue"
            icon={<Wallet />}
            value={usd(kpis.duesOutstandingUsd.value)}
            delta={kpiDelta(kpis.duesOutstandingUsd.value, kpis.duesOutstandingUsd.previous, true)}
            href="/dues"
            linkAs={Link}
            state={kpis.failed ? 'failed' : 'ready'}
          />
        </div>
      </section>

      {/* ── Today ──────────────────────────────────────────────────────
          Work queue on the left, calendar + mail + leasing on the right. */}
      <div className="grid gap-6 cq-lg:grid-cols-3">
        <div className="min-w-0 space-y-6 cq-lg:col-span-2">
          {/* The bullets deliberately never restate a tile; they carry what
              CHANGED, which a tile structurally cannot show. */}
          <DailyDigestCard
            initialSuggestion={digest.content}
            initialBullets={bullets}
            initialInsights={initialInsights}
            initialGeneratedAt={digest.generatedAt}
          />
          <ApprovalsInbox items={approvals.items} failed={approvalsFailed} />
          <AtRiskThisWeek items={atRisk.items} totalCount={atRisk.totalCount} failed={atRisk.failed} />
        </div>
        <div className="min-w-0 space-y-6">
          <NextMeeting meeting={nextMeeting.meeting} failed={nextMeeting.failed} />
          <MailTriageCard snapshot={triage} />
          <LeaseSummaryCard summary={leaseSummary} />
        </div>
      </div>

      {/* ── Community health ───────────────────────────────────────────
          Reference numbers and trends: below the fold on purpose, so they
          never compete with today's work above. */}
      <section aria-labelledby="health-heading" className="space-y-4">
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-6">
          <h2 id="health-heading" className="text-lg font-semibold text-foreground">
            Community health
          </h2>
          <span className="text-xs text-muted">Changes vs 30 days ago</span>
        </div>
        <div className="grid grid-cols-2 gap-3 cq-sm:gap-4 cq-md:grid-cols-4">
          <Kpi
            label="Open violations"
            value={kpis.openViolations.value.toLocaleString()}
            delta={kpiDelta(kpis.openViolations.value, kpis.openViolations.previous, true)}
            href="/violations"
            linkAs={Link}
            state={kpis.failed ? 'failed' : 'ready'}
          />
          <Kpi
            label="Open tickets"
            value={kpis.openTickets.value.toLocaleString()}
            delta={kpiDelta(kpis.openTickets.value, kpis.openTickets.previous, true)}
            href="/tickets"
            linkAs={Link}
            state={kpis.failed ? 'failed' : 'ready'}
          />
          <Kpi
            label="Properties"
            value={community.propertyCount.toLocaleString()}
            hint={
              community.propertyCount === 0
                ? 'none on file yet'
                : `${community.residentCount.toLocaleString()} ${
                    community.residentCount === 1 ? 'resident' : 'residents'
                  } in residence`
            }
            href="/properties"
            linkAs={Link}
            state={community.failed ? 'failed' : 'ready'}
          />
          {/* Same figure the /leases page headlines — leasedPct off
              getLeaseSummary — so the dashboard and the lease section can
              never disagree. "Leased", not "Occupancy": 16% leased means
              84% owner-occupied, not 84% empty. */}
          <Kpi
            label="Leased"
            value={
              !leaseSummary.hasAssociation || leaseSummary.totalUnits === 0
                ? '—'
                : `${Math.round(leaseSummary.leasedPct)}%`
            }
            hint={
              !leaseSummary.hasAssociation
                ? 'no association set up'
                : leaseSummary.totalUnits === 0
                  ? 'no units on file'
                  : `${leaseSummary.leasedCount} of ${leaseSummary.totalUnits} units`
            }
            href="/leases"
            linkAs={Link}
            state={leaseSummary.failed ? 'failed' : 'ready'}
          />
        </div>
        <div className="grid gap-4 cq-md:grid-cols-3">
          <BreakdownList
            title="Violations by status"
            segments={violationsDonut.segments}
            total={violationsDonut.total}
            failed={violationsDonut.failed}
            href="/violations"
            hrefLabel="View all"
            emptyTitle="No violations on file"
            emptyDescription="When violations are reported, the status breakdown shows here."
          />
          <BreakdownList
            title="Tickets by category"
            segments={ticketCategoryDonut.segments}
            total={ticketCategoryDonut.total}
            failed={ticketCategoryDonut.failed}
            href="/tickets"
            hrefLabel="View all"
            emptyTitle="No tickets yet"
            emptyDescription="When residents submit tickets, the category breakdown shows here."
          />
          <ActivityTrend buckets={activity.buckets} failed={activity.failed} />
        </div>
        <ComplianceHeatMap cells={heatMap.cells} failed={heatMap.failed} today={heatMap.today} />
      </section>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="cq space-y-8" aria-busy="true">
      <span className="sr-only">Loading your dashboard</span>
      <div className="grid grid-cols-2 gap-3 cq-sm:gap-4 cq-md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 cq-lg:grid-cols-3">
        <div className="min-w-0 space-y-6 cq-lg:col-span-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-28 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
