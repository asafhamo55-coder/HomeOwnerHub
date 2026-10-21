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
import { getCurrentOrg, getSignedInUser } from '@/lib/orgs'
// EMERGENCY ROLLBACK (v2 — second attempt) 2026-05-25: cached layer
// broke prod AGAIN at runtime with reference 2236965075. Both the
// dynamic factory pattern (v1) and the canonical module-scoped pattern
// (v2) fail. Not pushing a v3 without a real Vercel-environment repro.
// Reverting to cookie-bound fetchers — they're slower but they work.
// (lib/dashboard/loaders.ts is NOT that layer: it is React's per-request
// cache() over the same cookie-bound fetchers, plus timing — BL-099.)
import * as load from '@/lib/dashboard/loaders'
import { buildBoardSignals } from '@/lib/dashboard/board-signals'
import { MAX_INSIGHTS } from '@homeowner-portal/ai'
import { kpiDelta } from '@/lib/dashboard/kpi-delta'
import { loadSetupChecklist, setupDismissedCookie } from '@/lib/dashboard/setup-checklist'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { timed } from '@/lib/perf/timing'
import { buildBullets, formatNextMeeting } from '@/lib/dashboard/digest-facts'
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
import { UnassignedHomesNotice } from '@/components/properties/UnassignedHomesNotice'
import { BoardFirstWeek } from '@/components/guide/FirstWeekGate'
import { MyTasksCard } from '@/components/dashboard/MyTasksCard'
import { loadMyTaskCounts } from '@/lib/tasks/queries'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import { ReserveSnapshotCard } from '@/components/dashboard/ReserveSnapshotCard'
import { loadReserveSnapshot, reserveDisclosureHint } from '@/lib/accounting/reserves'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { ComplianceDeadlinesCard } from '@/components/dashboard/ComplianceDeadlinesCard'
import { complianceAckSecret, pendingComplianceItems } from '@/lib/compliance/deadlines'
import { loadComplianceDoneAndMigrate } from '@/lib/compliance/done'
import { getCurrentUserRole } from '@/lib/auth'
import { plural } from '@/lib/money/format'

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
  // Memoized: getCurrentOrg above already resolved the user. Only the two
  // single-row reads the header needs are awaited here; the setup
  // checklist (several counts) streams in below (BL-099).
  const user = await getSignedInUser()
  const [profile, cookieStore, orgRow] = await Promise.all([
    user
      ? timed('/', 'dashboard.profile', () =>
          loadOrFail(
            'profile name',
            supabase
              .from('profiles')
              .select('full_name')
              .eq('id', user.id)
              .maybeSingle<{ full_name: string | null }>(),
          ),
        )
      : Promise.resolve(null),
    cookies(),
    // The org's age decides the "Your first week" card. A failed read just
    // leaves the card off; logged by loadOrFail.
    timed('/', 'dashboard.orgCreated', () =>
      loadOrFail(
        'org created date',
        supabase.from('orgs').select('created_at').eq('id', org.id).maybeSingle<{ created_at: string | null }>(),
      ),
    ),
  ])
  // A failed name lookup only costs the greeting its name; the email
  // prefix below is a fine stand-in. Logged by loadOrFail either way.
  const profileRow = profile?.ok ? profile.data : null
  const fullName = profileRow?.full_name?.trim() || null
  const firstName = fullName ? fullName.split(/\s+/)[0] : null
  const userName =
    firstName ?? (user?.email ? user.email.split('@')[0] : null)

  // The dismiss cookie only counts while the checklist is still complete —
  // a step that regresses brings it back. Read now (it is instant) so the
  // checklist's placeholder matches what will most likely render: a card
  // when it has not been dismissed, nothing when it has.
  const dismissed = cookieStore.get(setupDismissedCookie(org.id))?.value === '1'

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
      <Suspense fallback={dismissed ? null : <CardSkeleton body="h-24" />}>
        <SetupChecklistSection orgId={org.id} dismissed={dismissed} />
      </Suspense>
      {/* BL-125: homes with no association are never billed. Hidden when there are none. */}
      <Suspense fallback={null}>
        <UnassignedHomesNotice orgId={org.id} />
      </Suspense>
      <BoardFirstWeek orgId={org.id} orgCreatedAt={orgRow.ok ? (orgRow.data?.created_at ?? null) : null} />

      <DashboardSections orgId={org.id} />
    </Page>
  )
}

async function SetupChecklistSection({ orgId, dismissed }: { orgId: string; dismissed: boolean }) {
  const supabase = await getSupabaseServerClient()
  // Each step's read fails on its own ("Couldn't check"), so this never
  // takes the dashboard down.
  const checklist = await timed('/', 'dashboard.setupChecklist', () => loadSetupChecklist(supabase, orgId))
  if (checklist.complete && dismissed) return null
  return <SetupChecklistCard checklist={checklist} />
}

// ── Streamed sections (BL-099) ─────────────────────────────────────────
// Each card is its own async component under its own <Suspense>, so a
// card paints the moment its own reads are in. Before, one boundary
// awaited all fifteen sources and the slowest one decided when the board
// saw anything. Sources shared between cards are memoized per request
// (lib/dashboard/loaders.ts), so this is still one read per source.

function DashboardSections({ orgId }: { orgId: string }) {
  return (
    <div className="cq space-y-8">
      {/* BL-131: statutory deadlines for the board's state (GA registration,
          TX management certificate). Nothing renders when none apply. */}
      <Suspense fallback={null}>
        <ComplianceDeadlinesSection orgId={orgId} />
      </Suspense>

      {/* ── Needs attention ─────────────────────────────────────────────
          Four counts, each a decision waiting on the board, each linking
          to where it is acted on. A failed source shows "—" and says so. */}
      <section aria-labelledby="attention-heading" className="space-y-3">
        <h2 id="attention-heading" className="sr-only">
          Needs your attention
        </h2>
        <div className="grid grid-cols-2 gap-3 cq-sm:gap-4 cq-md:grid-cols-4">
          <Suspense fallback={<Kpi label="Approvals" icon={<ClipboardCheck />} state="loading" />}>
            <ApprovalsKpi orgId={orgId} />
          </Suspense>
          <Suspense fallback={<Kpi label="At risk this week" icon={<AlertTriangle />} state="loading" />}>
            <AtRiskKpi orgId={orgId} />
          </Suspense>
          <Suspense fallback={<Kpi label="Mail to answer" icon={<Mail />} state="loading" />}>
            <MailKpi orgId={orgId} />
          </Suspense>
          <Suspense fallback={<Kpi label="Dues overdue" icon={<Wallet />} state="loading" />}>
            <DuesKpi orgId={orgId} />
          </Suspense>
        </div>
      </section>

      {/* ── Today ──────────────────────────────────────────────────────
          Work queue on the left, calendar + mail + leasing on the right. */}
      <div className="grid gap-6 cq-lg:grid-cols-3">
        <div className="min-w-0 space-y-6 cq-lg:col-span-2">
          <Suspense fallback={<CardSkeleton body="h-28" />}>
            <DigestSection orgId={orgId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton body="h-28" />}>
            <ApprovalsSection orgId={orgId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton body="h-28" />}>
            <AtRiskSection orgId={orgId} />
          </Suspense>
        </div>
        <div className="min-w-0 space-y-6">
          <Suspense fallback={<CardSkeleton body="h-16" />}>
            <MyTasksSection orgId={orgId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton body="h-16" />}>
            <NextMeetingSection orgId={orgId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton body="h-16" />}>
            <MailTriageSection orgId={orgId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton body="h-16" />}>
            <LeaseSection orgId={orgId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton body="h-16" />}>
            <ReservesSection />
          </Suspense>
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
          <Suspense
            fallback={
              <>
                <Kpi label="Open violations" state="loading" />
                <Kpi label="Open tickets" state="loading" />
              </>
            }
          >
            <OpenWorkKpis orgId={orgId} />
          </Suspense>
          <Suspense fallback={<Kpi label="Properties" state="loading" />}>
            <PropertiesKpi orgId={orgId} />
          </Suspense>
          <Suspense fallback={<Kpi label="Leased" state="loading" />}>
            <LeasedKpi orgId={orgId} />
          </Suspense>
        </div>
        <div className="grid gap-4 cq-md:grid-cols-3">
          <Suspense fallback={<CardSkeleton body="h-24" />}>
            <ViolationBreakdown orgId={orgId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton body="h-24" />}>
            <TicketBreakdown orgId={orgId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton body="h-24" />}>
            <ActivitySection orgId={orgId} />
          </Suspense>
        </div>
        <Suspense fallback={<CardSkeleton body="h-40" />}>
          <HeatMapSection orgId={orgId} />
        </Suspense>
      </section>
    </div>
  )
}

async function ApprovalsKpi({ orgId }: { orgId: string }) {
  const approvals = await load.approvalsInbox(orgId)
  return (
    <Kpi
      label="Approvals"
      icon={<ClipboardCheck />}
      value={approvals.totalCount.toLocaleString()}
      hint={approvals.totalCount === 0 ? 'Inbox zero' : 'waiting on you'}
      href="#approvals"
      linkAs={Link}
      state={approvals.failed === true && approvals.totalCount === 0 ? 'failed' : 'ready'}
    />
  )
}

async function AtRiskKpi({ orgId }: { orgId: string }) {
  const atRisk = await load.atRiskThisWeek(orgId)
  const overdueAtRisk = atRisk.counts.cureDeadlinesElapsed
  return (
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
  )
}

async function MailKpi({ orgId }: { orgId: string }) {
  const triage = await load.triageSnapshot(orgId)
  return (
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
  )
}

async function DuesKpi({ orgId }: { orgId: string }) {
  const kpis = await load.dashboardKpis(orgId)
  return (
    <Kpi
      label="Dues overdue"
      icon={<Wallet />}
      value={usd(kpis.duesOutstandingUsd.value)}
      delta={kpiDelta(kpis.duesOutstandingUsd.value, kpis.duesOutstandingUsd.previous, true)}
      href="/dues"
      linkAs={Link}
      state={kpis.failed ? 'failed' : 'ready'}
    />
  )
}

async function DigestSection({ orgId }: { orgId: string }) {
  const [kpis, atRisk, nextMeeting, leaseSummary, digest, triage, residentQueues, staleApprovals, newSinceBaseline] =
    await Promise.all([
      load.dashboardKpis(orgId),
      load.atRiskThisWeek(orgId),
      load.nextMeeting(orgId),
      load.leaseSummary(orgId),
      load.latestDigest(orgId),
      load.triageSnapshot(orgId),
      load.residentQueueCounts(orgId),
      load.staleApprovalCount(orgId),
      load.newSinceBaseline(orgId),
    ])

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

  // The bullets deliberately never restate a tile; they carry what
  // CHANGED, which a tile structurally cannot show.
  return (
    <DailyDigestCard
      initialSuggestion={digest.content}
      initialBullets={bullets}
      initialInsights={initialInsights}
      initialGeneratedAt={digest.generatedAt}
    />
  )
}

async function ApprovalsSection({ orgId }: { orgId: string }) {
  const approvals = await load.approvalsInbox(orgId)
  return <ApprovalsInbox items={approvals.items} failed={approvals.failed === true} />
}

async function AtRiskSection({ orgId }: { orgId: string }) {
  const atRisk = await load.atRiskThisWeek(orgId)
  return <AtRiskThisWeek items={atRisk.items} totalCount={atRisk.totalCount} failed={atRisk.failed} />
}

// BL-119: the signed-in member's own tasks, against the association's today.
async function MyTasksSection({ orgId }: { orgId: string }) {
  const [supabase, user, timeZone] = await Promise.all([getSupabaseServerClient(), getSignedInUser(), currentTimeZone()])
  if (!user) return null
  const counts = await timed('/', 'dashboard.myTasks', () =>
    loadMyTaskCounts(supabase, orgId, user.id, todayIn(timeZone)),
  )
  return <MyTasksCard counts={counts} />
}

async function NextMeetingSection({ orgId }: { orgId: string }) {
  const nextMeeting = await load.nextMeeting(orgId)
  return <NextMeeting meeting={nextMeeting.meeting} failed={nextMeeting.failed} />
}

async function MailTriageSection({ orgId }: { orgId: string }) {
  return <MailTriageCard snapshot={await load.triageSnapshot(orgId)} />
}

async function LeaseSection({ orgId }: { orgId: string }) {
  return <LeaseSummaryCard summary={await load.leaseSummary(orgId)} />
}

// BL-120: the primary association's reserve fund as of its today. No
// association yet: no card (the setup checklist covers that).
async function ReservesSection() {
  const assoc = await getPrimaryAssociationResult()
  if (!assoc.ok) return <ReserveSnapshotCard result={null} />
  if (!assoc.data) return null
  const { id, timeZone } = assoc.data
  const supabase = await getSupabaseServerClient()
  const res = await timed('/', 'dashboard.reserves', () =>
    tryLoad('reserve snapshot', () => loadReserveSnapshot(supabase, id, todayIn(timeZone))),
  )
  if (!res.ok) return <ReserveSnapshotCard result={null} />
  const { result, state } = res.data
  return <ReserveSnapshotCard result={result} hint={result.kind === 'ready' ? reserveDisclosureHint(state) : null} />
}

// BL-131: deadlines that apply to the org's associations by state and that
// no board member has marked done (signed acknowledgment, or a
// compliance_deadlines_done row once M3_APPLIED). Board/admin only,
// re-checked here although the layout already sends residents away.
async function ComplianceDeadlinesSection({ orgId }: { orgId: string }) {
  const ctx = await getCurrentUserRole()
  if (!ctx || (ctx.role !== 'board' && ctx.role !== 'admin')) return null
  const [supabase, timeZone] = await Promise.all([getSupabaseServerClient(), currentTimeZone()])
  const res = await timed('/', 'dashboard.complianceDeadlines', () =>
    loadOrFail(
      'compliance deadlines',
      supabase
        .from('associations')
        .select('id, name, state, governing_law_state, compliance_settings')
        .eq('organization_id', orgId),
    ),
  )
  if (!res.ok) return <ComplianceDeadlinesCard items={null} />
  const rows = (res.data ?? []) as Array<{
    id: string
    name: string
    state: string | null
    governing_law_state: string | null
    compliance_settings: unknown
  }>
  const associations = rows.map((r) => ({
    id: r.id,
    name: r.name,
    state: r.state,
    governingLawState: r.governing_law_state,
    complianceSettings: r.compliance_settings,
  }))
  const secret = complianceAckSecret()
  // M3_APPLIED (0067): also the compliance_deadlines_done rows, copying any
  // signed acknowledgment that has no row yet. Null (flag off or a failed
  // read): the signed acknowledgments alone.
  const done = await loadComplianceDoneAndMigrate(supabase, orgId, associations, secret)
  const items = pendingComplianceItems(associations, todayIn(timeZone), secret, done)
  return <ComplianceDeadlinesCard items={items} multipleAssociations={rows.length > 1} />
}

async function OpenWorkKpis({ orgId }: { orgId: string }) {
  const kpis = await load.dashboardKpis(orgId)
  return (
    <>
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
    </>
  )
}

async function PropertiesKpi({ orgId }: { orgId: string }) {
  const community = await load.communitySnapshot(orgId)
  return (
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
  )
}

// Same figure the /leases page headlines — leasedPct off getLeaseSummary —
// so the dashboard and the lease section can never disagree. "Leased",
// not "Occupancy": 16% leased means 84% owner-occupied, not 84% empty.
async function LeasedKpi({ orgId }: { orgId: string }) {
  const leaseSummary = await load.leaseSummary(orgId)
  return (
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
            : `${leaseSummary.leasedCount} of ${plural(leaseSummary.totalUnits, 'unit')}`
      }
      href="/leases"
      linkAs={Link}
      state={leaseSummary.failed ? 'failed' : 'ready'}
    />
  )
}

async function ViolationBreakdown({ orgId }: { orgId: string }) {
  const donut = await load.violationDonut(orgId)
  return (
    <BreakdownList
      title="Violations by status"
      segments={donut.segments}
      total={donut.total}
      failed={donut.failed}
      href="/violations"
      hrefLabel="View all"
      emptyTitle="No violations on file"
      emptyDescription="When violations are reported, the status breakdown shows here."
    />
  )
}

async function TicketBreakdown({ orgId }: { orgId: string }) {
  const donut = await load.ticketDonut(orgId)
  return (
    <BreakdownList
      title="Tickets by category"
      segments={donut.segments}
      total={donut.total}
      failed={donut.failed}
      href="/tickets"
      hrefLabel="View all"
      emptyTitle="No tickets yet"
      emptyDescription="When residents submit tickets, the category breakdown shows here."
    />
  )
}

async function ActivitySection({ orgId }: { orgId: string }) {
  const activity = await load.thirtyDayActivity(orgId)
  return <ActivityTrend buckets={activity.buckets} failed={activity.failed} />
}

async function HeatMapSection({ orgId }: { orgId: string }) {
  const heatMap = await load.complianceHeatMap(orgId)
  return <ComplianceHeatMap cells={heatMap.cells} failed={heatMap.failed} today={heatMap.today} />
}

/** One card's placeholder: a title bar and a body block of the card's height. */
function CardSkeleton({ body }: { body: string }) {
  return (
    <Card aria-busy="true">
      <span className="sr-only">Loading</span>
      <CardContent className="space-y-4 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className={`${body} w-full`} />
      </CardContent>
    </Card>
  )
}
