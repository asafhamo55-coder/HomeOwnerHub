import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  Wallet,
  Home,
  KeyRound,
  HelpCircle,
  Users,
  History,
  UserPlus,
  UserMinus,
  ArrowRightLeft,
  FileText,
  Clock,
  Mail,
} from 'lucide-react'
import { format } from 'date-fns'
import {
  Alert,
  BackLink,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPropertyDetail, type PropertyTenure } from '@/lib/properties'
import { listProperties } from '@/lib/properties/list'
import { parsePropertyListParams } from '@/lib/properties/list-params'
import { getLeaseCap } from '@/lib/leases'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getCurrentUserRole } from '@/lib/auth'
import {
  listThreadsForUnit,
  type CorrespondenceThreadSummary,
} from '@/lib/inbox/queries'
import { formatShortDate } from '@/lib/format-datetime'
import type { PropertyResidentRow, PropertyResidentRole } from '@/lib/property-residents'
import type { PropertyEventRow, PropertyEventKind } from '@/lib/property-events'
import { PropertyList } from '../PropertyList'
import { PropertyListFilters } from '../PropertyListFilters'
import {
  resolveCorrespondenceState,
  type CorrespondenceSectionState,
} from './correspondence-state'
import { PropertyPanel, parsePanelTab, type PanelStats } from './PropertyPanel'
import { TenureSelector } from './TenureSelector'
import { AddResidentForm } from './AddResidentForm'
import { PropertyActions } from './PropertyActions'
import { ResidentActions } from './ResidentActions'
import { ResidentRow as ResidentRowClient } from './ResidentRow'
import { EnterPortalButton } from './EnterPortalButton'

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
// the aside was ranked by. Not derived from `violations`/`dues` below —
// those are capped at 20/12 rows for display and would undercount.
// Cast for the same reason list.ts casts: the view postdates the last
// `supabase gen types` pass.
const LIST_VIEW = 'hoa_property_list_v'

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
  }>
}) {
  const { id } = await params
  const sp = await searchParams
  const tab = parsePanelTab(sp.tab)
  const listParams = parsePropertyListParams(sp)
  const supabase = await getSupabaseServerClient()

  const detail = await getPropertyDetail(id)
  if (!detail) notFound()
  const p = detail.property as unknown as PropertyDetailRow
  const tenure: PropertyTenure = detail.property.tenure
  const residents = detail.residents
  const events = detail.events

  // Lease cap drives whether the "Add to waiting list" button shows up
  // on owner-occupied properties. No cap → no need to queue anything.
  const [assoc] = await Promise.all([getPrimaryAssociation()])
  const cap = assoc ? await getLeaseCap(assoc.id) : null
  const capInPlace = cap?.capPct !== null && cap?.capPct !== undefined

  // Resolve the v1 unit row for this legacy property (migration 0005
  // backfills `units.legacy_hoa_property_id`). Assessments live keyed
  // on units, not on hoa_properties.
  const { data: unit } = await supabase
    .from('units')
    .select('id')
    .eq('legacy_hoa_property_id', id)
    .maybeSingle()

  // Only admins get the "Enter portal" impersonation control.
  const ctx = await getCurrentUserRole()
  const isAdmin = ctx?.role === 'admin'
  const unitId = unit?.id ?? null

  const [violationsRes, assessmentsRes, correspondenceOutcome, statsRow] =
    await Promise.all([
      supabase
        .from('hoa_violations')
        .select('id, description, status, severity, created_at, cure_period_days, notice_sent_at')
        .eq('property_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
      unit
        ? supabase
            .from('assessments')
            .select(
              'id, due_date, amount, status, assessment_type, fiscal_period:fiscal_period_id(start_date), payments(amount)',
            )
            .eq('unit_id', unit.id)
            .is('deleted_at', null)
            .order('due_date', { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] }),
      // unitId null means this property has no bridged unit row — correspondence
      // cannot be linked to it at all, which the Mail tab must render as a
      // distinct state from "linked, but zero threads so far" AND from "linked,
      // but the read failed". `listThreadsForUnit` throws on a soft read
      // failure (correctly — see its docstring), but this read sits alongside
      // the other tabs' reads in one `Promise.all`; letting it reject the whole
      // `Promise.all` would take down residents/tenure/violations/dues too for
      // a failure in one section of six. `Promise.allSettled` (wrapping just
      // this one call, of one) turns that rejection into data instead —
      // `correspondenceOutcome` is `null` when there's no unit to query, or a
      // `PromiseSettledResult` the page can branch on otherwise.
      unitId && ctx
        ? Promise.allSettled([listThreadsForUnit(supabase, ctx.org.id, unitId)]).then(
            ([result]) => result,
          )
        : Promise.resolve(null),
      // Stat-strip numbers. Enrichment, not page-defining: a failure here
      // shows zeros in four tiles rather than blanking the property.
      (async (): Promise<PanelStatsRow | null> => {
        if (!ctx) return null
        const { data } = await supabase
          .from(LIST_VIEW as never)
          .select(
            'balance, days_overdue, open_violations, violations_past_cure, threads_needing_reply',
          )
          .eq('id' as never, id)
          .eq('org_id' as never, ctx.org.id)
          .maybeSingle<PanelStatsRow>()
        return data ?? null
      })(),
    ])

  const violations = (violationsRes.data ?? []) as ViolationRow[]
  const dues = (assessmentsRes.data ?? []) as unknown as AssessmentRow[]

  if (correspondenceOutcome?.status === 'rejected') {
    const reason = correspondenceOutcome.reason
    // `listThreadsForUnit` already logs the underlying PostgrestError's
    // `.code`/`.message` (never `.details`) before it throws a plain Error
    // wrapping just that message. Log again here, at the point this page
    // chose to swallow the rejection, so "the property page degraded" is
    // itself visible server-side — still message-only, nothing from the
    // original row (no subject/address ever reaches this Error).
    console.error('PropertyDetailPage: correspondence read failed', {
      message: reason instanceof Error ? reason.message : String(reason),
    })
  }
  const correspondenceState = resolveCorrespondenceState(unitId, correspondenceOutcome)

  const stats: PanelStats = {
    balance: Number(statsRow?.balance ?? 0),
    daysOverdue: Number(statsRow?.days_overdue ?? 0),
    openViolations: Number(statsRow?.open_violations ?? 0),
    violationsPastCure: Number(statsRow?.violations_past_cure ?? 0),
    residents: residents.length,
    threadsNeedingReply: Number(statsRow?.threads_needing_reply ?? 0),
  }

  // The list beside the panel. Its read is wrapped the same way
  // /properties/page.tsx wraps it: a list failure narrows the page to the
  // panel rather than throwing the whole route away.
  let rows: Awaited<ReturnType<typeof listProperties>>['rows'] = []
  let total = 0
  let counts = { attention: 0, all: 0 }
  let listError: string | null = null
  if (ctx) {
    try {
      const result = await listProperties(supabase, ctx.org.id, listParams)
      rows = result.rows
      total = result.total

      // Count-only queries (`head: true`) so no rows are transferred — these
      // drive the filter-chip counts, not the paginated list above. Same two
      // queries /properties/page.tsx runs; PropertyListFilters requires them.
      const [attentionCount, allCount] = await Promise.all([
        supabase
          .from(LIST_VIEW as never)
          .select('*', { count: 'exact', head: true })
          .eq('org_id' as never, ctx.org.id)
          .lt('severity_rank' as never, 6),
        supabase
          .from(LIST_VIEW as never)
          .select('*', { count: 'exact', head: true })
          .eq('org_id' as never, ctx.org.id),
      ])
      counts = {
        attention: attentionCount.count ?? 0,
        all: allCount.count ?? 0,
      }
    } catch (e) {
      listError = e instanceof Error ? e.message : 'Could not load properties.'
    }
  }

  // The list state this property was opened from, carried on every tab link
  // and on the mobile back link so filter/sort/search/page survive.
  const listQuery = new URLSearchParams()
  if (listParams.filter !== 'attention') listQuery.set('filter', listParams.filter)
  if (listParams.sort !== 'severity') listQuery.set('sort', listParams.sort)
  if (listParams.search) listQuery.set('q', listParams.search)
  if (listParams.page > 1) listQuery.set('page', String(listParams.page))
  const query = listQuery.toString()
  const listHref = query ? `/properties?${query}` : '/properties'
  const historyHref = `/properties/${id}?${new URLSearchParams({
    ...Object.fromEntries(listQuery),
    tab: 'history',
  })}`
  const residentsHref = `/properties/${id}?${new URLSearchParams({
    ...Object.fromEntries(listQuery),
    tab: 'residents',
  })}`

  const pageHref = (n: number) =>
    `/properties?${new URLSearchParams({
      filter: listParams.filter,
      sort: listParams.sort,
      ...(listParams.search ? { q: listParams.search } : {}),
      page: String(n),
    })}`

  return (
    <main className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* The aside mirrors /properties so the list survives navigation;
          hidden below lg so the panel is the whole page on a phone — the
          same structure inbox/[id]/page.tsx uses. */}
      <aside className="hidden w-full max-w-sm shrink-0 overflow-y-auto border-r border-border lg:block xl:max-w-xs">
        <PropertyListFilters params={listParams} counts={counts} />
        {listError ? (
          <Alert variant="error" title="Could not load properties" className="m-3">
            {listError}
          </Alert>
        ) : (
          <>
            <PropertyList rows={rows} selectedId={id} params={listParams} />
            {total > listParams.limit ? (
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
                <span>
                  Showing {listParams.offset + 1}–
                  {Math.min(listParams.offset + rows.length, total)} of {total}
                </span>
                <div className="flex gap-3">
                  {listParams.page > 1 ? (
                    <Link href={pageHref(listParams.page - 1)} className="underline hover:text-foreground">
                      Previous
                    </Link>
                  ) : (
                    <span className="text-muted/50">Previous</span>
                  )}
                  {listParams.offset + rows.length < total ? (
                    <Link href={pageHref(listParams.page + 1)} className="underline hover:text-foreground">
                      Next
                    </Link>
                  ) : (
                    <span className="text-muted/50">Next</span>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Edit/Delete sit above the tabs so they're reachable from every
            tab, exactly as they were reachable from the old single page. */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <div className="lg:hidden">
            <BackLink href={listHref} label="All properties" />
          </div>
          <div className="ml-auto">
            <PropertyActions propertyId={p.id} />
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <PropertyPanel
            propertyId={id}
            address={p.address}
            unitNumber={p.unit_number}
            ownerName={p.owner_name}
            ownerEmail={p.owner_email}
            ownerPhone={p.owner_phone}
            tenure={tenure}
            stats={stats}
            currentTab={tab}
            query={query}
          >
            {tab === 'overview' ? (
              <OverviewTab
                property={p}
                tenureUpdatedAt={detail.property.tenure_updated_at}
                tenure={tenure}
                capInPlace={capInPlace}
                isAdmin={isAdmin}
                unitId={unitId}
                violationCount={violations.length}
                duesCount={dues.length}
                residents={residents}
                events={events}
                historyHref={historyHref}
                residentsHref={residentsHref}
              />
            ) : null}
            {tab === 'residents' ? (
              <ResidentsSection
                residents={residents}
                isAdmin={isAdmin}
                propertyId={p.id}
                unitId={unitId}
              />
            ) : null}
            {tab === 'mail' ? <CorrespondenceSection state={correspondenceState} /> : null}
            {tab === 'violations' ? <ViolationsSection violations={violations} /> : null}
            {tab === 'dues' ? <DuesSection dues={dues} /> : null}
            {tab === 'history' ? <HistorySection events={events} /> : null}
          </PropertyPanel>
        </div>
      </section>
    </main>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────
// Each of these is the body of one of the six <section> blocks the old
// single-scroll page stacked. The markup inside is unchanged; only the
// wrapper heading rows moved, because the panel's tab strip names them now.

function OverviewTab({
  property: p,
  tenureUpdatedAt,
  tenure,
  capInPlace,
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
  isAdmin: boolean
  unitId: string | null
  violationCount: number
  duesCount: number
  residents: PropertyResidentRow[]
  events: PropertyEventRow[]
  historyHref: string
  residentsHref: string
}) {
  const recent = events.slice(0, 4)
  const active = residents.filter((r) => r.moved_out_at === null)
  const primary = active.find((r) => r.is_primary) ?? active[0] ?? null

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Owner</CardTitle>
              {isAdmin && p.owner_email ? (
                <EnterPortalButton
                  email={p.owner_email}
                  name={p.owner_name}
                  propertyId={p.id}
                  unitId={unitId}
                />
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-foreground">{p.owner_name ?? <span className="text-muted">Not on file</span>}</p>
            {p.owner_email ? (
              <a href={`mailto:${p.owner_email}`} className="block text-primary hover:underline">
                {p.owner_email}
              </a>
            ) : null}
            {p.owner_phone ? <p className="text-muted">{p.owner_phone}</p> : null}
            {p.notes ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{p.notes}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Tenure</CardTitle>
              <TenureBadge tenure={tenure} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted">
              {tenureUpdatedAt
                ? `Updated ${format(new Date(tenureUpdatedAt), 'PP')}`
                : 'Never recorded — set the current state below.'}
            </p>
            <TenureSelector
              propertyId={p.id}
              currentTenure={tenure}
              capInPlace={capInPlace}
            />
            <div className="pt-2 text-xs text-muted">
              <p>
                {violationCount}{' '}
                {violationCount === 1 ? 'violation' : 'violations'} ·{' '}
                {duesCount}{' '}
                {duesCount === 1 ? 'assessment' : 'assessments'}
              </p>
              {p.created_at ? (
                <p>Added {format(new Date(p.created_at), 'PP')}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Residents</h3>
            <Link href={residentsHref} className="text-xs font-medium text-primary hover:underline">
              Manage
            </Link>
          </div>
          {residents.length === 0 ? (
            <p className="text-sm text-muted">No residents on file.</p>
          ) : (
            <Card>
              <CardContent className="space-y-1 py-3 text-sm">
                <p className="text-foreground">
                  {active.length} {active.length === 1 ? 'person' : 'people'} living here
                  {residents.length !== active.length
                    ? ` · ${residents.length - active.length} moved out`
                    : ''}
                </p>
                {primary ? (
                  <p className="text-xs text-muted">
                    {primary.full_name} · {ROLE_LABEL[primary.role]}
                    {primary.email ? ` · ${primary.email}` : ''}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            <Link href={historyHref} className="text-xs font-medium text-primary hover:underline">
              Full history
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {recent.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            </Card>
          )}
        </section>
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
    <section className="space-y-3">
      <div className="flex items-center justify-end">
        <AddResidentForm propertyId={propertyId} />
      </div>
      {residents.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" aria-hidden />}
          title="No residents on file"
          description="Add the owners, tenants, and family members living here so notices and outreach reach the right people."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {residents.map((r) => (
              <ResidentRowClient
                key={r.id}
                resident={r}
                isAdmin={isAdmin}
                propertyId={propertyId}
                unitId={unitId}
              />
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function CorrespondenceSection({ state }: { state: CorrespondenceSectionState }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-end">
        <Link href="/inbox" className="text-sm font-medium text-primary hover:underline">
          Open inbox
        </Link>
      </div>
      {state.kind === 'unlinked' ? (
        <EmptyState
          icon={<Mail className="h-8 w-8" aria-hidden />}
          title="Not linked to a mailbox unit"
          description="This property isn't bridged to a unit yet, so incoming email can't be matched to it. Correspondence will appear here once it is."
        />
      ) : state.kind === 'error' ? (
        // Deliberately NOT an EmptyState: this must not look like "no
        // correspondence" (below), because it isn't that claim — the read
        // failed and we don't actually know what's there. Amber pair used
        // for degraded-but-not-destructive states elsewhere in this app
        // (PropertyRail.tsx, MailboxConnectCard.tsx, DraftPanel.tsx) —
        // there's no `text-warning` token in the shared Tailwind config.
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50 px-6 py-12 text-center dark:border-amber-800 dark:bg-amber-950">
          <Mail className="mb-4 h-8 w-8 text-amber-700 dark:text-amber-400" aria-hidden />
          <h3 className="text-base font-semibold text-amber-700 dark:text-amber-400">
            Correspondence couldn&apos;t be loaded
          </h3>
          <p className="mt-1 max-w-md text-sm text-amber-700 dark:text-amber-400">
            This doesn&apos;t mean there is none — the read failed. Refresh to try
            again, or check the inbox directly.
          </p>
        </div>
      ) : state.kind === 'empty' ? (
        <EmptyState
          icon={<Mail className="h-8 w-8" aria-hidden />}
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
    <section className="space-y-3">
      <div className="flex items-center justify-end">
        {events.length === 25 ? (
          <span className="text-xs text-muted">Showing latest 25 events</span>
        ) : null}
      </div>
      {events.length === 0 ? (
        <EmptyState
          icon={<History className="h-8 w-8" aria-hidden />}
          title="No history yet"
          description="Tenure changes, resident moves, lease starts/ends, and waiting-list activity will appear here."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function ViolationsSection({ violations }: { violations: ViolationRow[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-end">
        <Link href="/violations" className="text-sm font-medium text-primary hover:underline">
          All violations
        </Link>
      </div>
      {violations.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" aria-hidden />}
          title="No violations"
          description="This property has a clean record."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {violations.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{v.description}</p>
                  <p className="text-xs text-muted">
                    {v.created_at ? format(new Date(v.created_at), 'PP') : ''}
                    {v.severity ? ` · ${v.severity} severity` : ''}
                  </p>
                </div>
                <Badge
                  variant={v.status === 'resolved' ? 'success' : v.status === 'notice_sent' ? 'warning' : 'outline'}
                  size="sm"
                >
                  {v.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function DuesSection({ dues }: { dues: AssessmentRow[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-end">
        <Link href="/dues" className="text-sm font-medium text-primary hover:underline">
          Full ledger
        </Link>
      </div>
      {dues.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" aria-hidden />}
          title="No dues records"
          description="Dues for this property will appear here once they're invoiced."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((d) => {
                  const period = d.fiscal_period?.start_date
                    ? format(new Date(d.fiscal_period.start_date), 'yyyy')
                    : '—'
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-foreground">
                        {period}
                        <span className="ml-2 text-xs text-muted">{d.assessment_type}</span>
                      </td>
                      <td className="px-4 py-2 text-muted">{format(new Date(d.due_date), 'PP')}</td>
                      <td className="px-4 py-2 text-foreground">${Number(d.amount).toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            d.status === 'paid'
                              ? 'success'
                              : d.status === 'partial'
                                ? 'warning'
                                : 'outline'
                          }
                          size="sm"
                        >
                          {d.status}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  )
}

// ─── Helpers for the new tenure / residents / history cards ──────────

function TenureBadge({ tenure }: { tenure: PropertyTenure }) {
  if (tenure === 'owner_occupied') {
    return (
      <Badge variant="success" size="sm">
        <Home className="mr-1 h-3 w-3" />
        Owner-occupied
      </Badge>
    )
  }
  if (tenure === 'leased') {
    return (
      <Badge variant="warning" size="sm">
        <KeyRound className="mr-1 h-3 w-3" />
        Leased
      </Badge>
    )
  }
  return (
    <Badge variant="neutral" size="sm">
      <HelpCircle className="mr-1 h-3 w-3" />
      Unknown
    </Badge>
  )
}

const ROLE_LABEL: Record<PropertyResidentRole, string> = {
  owner: 'Owner',
  tenant: 'Tenant',
  family_member: 'Family',
  other: 'Other',
}

function ResidentRow({ resident }: { resident: PropertyResidentRow }) {
  const isActive = resident.moved_out_at === null
  const roleVariant: 'success' | 'info' | 'neutral' | 'outline' =
    resident.role === 'owner'
      ? 'success'
      : resident.role === 'tenant'
        ? 'info'
        : 'neutral'
  return (
    <li
      className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${
        isActive ? '' : 'opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium text-foreground">
          {resident.full_name}
          {resident.is_primary ? (
            <Badge variant="outline" size="sm">
              Primary
            </Badge>
          ) : null}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge variant={roleVariant} size="sm">
            {ROLE_LABEL[resident.role]}
          </Badge>
          {resident.email ? (
            <a
              href={`mailto:${resident.email}`}
              className="hover:text-foreground hover:underline"
            >
              {resident.email}
            </a>
          ) : null}
          {resident.phone ? <span>{resident.phone}</span> : null}
          {resident.moved_in_at ? (
            <span>moved in {format(new Date(resident.moved_in_at), 'PP')}</span>
          ) : null}
          {resident.moved_out_at ? (
            <span className="text-destructive/80">
              moved out {format(new Date(resident.moved_out_at), 'PP')}
            </span>
          ) : null}
        </div>
      </div>
      <ResidentActions
        residentId={resident.id}
        residentName={resident.full_name}
        isActive={isActive}
      />
    </li>
  )
}

// Same tones the Violations section above uses (success / warning / outline),
// extended with `neutral` for "waiting" so it reads as distinct from "open"
// rather than reusing outline for both.
const THREAD_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'neutral'> = {
  needs_review: 'warning',
  open: 'outline',
  waiting: 'neutral',
  closed: 'success',
}

function CorrespondenceRow({ thread }: { thread: CorrespondenceThreadSummary }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <Link
          href={`/inbox/${thread.id}`}
          className="block truncate font-medium text-foreground hover:underline"
        >
          {thread.subject || '(no subject)'}
        </Link>
        <p className="text-xs text-muted">
          {thread.lastMessageAt ? formatShortDate(thread.lastMessageAt) : ''}
        </p>
      </div>
      <Badge variant={THREAD_STATUS_VARIANT[thread.status] ?? 'outline'} size="sm">
        {thread.status}
      </Badge>
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
  switch (event.kind) {
    case 'tenure_changed': {
      const from = typeof p.from === 'string' ? p.from.replace(/_/g, '-') : '?'
      const to = typeof p.to === 'string' ? p.to.replace(/_/g, '-') : '?'
      return `Tenure changed from ${from} to ${to}.`
    }
    case 'ownership_changed':
      return 'Ownership changed.'
    case 'resident_added':
      return `${typeof p.fullName === 'string' ? p.fullName : 'A resident'} added${
        typeof p.role === 'string' ? ` as ${p.role.replace(/_/g, ' ')}` : ''
      }.`
    case 'resident_removed':
      return `${
        typeof p.fullName === 'string' ? p.fullName : 'A resident'
      } moved out.`
    case 'lease_started':
      return 'Lease started.'
    case 'lease_ended':
      return 'Lease ended.'
    case 'waiting_list_added':
      return 'Added to lease waiting list.'
    case 'waiting_list_resolved': {
      const outcome = typeof p.outcome === 'string' ? p.outcome : 'resolved'
      return `Waiting list entry ${outcome}.`
    }
    case 'note':
      return event.notes ?? 'Note recorded.'
  }
}

function EventRow({ event }: { event: PropertyEventRow }) {
  const Icon = EVENT_ICON[event.kind] ?? FileText
  return (
    <li className="flex items-start gap-3 px-4 py-3 text-sm">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background text-muted">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground">{describeEvent(event)}</p>
        <p className="text-xs text-muted">
          {format(new Date(event.occurred_at), 'PPp')}
          {event.notes && event.kind !== 'note' ? ` · ${event.notes}` : ''}
        </p>
      </div>
    </li>
  )
}
