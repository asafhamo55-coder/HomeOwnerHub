import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  FileText,
  History,
  Home,
  KeyRound,
  Mail,
  Plus,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatDay } from '@/lib/money/format'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  KeyValue,
  KeyValueList,
  LoadFailed,
  Pager,
  StatusBadge,
  StatusPill,
  Timeline,
  pageRange,
  parsePageParam,
  type TimelineItem,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPropertyDetail, type PropertyTenure } from '@/lib/properties'
import { resolvePropertyUrl } from '@/lib/properties/canonical'
import { propertyHref } from '@/lib/properties/href'
import { resolveUnitForProperty, type UnitId } from '@/lib/properties/resolve'
import { parsePropertyListParams, propertyListQuery } from '@/lib/properties/list-params'
import { getLeaseCap, getOpenWaitingListEntries } from '@/lib/leases'
import { getPrimaryAssociation } from '@/lib/vendors'
import { DEFAULT_ASSOCIATION_TIME_ZONE, todayIn } from '@/lib/association-time'
import { getCurrentUserRole } from '@/lib/auth'
import {
  listThreadsForUnit,
  type CorrespondenceThreadSummary,
} from '@/lib/inbox/queries'
import { formatShortDate } from '@/lib/format-datetime'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { INBOX_THREAD_STATUS, TENURE, VIOLATION_SEVERITY, VIOLATION_STATUS } from '@/lib/status/community'
import type { PropertyResidentRow, PropertyResidentRole } from '@/lib/property-residents'
import type { PropertyEventRow, PropertyEventKind } from '@/lib/property-events'
import { SplitPaneFrame, SplitPaneHeader } from '@/components/split-pane/SplitPane'
import { PropertyList } from '../PropertyList'
import { PropertyListFilters } from '../PropertyListFilters'
import { PropertyListPager } from '../PropertyListPager'
import { PropertiesHeader } from '../PropertiesHeader'
import { loadPropertyListPane } from '../load-list-pane'
import {
  resolveCorrespondenceState,
  type CorrespondenceSectionState,
} from './correspondence-state'
import { PropertyPanel, parsePanelTab, type PanelStats } from './PropertyPanel'
import { CollectionsSection } from './CollectionsSection'
import {
  getOpenCaseForUnit,
  listCasesForUnit,
  listEventsForCase,
} from '@/lib/collections/queries'
import { TenureSelector } from './TenureSelector'
import { AddResidentForm } from './AddResidentForm'
import { PropertyActions } from './PropertyActions'
import { ResidentRow as ResidentRowClient } from './ResidentRow'
import { EnterPortalButton } from './EnterPortalButton'
import { ContactLink } from '@/components/contact/ContactLink'
import { readAllResult } from '@/lib/supabase/read-all'
import { cureBy, cureState, sortByUrgency } from '@/lib/violation-cure'

interface PropertyDetailRow {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  notes: string | null
  created_at: string | null
  tenure: PropertyTenure
  tenure_updated_at: string | null
  tenure_updated_by: string | null
}

interface ViolationRow {
  id: string
  description: string
  status: string
  severity: string | null
  created_at: string | null
  cure_period_days: number | null
  notice_sent_at: string | null
}

interface AssessmentRow {
  id: string
  due_date: string
  amount: number
  status: string
  assessment_type: string
  fiscal_period: { start_date: string } | null
  payments: { amount: number }[]
}

// Same view the list pane reads (migration 0039), queried here for the one
// property so the panel's stat strip carries exactly the numbers the row in
// the aside was ranked by. Cast because the view postdates the last
// `supabase gen types` pass.
const LIST_VIEW = 'hoa_property_list_v'

/** Rows per page in the Violations and Dues tabs (they used to stop silently at 20 / 12). */
const TAB_PAGE_SIZE = 20

interface PanelStatsRow {
  balance: number | string | null
  days_overdue: number | null
  open_violations: number | null
  violations_past_cure: number | null
  threads_needing_reply: number | null
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    tab?: string
    filter?: string
    sort?: string
    q?: string
    page?: string
    /** Page within the open tab (Violations / Dues). `page` belongs to the list pane. */
    tp?: string
  }>
}) {
  const { id: rawId } = await params
  const sp = await searchParams
  const tab = parsePanelTab(sp.tab)
  const tabPage = parsePageParam(sp.tp)
  const listParams = parsePropertyListParams(sp)
  const supabase = await getSupabaseServerClient()

  // Only admins get the "Enter portal" impersonation control.
  const ctx = await getCurrentUserRole()
  const isAdmin = ctx?.role === 'admin'
  if (!ctx) notFound()

  // The segment may be a property id or a unit id (a unit-keyed screen
  // linked here); a unit id redirects to its property's canonical URL.
  const incoming = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
  const target = await resolvePropertyUrl(supabase, ctx.org.id, rawId, incoming)
  if (target.kind === 'redirect') redirect(target.href)
  if (target.kind === 'not_found') notFound()
  const id = target.propertyId

  const detail = await getPropertyDetail(id)
  if (!detail) notFound()
  const p = detail.property as unknown as PropertyDetailRow
  const tenure: PropertyTenure = detail.property.tenure
  const residents = detail.residents
  const events = detail.events

  // Lease cap drives whether the "Add to waiting list" button shows up
  // on owner-occupied properties. No cap → no need to queue anything.
  const assoc = await getPrimaryAssociation()
  const cap = assoc ? await getLeaseCap(assoc.id) : null
  const capInPlace = cap?.capPct !== null && cap?.capPct !== undefined

  // Whether this property is already queued to lease. Drives the Tenure
  // card's badge and suppresses a second "Add to waiting list" button
  // that the action would only reject as a duplicate.
  const openWaitingEntry = (await getOpenWaitingListEntries([id])).get(id) ?? null

  // The unit this property means (lib/properties/resolve.ts: one rule,
  // shared with the list view). Assessments, mail and collections are keyed
  // on units. A failed read is NOT "no unit": the unit-keyed sections say
  // they could not load instead of "not linked". Several linked units are
  // not a failure either: the canonical one is used and the page says so.
  const unitRes = await tryLoad('property unit', () => resolveUnitForProperty(supabase, ctx.org.id, id))
  const unitFailed = !unitRes.ok
  const unitId: UnitId | null = unitRes.ok ? unitRes.data.unitId : null
  const linkedUnitCount = unitRes.ok ? unitRes.data.unitCount : 0

  // Violations and dues are paged within their own tab (`tp`). On the other
  // tabs only the first page is read, for the counts on the overview.
  const violationsRange = pageRange(tab === 'violations' ? tabPage : 1, TAB_PAGE_SIZE)
  const duesRange = pageRange(tab === 'dues' ? tabPage : 1, TAB_PAGE_SIZE)

  const [violationsRes, assessmentsRes, correspondenceOutcome, statsRes, arcRes] = await Promise.all([
    // Every violation at this home (a handful, paged past the row cap), so
    // the tab can sort by urgency — past cure first — before paging.
    loadOrFail(
      'property violations',
      readAllResult<ViolationRow>((from, to) =>
        supabase
          .from('hoa_violations')
          .select('id, description, status, severity, created_at, cure_period_days, notice_sent_at')
          .eq('property_id', id)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: ViolationRow[] | null; error: { message?: string } | null }>,
      ),
    ),
    unitId
      ? loadOrFail(
          'property dues',
          supabase
            .from('assessments')
            .select(
              'id, due_date, amount, status, assessment_type, fiscal_period:fiscal_period_id(start_date), payments(amount)',
              { count: 'exact' },
            )
            .eq('unit_id', unitId)
            .is('deleted_at', null)
            .order('due_date', { ascending: false })
            .range(duesRange.from, duesRange.to),
        )
      : Promise.resolve(unitFailed ? ({ ok: false } as const) : ({ ok: true, data: [], count: 0 } as const)),
    // unitId null means this property has no bridged unit row — correspondence
    // cannot be linked to it at all, which the Mail tab renders as a distinct
    // state from "linked, but zero threads" AND from "linked, but the read
    // failed". `listThreadsForUnit` throws on failure; allSettled keeps that
    // one section's failure from taking down the other tabs.
    unitId && ctx
      ? Promise.allSettled([listThreadsForUnit(supabase, ctx.org.id, unitId)]).then(([result]) => result)
      : Promise.resolve(null),
    // Stat-strip numbers. A failure shows "Couldn't load" in the tiles — it
    // used to show zeros, which read as "nothing owed".
    ctx
      ? loadOrFail(
          'property stats',
          supabase
            .from(LIST_VIEW as never)
            .select('balance, days_overdue, open_violations, violations_past_cure, threads_needing_reply')
            .eq('id' as never, id)
            .eq('org_id' as never, ctx.org.id)
            .maybeSingle<PanelStatsRow>(),
        )
      : Promise.resolve({ ok: true, data: null, count: null } as const),
    // Open ARC applications on this home's unit — a head-only count.
    // Same "open" as the dashboard queue: submitted or in review.
    unitId
      ? loadOrFail(
          'property open ARC',
          supabase
            .from('arc_requests')
            .select('id', { count: 'exact', head: true })
            .eq('unit_id', unitId)
            .is('deleted_at', null)
            .in('status', ['submitted', 'in_review']),
        )
      : Promise.resolve(null),
  ])

  const allViolations = violationsRes.ok ? sortByUrgency((violationsRes.data ?? []) as ViolationRow[], new Date()) : []
  const violations = allViolations.slice(violationsRange.from, violationsRange.to + 1)
  const violationTotal = violationsRes.ok ? allViolations.length : null
  const dues = assessmentsRes.ok ? ((assessmentsRes.data ?? []) as unknown as AssessmentRow[]) : []
  const duesTotal = assessmentsRes.ok ? (assessmentsRes.count ?? dues.length) : null

  if (correspondenceOutcome?.status === 'rejected') {
    const reason = correspondenceOutcome.reason
    // Logged where this page chose to degrade, message only (no subject or
    // address ever reaches this Error).
    console.error('PropertyDetailPage: correspondence read failed', {
      message: reason instanceof Error ? reason.message : String(reason),
    })
  }
  const correspondenceState: CorrespondenceSectionState = unitFailed
    ? { kind: 'error' }
    : resolveCorrespondenceState(unitId, correspondenceOutcome)

  // Collections. Read only when the tab is open. A failure is reported and
  // shown as a failure, never as "no case".
  let collections:
    | { ok: true; openCase: Awaited<ReturnType<typeof getOpenCaseForUnit>>; events: Awaited<ReturnType<typeof listEventsForCase>>; closed: Awaited<ReturnType<typeof listCasesForUnit>> }
    | { ok: false }
    | null = null
  if (tab === 'collections' && unitId) {
    const loaded = await tryLoad('property collections', async () => {
      const all = await listCasesForUnit(supabase, unitId)
      const openCase = all.find((c) => c.status !== 'resolved' && c.status !== 'written_off') ?? null
      const closed = all.filter((c) => c.id !== openCase?.id)
      const caseEvents = openCase ? await listEventsForCase(supabase, openCase.id) : []
      return { openCase, events: caseEvents, closed }
    })
    collections = loaded.ok ? { ok: true, ...loaded.data } : { ok: false }
  }

  const statsRow = statsRes.ok ? statsRes.data : null
  const stats: PanelStats | null = statsRes.ok
    ? {
        balance: Number(statsRow?.balance ?? 0),
        daysOverdue: Number(statsRow?.days_overdue ?? 0),
        openViolations: Number(statsRow?.open_violations ?? 0),
        violationsPastCure: Number(statsRow?.violations_past_cure ?? 0),
        residents: residents.length,
        threadsNeedingReply: Number(statsRow?.threads_needing_reply ?? 0),
        openArc: unitFailed ? null : !unitId ? 'unlinked' : arcRes?.ok ? (arcRes.count ?? 0) : null,
      }
    : null

  // The list beside the panel, read the same way /properties reads it: a
  // failure narrows the page to the panel, and a failed count shows no
  // number rather than a 0.
  const pane = ctx ? await loadPropertyListPane(supabase, ctx.org.id, listParams) : null
  const list = pane?.list ?? null
  const counts = pane?.counts ?? null

  // The list state this property was opened from, carried on every tab link
  // and on the phone breadcrumb so filter/sort/search/page survive.
  const query = propertyListQuery(listParams)
  const listQuery = new URLSearchParams(query)
  const listHref = query ? `/properties?${query}` : '/properties'
  const tabHref = (t: string, extra?: Record<string, string>) =>
    propertyHref(id, { query: { ...Object.fromEntries(listQuery), tab: t, ...extra } })

  return (
    <SplitPaneFrame>
      {/* Same strip /properties renders, so Export and Add property don't
          disappear the moment a property is opened on desktop. */}
      <SplitPaneHeader className="hidden lg:block">
        <PropertiesHeader
          orgName={ctx?.org.name ?? ''}
          filter={listParams.filter}
          total={list?.ok ? list.data.total : null}
          allCount={pane?.allCount ?? null}
          search={listParams.search}
          searchMatches={pane?.searchMatches ?? null}
          onDetailRoute
        />
      </SplitPaneHeader>

      <div className="flex min-h-0 flex-1">
        {/* Mirrors /properties exactly (same widths) so the list doesn't jump
            when a property opens; hidden below lg, where the panel is the page. */}
        <aside
          aria-label="Property list"
          className="hidden shrink-0 flex-col overflow-y-auto border-r border-border bg-surface lg:flex lg:w-[24rem] xl:w-[28rem] 2xl:w-[32rem]"
        >
          <PropertyListFilters params={listParams} counts={counts} />
          {!list || !list.ok ? (
            <LoadFailed what="properties" className="m-3" />
          ) : (
            <>
              <PropertyList rows={list.data.rows} selectedId={id} params={listParams} allMatches={counts?.all ?? null} />
              <PropertyListPager params={listParams} rowCount={list.data.rows.length} total={list.data.total} />
            </>
          )}
        </aside>

        <section aria-label="Property" className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <PropertyPanel
            propertyId={id}
            address={p.address}
            unitNumber={p.unit_number}
            ownerName={p.owner_name}
            ownerEmail={p.owner_email}
            ownerPhone={p.owner_phone}
            tenure={tenure}
            onWaitingList={openWaitingEntry !== null}
            stats={stats}
            currentTab={tab}
            query={query}
            listHref={listHref}
            linkHrefs={{
              // P0: propertyHref — these carry the hoa_properties id.
              dues: `/dues?property=${id}`,
              violations: tabHref('violations'),
              arc: '/arc',
              mail: tabHref('mail'),
            }}
            actions={
              <PropertyActions
                propertyId={p.id}
                address={p.address}
                balance={stats ? stats.balance : null}
                openViolations={stats ? stats.openViolations : null}
              />
            }
          >
            {linkedUnitCount > 1 ? (
              <Alert variant="warning" title={`${linkedUnitCount} unit records are linked to this property`}>
                Dues, mail and collections below come from the oldest one. Charges or mail filed under the others
                don’t show here until the duplicates are merged.
              </Alert>
            ) : null}
            {tab === 'overview' ? (
              <OverviewTab
                property={p}
                tenureUpdatedAt={detail.property.tenure_updated_at}
                tenure={tenure}
                capInPlace={capInPlace}
                waitingSince={openWaitingEntry?.requested_at ?? null}
                isAdmin={isAdmin}
                unitId={unitId}
                violationCount={violationTotal}
                duesCount={duesTotal}
                residents={residents}
                events={events}
                historyHref={tabHref('history')}
                residentsHref={tabHref('residents')}
              />
            ) : null}
            {tab === 'residents' ? (
              <ResidentsSection residents={residents} isAdmin={isAdmin} propertyId={p.id} unitId={unitId} />
            ) : null}
            {tab === 'mail' ? <CorrespondenceSection state={correspondenceState} /> : null}
            {tab === 'violations' ? (
              violationsRes.ok ? (
                <ViolationsSection
                  propertyId={id}
                  violations={violations}
                  pager={
                    <Pager
                      page={tabPage}
                      pageSize={TAB_PAGE_SIZE}
                      total={violationTotal ?? 0}
                      rowCount={violations.length}
                      hrefFor={(n) => tabHref('violations', { tp: String(n) })}
                      linkAs={Link}
                      noun="violations"
                    />
                  }
                />
              ) : (
                <LoadFailed what="this property’s violations" />
              )
            ) : null}
            {tab === 'dues' ? (
              assessmentsRes.ok ? (
                <DuesSection
                  propertyId={id}
                  dues={dues}
                  pager={
                    <Pager
                      page={tabPage}
                      pageSize={TAB_PAGE_SIZE}
                      total={duesTotal ?? 0}
                      rowCount={dues.length}
                      hrefFor={(n) => tabHref('dues', { tp: String(n) })}
                      linkAs={Link}
                      noun="assessments"
                    />
                  }
                />
              ) : (
                <LoadFailed what="this property’s dues" />
              )
            ) : null}
            {tab === 'collections' ? (
              unitFailed || collections?.ok === false ? (
                <LoadFailed what="the collections file" />
              ) : (
                <CollectionsSection
                  unitId={unitId}
                  openCase={collections?.ok ? collections.openCase : null}
                  events={collections?.ok ? collections.events : []}
                  closedCases={collections?.ok ? collections.closed : []}
                  today={todayIn(assoc?.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE)}
                />
              )
            ) : null}
            {tab === 'history' ? <HistorySection events={events} /> : null}
          </PropertyPanel>
        </section>
      </div>
    </SplitPaneFrame>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────

function OverviewTab({
  property: p,
  tenureUpdatedAt,
  tenure,
  capInPlace,
  waitingSince,
  isAdmin,
  unitId,
  violationCount,
  duesCount,
  residents,
  events,
  historyHref,
  residentsHref,
}: {
  property: PropertyDetailRow
  tenureUpdatedAt: string | null
  tenure: PropertyTenure
  capInPlace: boolean
  /** requested_at of this property's open waiting-list entry, or null. */
  waitingSince: string | null
  isAdmin: boolean
  unitId: string | null
  /** Null when the count could not be loaded. */
  violationCount: number | null
  duesCount: number | null
  residents: PropertyResidentRow[]
  events: PropertyEventRow[]
  historyHref: string
  residentsHref: string
}) {
  const recent = events.slice(0, 4)
  const active = residents.filter((r) => r.moved_out_at === null)
  const primary = active.find((r) => r.is_primary) ?? active[0] ?? null
  const plural = (n: number | null, one: string, many: string) =>
    n === null ? `${many} unavailable` : `${n} ${n === 1 ? one : many}`

  return (
    <div className="space-y-5">
      <div className="grid gap-5 2xl:grid-cols-5">
        <Card className="2xl:col-span-3">
          <CardHeader
            actions={
              isAdmin && p.owner_email ? (
                <EnterPortalButton
                  email={p.owner_email}
                  name={p.owner_name}
                  propertyId={p.id}
                  unitId={unitId}
                  variant="outline"
                />
              ) : null
            }
          >
            <CardTitle as="h2">Owner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <KeyValueList className="lg:grid-cols-4 2xl:grid-cols-2">
              <KeyValue label="Name" value={p.owner_name} />
              <KeyValue label="Email" value={p.owner_email ? <ContactLink kind="email" value={p.owner_email} /> : null} />
              <KeyValue label="Phone" value={p.owner_phone ? <ContactLink kind="phone" value={p.owner_phone} /> : null} />
              <KeyValue label="Added" value={p.created_at ? format(new Date(p.created_at), 'PP') : null} />
            </KeyValueList>
            {p.notes ? (
              <div className="rounded-lg bg-subtle px-3.5 py-2.5">
                <p className="text-xs font-medium text-muted">Notes</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground-secondary">{p.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="2xl:col-span-2">
          <CardHeader actions={<StatusBadge status={tenure} tones={TENURE.tones} labels={TENURE.labels} />}>
            <CardTitle as="h2">Tenure</CardTitle>
            <p className="text-xs text-muted">{tenureNote(tenure, tenureUpdatedAt)}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {waitingSince ? (
              <Alert variant="info" title="On the lease waiting list">
                Queued since {format(new Date(waitingSince), 'PP')}.{' '}
                {/* P0: propertyHref */}
                <Link href={`/leases?property=${p.id}`}>Approve or withdraw on Leases</Link>.
              </Alert>
            ) : null}
            <TenureSelector
              propertyId={p.id}
              currentTenure={tenure}
              capInPlace={capInPlace}
              alreadyWaiting={waitingSince !== null}
            />
            <p className="border-t border-border pt-3 text-xs text-muted">
              {plural(violationCount, 'violation', 'violations')} · {plural(duesCount, 'assessment', 'assessments')} on record
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href={residentsHref}>Manage</Link>
              </Button>
            }
          >
            <CardTitle as="h2">Residents</CardTitle>
          </CardHeader>
          <CardContent>
            {residents.length === 0 ? (
              <p className="text-sm text-muted">No residents on file.</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-foreground">
                  {active.length} {active.length === 1 ? 'person' : 'people'} living here
                  {residents.length !== active.length ? ` · ${residents.length - active.length} moved out` : ''}
                </p>
                {primary ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <span>
                      {primary.full_name} · {ROLE_LABEL[primary.role]}
                    </span>
                    {primary.email ? <ContactLink kind="email" value={primary.email} /> : null}
                    {primary.phone ? <ContactLink kind="phone" value={primary.phone} /> : null}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href={historyHref}>Full history</Link>
              </Button>
            }
          >
            <CardTitle as="h2">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">Nothing recorded yet.</p>
            ) : (
              <Timeline label="Recent activity" items={recent.map(eventItem)} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ResidentsSection({
  residents,
  isAdmin,
  propertyId,
  unitId,
}: {
  residents: PropertyResidentRow[]
  isAdmin: boolean
  propertyId: string
  unitId: string | null
}) {
  return (
    <section aria-label="Residents" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Residents</h2>
        <AddResidentForm propertyId={propertyId} />
      </div>
      {residents.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title="No residents on file"
          description="Add the owners, tenants, and family members living here so notices and outreach reach the right people."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {residents.map((r) => (
              <ResidentRowClient key={r.id} resident={r} isAdmin={isAdmin} propertyId={propertyId} unitId={unitId} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  )
}

function CorrespondenceSection({ state }: { state: CorrespondenceSectionState }) {
  return (
    <section aria-label="Mail" className="space-y-3">
      <SectionHeading
        title="Mail"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inbox">Open inbox</Link>
          </Button>
        }
      />
      {state.kind === 'unlinked' ? (
        <EmptyState
          icon={<Mail aria-hidden />}
          title="Not linked to a mailbox unit"
          description="This property isn't bridged to a unit yet, so incoming email can't be matched to it. Correspondence will appear here once it is."
        />
      ) : state.kind === 'error' ? (
        // Deliberately NOT an EmptyState: the read failed and we don't know
        // what's there — that is not "no correspondence".
        <LoadFailed what="correspondence" hint="You can still check the inbox directly." />
      ) : state.kind === 'empty' ? (
        <EmptyState
          icon={<Mail aria-hidden />}
          title="No correspondence yet"
          description="Emails from this household will appear here once they write in."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {state.threads.map((t) => (
              <CorrespondenceRow key={t.id} thread={t} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function HistorySection({ events }: { events: PropertyEventRow[] }) {
  return (
    <section aria-label="History" className="space-y-3">
      <SectionHeading
        title="History"
        action={events.length === 25 ? <span className="text-xs text-muted">Latest 25 events</span> : null}
      />
      {events.length === 0 ? (
        <EmptyState
          icon={<History aria-hidden />}
          title="No history yet"
          description="Tenure changes, resident moves, lease starts/ends, and waiting-list activity will appear here."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <Timeline label="Property history" items={events.map(eventItem)} />
          </CardContent>
        </Card>
      )}
    </section>
  )
}

function ViolationsSection({
  propertyId,
  violations,
  pager,
}: {
  propertyId: string
  violations: ViolationRow[]
  pager: React.ReactNode
}) {
  const now = new Date()
  return (
    <section aria-label="Violations" className="space-y-3">
      <SectionHeading
        title="Violations"
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button asChild variant="ghost" size="sm">
              {/* P0: propertyHref */}
              <Link href={`/violations?property=${propertyId}`}>All for this home</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/violations/new?property=${propertyId}`}>
                <Plus aria-hidden />
                New violation here
              </Link>
            </Button>
          </div>
        }
      />
      <p className="text-xs text-muted">Most urgent first: past their cure date, then the soonest cure dates.</p>
      <DataTable
        caption="Violations at this property"
        mobile="cards"
        rows={violations}
        rowKey={(v) => v.id}
        empty={
          <EmptyState
            variant="compact"
            icon={<AlertTriangle aria-hidden />}
            title="No violations"
            description="This property has a clean record."
          />
        }
        footer={pager}
        columns={[
          {
            key: 'description',
            header: 'Violation',
            mobilePrimary: true,
            cell: (v) => (
              <Link href={`/violations/${v.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                {v.description}
              </Link>
            ),
          },
          {
            key: 'severity',
            header: 'Severity',
            hideBelowLg: true,
            cell: (v) =>
              v.severity ? (
                <StatusBadge status={v.severity} tones={VIOLATION_SEVERITY.tones} labels={VIOLATION_SEVERITY.labels} />
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: 'cure',
            header: 'Cure by',
            cell: (v) => <CureByCell violation={v} now={now} />,
          },
          {
            key: 'reported',
            header: 'Reported',
            hideBelowLg: true,
            cell: (v) => <span className="num text-muted">{v.created_at ? format(new Date(v.created_at), 'PP') : '—'}</span>,
          },
          {
            key: 'status',
            header: 'Status',
            cell: (v) => <StatusBadge status={v.status} tones={VIOLATION_STATUS.tones} labels={VIOLATION_STATUS.labels} />,
          },
        ]}
      />
    </section>
  )
}

const DUES_STATUS = {
  tones: { open: 'warning', partial: 'warning', paid: 'success', waived: 'neutral', written_off: 'neutral' } as const,
  labels: { open: 'Open', partial: 'Partial', paid: 'Paid', waived: 'Waived', written_off: 'Written off' },
}

function DuesSection({ propertyId, dues, pager }: { propertyId: string; dues: AssessmentRow[]; pager: React.ReactNode }) {
  return (
    <section aria-label="Dues" className="space-y-3">
      <SectionHeading
        title="Dues"
        action={
          <Button asChild variant="ghost" size="sm">
            {/* P0: propertyHref */}
            <Link href={`/dues?property=${propertyId}`}>All dues for this home</Link>
          </Button>
        }
      />
      <DataTable
        caption="Assessments for this property"
        mobile="cards"
        rows={dues}
        rowKey={(d) => d.id}
        empty={
          <EmptyState
            variant="compact"
            icon={<Wallet aria-hidden />}
            title="No dues records"
            description="Dues for this property will appear here once they're invoiced."
          />
        }
        footer={pager}
        columns={[
          {
            key: 'period',
            header: 'Period',
            mobilePrimary: true,
            cell: (d) => (
              <span>
                {d.fiscal_period?.start_date ? formatDay(d.fiscal_period.start_date, 'year') : '—'}
                <span className="ml-2 text-xs text-muted">{d.assessment_type.replace(/_/g, ' ')}</span>
              </span>
            ),
          },
          { key: 'due', header: 'Due', cell: (d) => <span className="num text-muted">{formatDay(d.due_date)}</span> },
          {
            key: 'amount',
            header: 'Amount',
            numeric: true,
            cell: (d) => Number(d.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (d) => <StatusBadge status={d.status} tones={DUES_STATUS.tones} labels={DUES_STATUS.labels} />,
          },
        ]}
      />
    </section>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * The Tenure card's subtitle. It used to say "Never recorded" whenever no
 * change date was stored — beside a badge reading "Owner-occupied", since
 * imported homes carry a tenure but no tenure_updated_at.
 */
function tenureNote(tenure: PropertyTenure, updatedAt: string | null): string {
  if (updatedAt) return `Updated ${format(new Date(updatedAt), 'PP')}`
  if (tenure === 'unknown') return 'Not recorded yet — set the current state below.'
  return 'Set before changes were tracked; no change date on file.'
}

function CureByCell({ violation, now }: { violation: ViolationRow; now: Date }) {
  const due = cureBy(violation)
  const state = cureState(violation, now)
  if (!due || state === 'closed') return <span className="text-muted">—</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <time dateTime={due.toISOString()} className={state === 'past' ? 'num font-medium text-danger' : 'num text-foreground-secondary'}>
        {format(due, 'MMM d, yyyy')}
      </time>
      {state === 'past' ? <StatusPill tone="danger" size="sm" label="Past cure" icon={<Clock aria-hidden />} /> : null}
    </span>
  )
}

const ROLE_LABEL: Record<PropertyResidentRole, string> = {
  owner: 'Owner',
  tenant: 'Tenant',
  family_member: 'Family',
  other: 'Other',
}

function CorrespondenceRow({ thread }: { thread: CorrespondenceThreadSummary }) {
  return (
    <li>
      <Link
        href={`/inbox/${thread.id}`}
        className="flex items-start justify-between gap-3 px-4 py-3 text-sm no-underline transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{thread.subject || '(no subject)'}</p>
          <p className="num text-xs text-muted">{thread.lastMessageAt ? formatShortDate(thread.lastMessageAt) : ''}</p>
        </div>
        <StatusBadge status={thread.status} tones={INBOX_THREAD_STATUS.tones} labels={INBOX_THREAD_STATUS.labels} />
      </Link>
    </li>
  )
}

const EVENT_ICON: Record<PropertyEventKind, React.ComponentType<{ className?: string }>> = {
  tenure_changed: ArrowRightLeft,
  ownership_changed: ArrowRightLeft,
  resident_added: UserPlus,
  resident_removed: UserMinus,
  lease_started: KeyRound,
  lease_ended: Home,
  waiting_list_added: Clock,
  waiting_list_resolved: FileText,
  note: FileText,
}

function describeEvent(event: PropertyEventRow): string {
  const p = event.payload as Record<string, unknown>
  const tenureLabel = (v: unknown) => (typeof v === 'string' ? (TENURE.labels[v] ?? v.replace(/_/g, '-')) : '?')
  switch (event.kind) {
    case 'tenure_changed':
      return `Tenure changed from ${tenureLabel(p.from)} to ${tenureLabel(p.to)}`
    case 'ownership_changed':
      return 'Ownership changed'
    case 'resident_added':
      return `${typeof p.fullName === 'string' ? p.fullName : 'A resident'} added${
        typeof p.role === 'string' ? ` as ${p.role.replace(/_/g, ' ')}` : ''
      }`
    case 'resident_removed':
      return `${typeof p.fullName === 'string' ? p.fullName : 'A resident'} moved out`
    case 'lease_started':
      return 'Lease started'
    case 'lease_ended':
      return 'Lease ended'
    case 'waiting_list_added':
      return 'Added to lease waiting list'
    case 'waiting_list_resolved': {
      const outcome = typeof p.outcome === 'string' ? p.outcome : 'resolved'
      return `Waiting list entry ${outcome}`
    }
    case 'note':
      return event.notes ?? 'Note recorded'
  }
}

function eventItem(event: PropertyEventRow): TimelineItem {
  const Icon = EVENT_ICON[event.kind] ?? FileText
  return {
    id: event.id,
    title: describeEvent(event),
    time: <time dateTime={event.occurred_at}>{format(new Date(event.occurred_at), 'PP · p')}</time>,
    icon: <Icon />,
    tone: event.kind === 'resident_removed' || event.kind === 'lease_ended' ? 'neutral' : 'brand',
    body: event.notes && event.kind !== 'note' ? event.notes : undefined,
  }
}
