import { isSameDay } from 'date-fns'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { chunk, readAllResult } from '@/lib/supabase/read-all'
import type { DayCell, DayLevel } from '@/components/dashboard/heat-map-grid'
import { ASSOCIATION_ZONE_COLUMNS, addCalendarDays, calendarDaysBetween, dayOf, todayIn } from '@/lib/association-time'
import { orgTimeZone, primaryAssociationZone } from '@/lib/association-time-server'

// Optional `client` on every fetcher lets ./cached.ts pass an admin
// client (no cookies, so unstable_cache can memoize). Falls back to
// the cookie-bound server client when called the normal way.

type AnyClient = SupabaseClient<any, any, any>

async function resolveClient(client?: AnyClient): Promise<AnyClient> {
  return client ?? ((await getSupabaseServerClient()) as unknown as AnyClient)
}

// ─── the association's day (BL-043) ─────────────────────────────────
//
// Date-only columns (due_date, meeting_date, coi_expiration_date) are
// calendar dates: compared with whole calendar days against the
// association's today, never via `new Date('2026-10-01')` (UTC midnight,
// i.e. the evening before in every US zone) minus `Date.now()`.

type ZoneRow = { name?: string | null; state?: string | null }
const zoneOf = (assocs: ZoneRow[] | null | undefined) => primaryAssociationZone(assocs)

/** The day a cure period ends: the notice's day in the association's zone, plus N calendar days. */
function cureDay(noticeSentAt: string, cureDays: number, timeZone: string): string | null {
  const sent = dayOf(noticeSentAt, timeZone)
  return sent ? addCalendarDays(sent, cureDays) : null
}

export interface DigestSnapshot {
  content: string | null
  generatedAt: string | null
}

export type ApprovalKind = 'violation' | 'meeting' | 'invoice' | 'rfp'

export interface ApprovalItem {
  kind: ApprovalKind
  id: string
  title: string
  /** ISO timestamp the item became pending. */
  pendingSince: string | null
  /** Where clicking the row should land. */
  href: string
}

export interface ApprovalsInbox {
  items: ApprovalItem[]
  totalCount: number
  /**
   * True when any source query errored: the list is then PARTIAL, and an
   * empty list is not "inbox zero". Optional so existing callers and test
   * doubles that predate it keep type-checking; absent means not failed.
   */
  failed?: boolean
}

/** Day cells for the compliance heat map, plus whether the read failed. */
export interface ComplianceHeatMapResult {
  cells: DayCell[]
  /** True when a source query errored — grey days are then unknown, not clear. */
  failed: boolean
  /** The association's today ('YYYY-MM-DD') the levels were judged against. */
  today: string
}

export interface NextMeetingResult {
  meeting: NextMeetingInfo | null
  /** True when the read errored — `meeting: null` is then unknown, not "none scheduled". */
  failed: boolean
}

/** Vendors whose certificates the board still tracks; inactive and blacklisted ones are not. */
const COI_TRACKED_VENDOR_STATUSES: readonly string[] = ['active', 'prospect']

export type AtRiskKind = 'cure_deadline' | 'dues_overdue' | 'coi_expiring'

export interface AtRiskItem {
  kind: AtRiskKind
  id: string
  /** Plain-English row title, e.g. "Cure deadline · 123 Oak St". */
  title: string
  /** Red = already breached / severely overdue; amber = approaching. */
  severity: 'red' | 'amber'
  /** Days from today: negative if past, positive if future. */
  daysOffset: number
  /** Where clicking the row should land. */
  href: string
}

/**
 * True totals, counted BEFORE `items` is sliced for display.
 *
 * `items` is a 6-row render list chosen by a sort that runs across all
 * three kinds at once, so counting it under-reports every kind and can
 * drop a kind entirely. Anything that states a number to a user must read
 * these instead.
 */
export interface AtRiskCounts {
  /** DISTINCT units behind, not assessment rows — one unit three months
   *  behind is one unit, not three. */
  duesOverdueUnits: number
  cureDeadlinesElapsed: number
  cureDeadlinesUpcoming: number
  /** Active / prospect vendors whose certificate expires within 30 days (today included). */
  coiExpiring: number
  /** Active / prospect vendors whose certificate has already expired (BL-083). */
  coiExpired: number
}

export interface AtRiskResult {
  items: AtRiskItem[]
  totalCount: number
  counts: AtRiskCounts
  /** True when any source query errored — the counts are UNKNOWN, not 0. */
  failed: boolean
}

/** Board approvals that have sat pending longer than the caller's window. */
export interface StaleApprovalCount {
  count: number
  /** True when any source query errored — the count is UNKNOWN, not 0. */
  failed: boolean
}

export interface NextMeetingInfo {
  id: string
  meetingDate: string
  meetingType: string | null
  daysUntil: number
  status: string | null
}

export interface LeaseSummary {
  /** True when at least one association under this org exists. */
  hasAssociation: boolean
  /**
   * Cap % rolled up across associations:
   *  - null if all associations have no cap set
   *  - the single value if all non-null caps agree
   *  - the MOST RESTRICTIVE (lowest) cap if caps differ — safe default so
   *    a manager seeing 25% cap won't accidentally exceed a 15% cap in
   *    another association. The UI should label this as mixed.
   */
  capPct: number | null
  totalUnits: number
  leasedCount: number
  /** leasedCount / totalUnits * 100, 0 when totalUnits is 0. */
  leasedPct: number
  /** Floor((capPct/100)*totalUnits) - leasedCount, floored at 0. Null when capPct is unset. */
  headroom: number | null
  /** Count of waiting_list rows with status='waiting' across all associations under this org. */
  waitingListCount: number
  /**
   * True when associations under this org have differing non-null caps,
   * so `capPct` reflects only the most-restrictive one. UI should label
   * this so the manager doesn't assume the cap is uniform.
   */
  capIsMixed: boolean
  /**
   * True when any source query errored. Matters more here than elsewhere:
   * a failed leased-count returns 0, which computes as MAXIMUM headroom,
   * so a consumer that trusts it goes quiet on the day the cap breaks.
   */
  failed: boolean
}

/**
 * Log a failed dashboard query. Code and message only: PostgrestError's
 * `details` can carry row values, and nothing on this dashboard may put
 * community data into a log line. Same convention as triage.ts.
 */
function logQueryError(fn: string, error: { code?: string; message?: string }): void {
  console.error(`${fn} failed`, { code: error.code, message: error.message })
}

// Unions every "manager owes an approval" source so the dashboard can
// surface a single "waiting on you" list instead of scattering pending
// items across four separate pages.
export async function getApprovalsInbox(
  orgId: string,
  client?: AnyClient,
): Promise<ApprovalsInbox> {
  const supabase = await resolveClient(client)

  const [violations, minutes, invoices, rfps] = await Promise.all([
    // AI-drafted violation letters awaiting human approval (Bar B gate).
    supabase
      .from('hoa_violations')
      .select(
        'id, description, created_at, property:hoa_properties(address, unit_number)',
      )
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .not('ai_draft_letter', 'is', null)
      .is('approved_at', null)
      .order('created_at', { ascending: false })
      .limit(10),

    // Meeting minutes that haven't been approved by the board yet.
    supabase
      .from('hoa_meeting_minutes')
      .select('id, meeting_date, meeting_type, status, updated_at')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .neq('status', 'approved')
      .order('meeting_date', { ascending: false })
      .limit(10),

    // Invoices coded by AI and awaiting manager review before posting.
    supabase
      .from('invoices')
      .select(
        'id, invoice_number, amount, created_at, vendor:vendors(legal_name)',
      )
      .eq('organization_id', orgId)
      .eq('status', 'coded')
      .order('created_at', { ascending: false })
      .limit(10),

    // RFPs the AI composer drafted but the manager hasn't published.
    supabase
      .from('rfps')
      .select('id, rfp_number, title, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'draft')
      .eq('ai_generated', true)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ApprovalItem[] = []

  type VRow = {
    id: string
    description: string
    created_at: string | null
    property: { address: string; unit_number: string | null } | null
  }
  for (const v of (violations.data ?? []) as unknown as VRow[]) {
    const place = v.property
      ? `${v.property.address}${v.property.unit_number ? ' · ' + v.property.unit_number : ''}`
      : 'Property unknown'
    items.push({
      kind: 'violation',
      id: v.id,
      title: `Violation · ${place}`,
      pendingSince: v.created_at,
      href: `/violations/${v.id}`,
    })
  }

  type MRow = {
    id: string
    meeting_date: string
    meeting_type: string | null
    status: string | null
    updated_at: string | null
  }
  for (const m of (minutes.data ?? []) as unknown as MRow[]) {
    // meeting_date is a DATE: format in UTC so it never shifts a day.
    const when = m.meeting_date
      ? new Date(`${m.meeting_date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : 'date TBD'
    const type = m.meeting_type
      ? `${m.meeting_type.charAt(0).toUpperCase()}${m.meeting_type.slice(1)} meeting`
      : 'Board meeting'
    items.push({
      kind: 'meeting',
      id: m.id,
      title: `Meeting minutes · ${type}, ${when}`,
      pendingSince: m.updated_at ?? m.meeting_date,
      href: `/meetings/${m.id}`,
    })
  }

  type IRow = {
    id: string
    invoice_number: string
    amount: number
    created_at: string | null
    vendor: { legal_name: string } | null
  }
  for (const i of (invoices.data ?? []) as unknown as IRow[]) {
    const amt = Number(i.amount).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    })
    items.push({
      kind: 'invoice',
      id: i.id,
      title: `Invoice ${i.invoice_number} · ${amt}${i.vendor ? ' · ' + i.vendor.legal_name : ''}`,
      pendingSince: i.created_at,
      href: `/accounting/invoices/${i.id}`,
    })
  }

  type RRow = {
    id: string
    rfp_number: string
    title: string
    created_at: string | null
  }
  for (const r of (rfps.data ?? []) as unknown as RRow[]) {
    items.push({
      kind: 'rfp',
      id: r.id,
      title: `Draft RFP ${r.rfp_number} · ${r.title}`,
      pendingSince: r.created_at,
      href: `/rfps/${r.id}`,
    })
  }

  // Oldest pending items first — they've been waiting longest.
  items.sort((a, b) => {
    const at = a.pendingSince ? new Date(a.pendingSince).getTime() : 0
    const bt = b.pendingSince ? new Date(b.pendingSince).getTime() : 0
    return at - bt
  })

  const failed = [violations, minutes, invoices, rfps].some((r) => {
    if (!r.error) return false
    logQueryError('getApprovalsInbox', r.error)
    return true
  })

  return { items, totalCount: items.length, failed }
}

// Lease cap + current state + waiting list count for the dashboard
// widget. Aggregates across every association under the org so an HOA
// with multiple sub-associations sees one rolled-up number. When
// associations have differing non-null caps we surface the most
// restrictive (lowest) one and flag `capIsMixed: true` so the UI can
// label it — picking the lowest is the safe interpretation since a
// manager seeing 25% cap shouldn't accidentally exceed a 15% cap in
// another association.
export async function getLeaseSummary(
  orgId: string,
  client?: AnyClient,
): Promise<LeaseSummary> {
  const supabase = await resolveClient(client)

  let failed = false
  const note = (error: { code?: string; message?: string } | null): void => {
    if (!error) return
    logQueryError('getLeaseSummary', error)
    failed = true
  }

  // 1. Resolve associations + their caps in one query.
  const { data: assocs, error: assocsError } = await supabase
    .from('associations' as never)
    .select('id, lease_cap_pct')
    .eq('organization_id', orgId)
  note(assocsError)
  const assocRows = ((assocs ?? []) as unknown as Array<{
    id: string
    lease_cap_pct: number | string | null
  }>)
  if (assocRows.length === 0) {
    return {
      hasAssociation: false,
      capPct: null,
      totalUnits: 0,
      leasedCount: 0,
      leasedPct: 0,
      headroom: null,
      waitingListCount: 0,
      capIsMixed: false,
      failed,
    }
  }
  const assocIds = assocRows.map((a) => a.id)

  // Roll up caps across associations:
  //  - all null  → capPct null,            capIsMixed false
  //  - all equal → that value,             capIsMixed false
  //  - differ    → most-restrictive (min), capIsMixed true
  const capValues = assocRows
    .map((a) => a.lease_cap_pct)
    .filter((v): v is number | string => v !== null && v !== undefined)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
  let capPct: number | null
  let capIsMixed = false
  if (capValues.length === 0) {
    capPct = null
  } else {
    const min = Math.min(...capValues)
    const max = Math.max(...capValues)
    capPct = min
    capIsMixed = min !== max
  }

  // 2. Resolve the units → properties for tenure roll-up.
  // Paged to the end (BL-047): PostgREST caps every response at 1000
  // rows whatever range is asked for, so the old `.range(0, 49_999)` made
  // the denominator in "N of M units leased" a paging artefact.
  const { data: unitsRows, error: unitsError } = await readAllResult<{ legacy_hoa_property_id: string | null }>(
    (from, to) =>
      supabase
        .from('units' as never)
        .select('id, legacy_hoa_property_id')
        .in('association_id', assocIds)
        .not('legacy_hoa_property_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to) as never,
  )
  note(unitsError)
  const propertyIds = ((unitsRows ?? []) as unknown as Array<{
    legacy_hoa_property_id: string | null
  }>)
    .map((r) => r.legacy_hoa_property_id)
    .filter((id): id is string => !!id)

  // Count-only, chunked: a single `.in()` over thousands of ids overflows
  // the request URL. A failed chunk marks the summary failed.
  let leasedCount = 0
  for (const ids of chunk(propertyIds)) {
    const { count, error: leasedError } = await supabase
      .from('hoa_properties')
      .select('id', { count: 'exact', head: true })
      .in('id', ids)
      .is('deleted_at', null)
      .eq('tenure' as never, 'leased')
    note(leasedError)
    leasedCount += count ?? 0
  }
  const totalUnits = propertyIds.length

  // 3. Waiting-list count (status='waiting' across all associations).
  const { count: waitingListCount, error: waitingError } = await supabase
    .from('lease_waiting_list' as never)
    .select('id', { count: 'exact', head: true })
    .in('association_id', assocIds)
    .eq('status', 'waiting')
  note(waitingError)

  const leasedPct = totalUnits === 0 ? 0 : (leasedCount / totalUnits) * 100
  const headroom =
    capPct === null || capPct === 0 || totalUnits === 0
      ? null
      : Math.max(0, Math.floor((capPct / 100) * totalUnits) - leasedCount)

  return {
    hasAssociation: true,
    capPct,
    totalUnits,
    leasedCount,
    leasedPct,
    headroom,
    waitingListCount: waitingListCount ?? 0,
    capIsMixed,
    failed,
  }
}

export interface CommunitySnapshot {
  /** Properties on file (soft-deleted excluded). */
  propertyCount: number
  /**
   * People currently in residence — property_residents rows with
   * moved_out_at NULL. A moved-out resident stays on file for the
   * property history, so counting every row would inflate the community
   * size with people who have left.
   */
  residentCount: number
  /** True when either query errored — the counts are UNKNOWN, not 0. */
  failed: boolean
}

/**
 * Roster size for the dashboard's top row: how many properties the
 * community has and how many people currently live in them.
 *
 * Deliberately does NOT compute occupancy or lease figures. The leased
 * percentage and the lease waiting list come from getLeaseSummary, which
 * is what the /leases page renders — two independent derivations of the
 * same number would eventually disagree, and the dashboard would be the
 * one people stopped trusting.
 *
 * Resident rows are intersected with the live property set so residents
 * still attached to a soft-deleted property are not counted.
 */
export async function getCommunitySnapshot(
  orgId: string,
  client?: AnyClient,
): Promise<CommunitySnapshot> {
  const supabase = await resolveClient(client)

  // Both paged to the end (BL-047). PostgREST caps every response at 1000
  // rows whatever range is asked for: the property read had no range at
  // all and the resident read's `.range(0, 19_999)` was capped just the
  // same, so both counts topped out at 1000.
  const [propsResult, residentsResult] = await Promise.all([
    readAllResult<{ id: string }>((from, to) =>
      supabase
        .from('hoa_properties')
        .select('id')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to) as never,
    ),
    readAllResult<{ id: string; property_id: string }>((from, to) =>
      supabase
        .from('property_residents' as never)
        .select('id, property_id')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .is('moved_out_at', null)
        .order('id', { ascending: true })
        .range(from, to) as never,
    ),
  ])

  const propertyIds = new Set(
    ((propsResult.data ?? []) as unknown as Array<{ id: string }>).map((p) => p.id),
  )
  const residentRows = (residentsResult.data ?? []) as unknown as Array<{
    id: string
    property_id: string
  }>

  // A failed read used to come back as zero and the dashboard tile said
  // "none on file yet". The tile now shows the count as unavailable.
  let failed = false
  for (const [table, r] of [
    ['hoa_properties', propsResult],
    ['property_residents', residentsResult],
  ] as const) {
    if (r.error) {
      logQueryError(`getCommunitySnapshot(${table})`, r.error)
      failed = true
    }
  }

  return {
    propertyCount: propertyIds.size,
    residentCount: residentRows.filter((r) => propertyIds.has(r.property_id)).length,
    failed,
  }
}

export interface ResidentQueueCounts {
  /** Support tickets still open or in progress. */
  openTickets: number
  /** ARC applications submitted or in review (awaiting a decision). */
  pendingArcRequests: number
  /** Resident-reported concerns submitted or under review. */
  openConcerns: number
  /** True when any of the three counts errored — they are UNKNOWN, not 0. */
  failed: boolean
}

// Counts of the three resident-submitted queues the board must action.
// Feeds the daily digest (and is cheap enough to surface on the dashboard).
// All three tables are org-scoped via organization_id; head:true keeps each
// query to a count with no row transfer.
export async function getResidentQueueCounts(
  orgId: string,
  client?: AnyClient,
): Promise<ResidentQueueCounts> {
  const supabase = await resolveClient(client)

  const [tickets, arc, concerns] = await Promise.all([
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .in('status', ['open', 'in_progress']),
    supabase
      .from('arc_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .in('status', ['submitted', 'in_review']),
    supabase
      .from('resident_violation_reports')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('status', ['submitted', 'under_review']),
  ])

  const failed = [tickets, arc, concerns].some((r) => {
    if (!r.error) return false
    logQueryError('getResidentQueueCounts', r.error)
    return true
  })

  return {
    openTickets: tickets.count ?? 0,
    pendingArcRequests: arc.count ?? 0,
    openConcerns: concerns.count ?? 0,
    failed,
  }
}

/**
 * How many board approvals have been pending longer than `days`.
 *
 * Deliberately NOT derived from getApprovalsInbox: that function takes the
 * newest 10 rows per source for display, and stale approvals are by
 * definition the oldest, so filtering its output reports closer to zero the
 * worse the backlog gets. These are `head: true` counts — no row transfer.
 *
 * Meeting minutes are matched on `updated_at`, mirroring the `pendingSince`
 * that getApprovalsInbox reports for that kind.
 */
export async function getStaleApprovalCount(
  orgId: string,
  days: number,
  client?: AnyClient,
): Promise<StaleApprovalCount> {
  const supabase = await resolveClient(client)
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()

  const [violations, minutes, invoices, rfps] = await Promise.all([
    supabase
      .from('hoa_violations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .not('ai_draft_letter', 'is', null)
      .is('approved_at', null)
      .lt('created_at', cutoff),

    supabase
      .from('hoa_meeting_minutes')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .neq('status', 'approved')
      .lt('updated_at', cutoff),

    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'coded')
      .lt('created_at', cutoff),

    supabase
      .from('rfps')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'draft')
      .eq('ai_generated', true)
      .lt('created_at', cutoff),
  ])

  const sources = [violations, minutes, invoices, rfps]
  const failed = sources.some((r) => {
    if (!r.error) return false
    logQueryError('getStaleApprovalCount', r.error)
    return true
  })

  return {
    count: sources.reduce((sum, r) => sum + (r.count ?? 0), 0),
    failed,
  }
}

export async function getLatestDigest(
  orgId: string,
  client?: AnyClient,
): Promise<DigestSnapshot> {
  const supabase = await resolveClient(client)
  const { data } = await supabase
    .from('hoa_digests')
    .select('content, generated_at')
    .eq('org_id', orgId)
    .maybeSingle()

  return {
    content: data?.content ?? null,
    generatedAt: data?.generated_at ?? null,
  }
}

/**
 * Build the day-cells for a 3-month rolling Compliance Heat Map.
 * For each violation cure deadline, a dues due_date, etc., we set the
 * cell color: red if overdue, yellow if within 3 days of today, green
 * if there's an event on the day but everything's clean. Days with no
 * events stay grey.
 */
export async function getComplianceHeatMap(
  orgId: string,
  client?: AnyClient,
): Promise<ComplianceHeatMapResult> {
  const supabase = await resolveClient(client)

  // assessments replaces hoa_dues for the heat map's dues lane. Query
  // is org-wide via the associations FK.
  const { data: assocs, error: assocError } = await supabase
    .from('associations')
    .select(`id, name, ${ASSOCIATION_ZONE_COLUMNS}`)
    .eq('organization_id', orgId)
  if (assocError) logQueryError('getComplianceHeatMap', assocError)
  const assocIds = (assocs ?? []).map((a) => a.id)

  // The association's today (BL-043), and the window as calendar days.
  const timeZone = zoneOf(assocs as ZoneRow[] | null)
  const todayDay = todayIn(timeZone)
  const startISO = `${todayDay.slice(0, 7)}-01`
  // Last day of the third month after this one (UTC calendar math, so the
  // machine's zone can't move it).
  const endISO = new Date(Date.UTC(Number(todayDay.slice(0, 4)), Number(todayDay.slice(5, 7)) + 3, 0))
    .toISOString()
    .slice(0, 10)

  // Paged to the end (BL-047): a capped read would leave whole red days grey.
  const duesPromise =
    assocIds.length > 0
      ? readAllResult<{ id: string; due_date: string; status: string }>((from, to) =>
          supabase
            .from('assessments')
            .select('id, due_date, status')
            .in('association_id', assocIds)
            .is('deleted_at', null)
            .gte('due_date', startISO)
            .lte('due_date', endISO)
            .order('id', { ascending: true })
            .range(from, to) as never,
        )
      : Promise.resolve({
          data: [] as { id: string; due_date: string; status: string }[],
          error: null,
        })

  const [violations, dues] = await Promise.all([
    readAllResult<{ id: string; status: string; notice_sent_at: string | null; cure_period_days: number | null }>(
      (from, to) =>
        supabase
          .from('hoa_violations')
          .select('id, status, notice_sent_at, cure_period_days')
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .not('notice_sent_at', 'is', null)
          .order('id', { ascending: true })
          .range(from, to) as never,
    ),
    duesPromise,
  ])

  const cellMap = new Map<string, DayCell>()

  function setLevel(day: string, level: DayLevel, note: string) {
    const key = day
    const existing = cellMap.get(key)
    if (!existing) {
      cellMap.set(key, { day, level, notes: [note] })
      return
    }
    // Worst level wins: red > yellow > green > grey.
    const order: Record<DayLevel, number> = { red: 3, yellow: 2, green: 1, grey: 0 }
    const newLevel = order[level] > order[existing.level] ? level : existing.level
    existing.level = newLevel
    existing.notes.push(note)
  }

  // Violation cure deadlines: a calendar day, the notice's day + N.
  for (const v of violations.data ?? []) {
    if (!v.notice_sent_at || !v.cure_period_days) continue
    const day = cureDay(v.notice_sent_at, v.cure_period_days, timeZone)
    if (!day || day < startISO || day > endISO) continue
    const daysLeft = calendarDaysBetween(todayDay, day)
    if (v.status === 'resolved' || v.status === 'cured') {
      setLevel(day, 'green', 'cure deadline (resolved)')
    } else if (daysLeft < 0) {
      setLevel(day, 'red', 'cure deadline elapsed')
    } else if (daysLeft < 3) {
      setLevel(day, 'yellow', 'cure deadline within 3 days')
    } else {
      setLevel(day, 'green', 'cure deadline')
    }
  }

  // Dues due dates. Due today is not overdue (same boundary as /dues).
  for (const d of dues.data ?? []) {
    if (!d.due_date) continue
    const day = d.due_date.slice(0, 10)
    const daysLeft = calendarDaysBetween(todayDay, day)
    if (d.status === 'paid') {
      setLevel(day, 'green', 'dues paid')
    } else if (daysLeft < 0) {
      setLevel(day, 'red', 'dues overdue')
    } else if (daysLeft < 3) {
      setLevel(day, 'yellow', 'dues due within 3 days')
    } else {
      setLevel(day, 'green', 'dues due')
    }
  }

  const failed =
    Boolean(assocError) ||
    [violations, dues].some((r) => {
      const error = (r as { error?: { code?: string; message?: string } | null }).error
      if (!error) return false
      logQueryError('getComplianceHeatMap', error)
      return true
    })

  return {
    cells: Array.from(cellMap.values()).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    failed,
    today: todayDay,
  }
}

/**
 * Union of "things that will hurt you this week if you don't act":
 *   1. Violation cure deadlines elapsing in the next 7 days (or past).
 *   2. Assessments overdue more than 30 days.
 *   3. Vendor COIs expiring within 30 days, or already expired (BL-083),
 *      for active and prospect vendors only.
 *
 * Sorted by urgency (most-overdue first), capped at 6 visible items.
 * `totalCount` reflects the full at-risk set so the UI can show overflow.
 */
export async function getAtRiskThisWeek(
  orgId: string,
  client?: AnyClient,
): Promise<AtRiskResult> {
  const supabase = await resolveClient(client)

  // Tenant-scope assessments via associations FK.
  const { data: assocs, error: assocError } = await supabase
    .from('associations')
    .select(`id, name, ${ASSOCIATION_ZONE_COLUMNS}`)
    .eq('organization_id', orgId)
  if (assocError) logQueryError('getAtRiskThisWeek', assocError)
  const assocIds = (assocs ?? []).map((a) => a.id)

  // Every offset below is whole calendar days from the association's
  // today (BL-043), not milliseconds from a UTC-midnight parse.
  const timeZone = zoneOf(assocs as ZoneRow[] | null)
  const todayISO = todayIn(timeZone)
  const in30ISO = addCalendarDays(todayISO, 30)
  const thirtyDaysAgoISO = addCalendarDays(todayISO, -30)

  // Both row reads below page to the end (BL-047): `counts` and
  // `totalCount` are stated to the board, so they cannot stop at 1000.
  const assessmentsPromise =
    assocIds.length > 0
      ? readAllResult<{
          id: string
          due_date: string
          amount: number
          status: string
          unit_id: string | null
          unit: { unit_number: string | null } | null
        }>((from, to) =>
          supabase
            .from('assessments')
            .select('id, due_date, amount, status, unit_id, unit:units(unit_number)')
            .in('association_id', assocIds)
            .is('deleted_at', null)
            .not('status', 'in', '("paid","waived","written_off")')
            .lt('due_date', thirtyDaysAgoISO)
            .order('id', { ascending: true })
            .range(from, to) as never,
        )
      : Promise.resolve({
          data: [] as {
            id: string
            due_date: string
            amount: number
            status: string
            unit_id: string | null
            unit: { unit_number: string | null } | null
          }[],
          error: null,
        })

  const [violations, assessments, cois] = await Promise.all([
    readAllResult((from, to) =>
      supabase
        .from('hoa_violations')
        .select(
          'id, description, notice_sent_at, cure_period_days, property:hoa_properties(address, unit_number)',
        )
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .eq('status', 'notice_sent')
        .not('notice_sent_at', 'is', null)
        .order('id', { ascending: true })
        .range(from, to) as never,
    ),

    assessmentsPromise,

    // No lower bound: an expired certificate stays on the list until it is
    // renewed or the vendor is made inactive (BL-083). Paged (BL-047).
    readAllResult((from, to) =>
      supabase
        .from('vendor_compliance' as never)
        .select('id, vendor_id, coi_expiration_date, vendor:vendors(legal_name, status, deleted_at)')
        .eq('organization_id', orgId)
        .not('coi_expiration_date', 'is', null)
        .lte('coi_expiration_date', in30ISO)
        .order('id', { ascending: true })
        .range(from, to) as never,
    ),
  ])

  const items: AtRiskItem[] = []

  // 1) Violation cure deadlines.
  type VRow = {
    id: string
    description: string | null
    notice_sent_at: string | null
    cure_period_days: number | null
    property: { address: string; unit_number: string | null } | null
  }
  for (const v of (violations.data ?? []) as unknown as VRow[]) {
    if (!v.notice_sent_at || !v.cure_period_days) continue
    const day = cureDay(v.notice_sent_at, v.cure_period_days, timeZone)
    if (!day) continue
    const daysOffset = calendarDaysBetween(todayISO, day)
    if (daysOffset >= 7) continue
    const place = v.property
      ? `${v.property.address}${v.property.unit_number ? ' · ' + v.property.unit_number : ''}`
      : 'Property unknown'
    items.push({
      kind: 'cure_deadline',
      id: v.id,
      title: `Cure deadline · ${place}`,
      severity: daysOffset < 0 ? 'red' : 'amber',
      daysOffset,
      href: `/violations/${v.id}`,
    })
  }

  // 2) Assessments overdue more than 30 days.
  type ARow = {
    id: string
    due_date: string
    amount: number
    status: string
    unit_id: string | null
    unit: { unit_number: string | null } | null
  }
  // DISTINCT units, not assessment rows: one unit three months behind is
  // one delinquent unit. Rows with no unit_id count individually rather
  // than collapsing into one phantom unit.
  const overdueUnitIds = new Set<string>()
  for (const a of (assessments.data ?? []) as unknown as ARow[]) {
    if (!a.due_date) continue
    const daysOffset = calendarDaysBetween(todayISO, a.due_date)
    const amt = Number(a.amount).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    })
    const unitLabel = a.unit?.unit_number ? `Unit ${a.unit.unit_number}` : 'Unit'
    overdueUnitIds.add(a.unit_id ?? `assessment:${a.id}`)
    items.push({
      kind: 'dues_overdue',
      id: a.id,
      title: `Dues overdue · ${unitLabel} · ${amt}`,
      // >60 days overdue is "this is becoming a lien" — escalate to red.
      severity: daysOffset < -60 ? 'red' : 'amber',
      daysOffset,
      // No per-assessment page exists (/accounting/assessments/[id] was a
      // 404). /dues lists every assessment with its status — same target
      // board-signals.ts uses for dues_overdue.
      href: '/dues',
    })
  }

  // 3) Vendor COIs expiring within 30 days or already expired. One row
  // per vendor (the most urgent certificate if it serves several
  // associations); inactive, blacklisted and deleted vendors are skipped.
  type CRow = {
    vendor_id: string
    coi_expiration_date: string | null
    vendor: { legal_name: string; status: string; deleted_at: string | null } | null
  }
  const coiByVendor = new Map<string, { day: string; name: string }>()
  for (const c of (cois.data ?? []) as unknown as CRow[]) {
    if (!c.coi_expiration_date || !c.vendor) continue
    if (c.vendor.deleted_at !== null || !COI_TRACKED_VENDOR_STATUSES.includes(c.vendor.status)) continue
    const day = c.coi_expiration_date.slice(0, 10)
    const prev = coiByVendor.get(c.vendor_id)
    if (!prev || day < prev.day) coiByVendor.set(c.vendor_id, { day, name: c.vendor.legal_name })
  }
  for (const [vendorId, { day, name }] of coiByVendor) {
    const daysOffset = calendarDaysBetween(todayISO, day)
    if (!Number.isFinite(daysOffset) || daysOffset > 30) continue
    items.push({
      kind: 'coi_expiring',
      id: vendorId,
      title: `${daysOffset < 0 ? 'COI expired' : 'COI expiring'} · ${name}`,
      severity: daysOffset < 0 ? 'red' : 'amber',
      daysOffset,
      href: `/vendors/${vendorId}`,
    })
  }

  // Most-overdue first.
  items.sort((a, b) => a.daysOffset - b.daysOffset)

  // Counted here, BEFORE the slice below. The slice is a render budget for
  // the At-Risk card; a caller that states a number to a board member must
  // read `counts`. The sort above runs across all three kinds at once, so
  // counting the sliced array both under-reports and can silently drop a
  // whole kind — a community with six badly overdue assessments would
  // report zero elapsed cure deadlines.
  const cureRows = items.filter((i) => i.kind === 'cure_deadline')
  const counts: AtRiskCounts = {
    duesOverdueUnits: overdueUnitIds.size,
    cureDeadlinesElapsed: cureRows.filter((i) => i.daysOffset < 0).length,
    cureDeadlinesUpcoming: cureRows.filter((i) => i.daysOffset >= 0).length,
    coiExpiring: items.filter((i) => i.kind === 'coi_expiring' && i.daysOffset >= 0).length,
    coiExpired: items.filter((i) => i.kind === 'coi_expiring' && i.daysOffset < 0).length,
  }

  const failed = Boolean(assocError) || [violations, assessments, cois].some((r) => {
    const error = (r as { error?: { code?: string; message?: string } | null }).error
    if (!error) return false
    logQueryError('getAtRiskThisWeek', error)
    return true
  })

  return { items: items.slice(0, 6), totalCount: items.length, counts, failed }
}

/**
 * Single next-up meeting card. Prefers the soonest future meeting; if
 * none, falls back to the most-recent past meeting whose minutes aren't
 * yet approved (so the manager has something actionable to surface).
 */
export async function getNextMeeting(
  orgId: string,
  client?: AnyClient,
): Promise<NextMeetingInfo | null> {
  return (await getNextMeetingResult(orgId, client)).meeting
}

/**
 * Same as getNextMeeting, but says when the read failed so the dashboard
 * never shows "No meeting scheduled" for a query that errored.
 */
export async function getNextMeetingResult(
  orgId: string,
  client?: AnyClient,
): Promise<NextMeetingResult> {
  const supabase = await resolveClient(client)
  // The association's today (BL-043); meeting_date is a calendar date.
  const todayISO = todayIn(await orgTimeZone(supabase, orgId))

  // Soonest future meeting first.
  const { data: future, error: futureError } = await supabase
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, status')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .gte('meeting_date', todayISO)
    .order('meeting_date', { ascending: true })
    .limit(1)

  if (futureError) {
    logQueryError('getNextMeeting', futureError)
    return { meeting: null, failed: true }
  }
  const pick = future?.[0]
  if (pick) {
    const daysUntil = calendarDaysBetween(todayISO, pick.meeting_date)
    return {
      meeting: {
        id: pick.id,
        meetingDate: pick.meeting_date,
        meetingType: pick.meeting_type ?? null,
        daysUntil,
        status: pick.status ?? null,
      },
      failed: false,
    }
  }

  // Fallback: most recent past meeting with un-approved minutes.
  const { data: past, error: pastError } = await supabase
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, status')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .neq('status', 'approved')
    .lt('meeting_date', todayISO)
    .order('meeting_date', { ascending: false })
    .limit(1)

  if (pastError) {
    logQueryError('getNextMeeting', pastError)
    return { meeting: null, failed: true }
  }
  const fallback = past?.[0]
  if (!fallback) return { meeting: null, failed: false }

  const daysUntil = calendarDaysBetween(todayISO, fallback.meeting_date)
  return {
    meeting: {
      id: fallback.id,
      meetingDate: fallback.meeting_date,
      meetingType: fallback.meeting_type ?? null,
      daysUntil,
      status: fallback.status ?? null,
    },
    failed: false,
  }
}

// Re-export for callers; date-fns isSameDay is the only thing imported here
// that the dashboard page needs from this module's surface.
export { isSameDay }
