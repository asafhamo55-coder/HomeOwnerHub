// Chart-shaped data fetchers for the redesigned dashboard.
// Each returns plain JSON (no recharts types) so the page component
// stays a server component and only the chart wrappers run client-side.
//
// Every function takes an optional `client` so the cached wrappers in
// ./cached.ts can pass an admin-client (no cookies, so unstable_cache
// can memoize) while the original cookie-bound code path keeps working
// for any other caller.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllResult } from '@/lib/supabase/read-all'
import { addCalendarDays, dayOf, instantAtLocalTime, todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'

type AnyClient = SupabaseClient<any, any, any>

async function resolveClient(client?: AnyClient): Promise<AnyClient> {
  return client ?? ((await getSupabaseServerClient()) as unknown as AnyClient)
}

export interface DonutSegment {
  label: string
  value: number
  /** Semantic colour token. The client-side donut maps these to fills.
   *  Each tone is visually distinct so two adjacent segments are
   *  always tellable apart — see TONE_FILL in StatusDonut.tsx. */
  tone:
    | 'primary'      // blue — waiting on board / new
    | 'warning'      // amber — waiting on resident / soon
    | 'success'      // emerald — resolved positive (cured)
    | 'muted'        // slate — closed / archival
    | 'destructive'  // red — fined / non-compliant
    | 'severe'       // violet — escalated / legal hearing
}

export interface DonutData {
  segments: DonutSegment[]
  total: number
  /**
   * True when the source query errored. `segments` is then empty and
   * `total` 0 — an UNKNOWN, not "nothing on file". The dashboard renders
   * a failed state instead of the empty state.
   */
  failed: boolean
}

export interface ActivityBucket {
  /** YYYY-MM-DD */
  date: string
  /** Numeric counts grouped on that day. */
  violations: number
  arc: number
  invitations: number
}

export interface ActivityData {
  buckets: ActivityBucket[]
  /** True when any source query errored — the zeros are not facts. */
  failed: boolean
}

export interface KpiTrend {
  value: number
  /** Same-shape value for the previous comparable period (e.g. 30 days
   *  ago) so the UI can render the delta + arrow. NULL when we don't
   *  have a comparable baseline yet. */
  previous: number | null
}

export interface DashboardKpis {
  duesOutstandingUsd: KpiTrend
  openViolations: KpiTrend
  activeVendors: KpiTrend
  openTickets: KpiTrend
  /**
   * True when any source query errored. Each KPI falls back to 0 on
   * failure, and a 0 that means "the query broke" is indistinguishable
   * from a 0 that means "nothing is outstanding" without this.
   */
  failed: boolean
}

// ─── Donut: violations by status ────────────────────────────────────

export async function getViolationStatusDonut(
  orgId: string,
  client?: AnyClient,
): Promise<DonutData> {
  const supabase = await resolveClient(client)
  // Every chart here counts rows, so every row read pages to the end
  // (BL-047): PostgREST caps a response at 1000 rows, and a donut summed
  // from a capped read shows a smaller community with no sign of it.
  const { data, error } = await readAllResult<{ status: string | null }>((from, to) =>
    supabase
      .from('hoa_violations')
      .select('id, status')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, to) as never,
  )
  if (error) {
    console.error('getViolationStatusDonut failed', { code: error.code, message: error.message })
    return { segments: [], total: 0, failed: true }
  }

  const rows = (data ?? []) as Array<{ status: string | null }>
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const s = r.status ?? 'unknown'
    counts[s] = (counts[s] ?? 0) + 1
  }

  // Each violation state gets its own tone so adjacent slices on the
  // donut are always distinguishable. The progression mirrors the
  // lifecycle: board action → resident cure window → outcome.
  // The first five are the statuses hoa_violations' CHECK constraint
  // allows today; `notice_drafted` and `waived` used to be missing, so
  // those violations silently vanished from the total. The legacy keys
  // after them are kept so an older row still counts.
  const SEG_ORDER: Array<[string, DonutSegment['tone'], string]> = [
    ['open', 'primary', 'Open'],            // blue — needs board review
    ['notice_drafted', 'primary', 'Notice drafted'],
    ['notice_sent', 'warning', 'Notice sent'], // amber — cure window
    ['waived', 'muted', 'Waived'],
    ['cured', 'success', 'Cured'],          // emerald — resident fixed
    ['resolved', 'muted', 'Resolved'],      // slate — closed / archival
    ['fined', 'destructive', 'Fined'],      // red — monetary penalty
    ['escalated', 'severe', 'Escalated'],   // violet — legal / hearing
  ]

  const segments: DonutSegment[] = []
  for (const [key, tone, label] of SEG_ORDER) {
    if ((counts[key] ?? 0) > 0) segments.push({ label, value: counts[key], tone })
  }
  const total = segments.reduce((acc, s) => acc + s.value, 0)
  return { segments, total, failed: false }
}

// ─── Donut: tickets by category ─────────────────────────────────────

export async function getTicketCategoryDonut(
  orgId: string,
  client?: AnyClient,
): Promise<DonutData> {
  const supabase = await resolveClient(client)
  const { data, error } = await readAllResult<{ category: string | null }>((from, to) =>
    supabase
      .from('tickets' as never)
      .select('id, category')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, to) as never,
  )
  if (error) {
    console.error('getTicketCategoryDonut failed', { code: error.code, message: error.message })
    return { segments: [], total: 0, failed: true }
  }

  const rows = (data ?? []) as unknown as Array<{ category: string | null }>
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const c = r.category ?? 'other'
    counts[c] = (counts[c] ?? 0) + 1
  }

  const CAT_ORDER: Array<[string, DonutSegment['tone'], string]> = [
    ['maintenance', 'primary', 'Maintenance'],
    ['noise', 'warning', 'Noise'],
    ['parking', 'severe', 'Parking'],
    ['common_area', 'success', 'Common area'],
    ['billing', 'destructive', 'Billing'],
    ['access', 'muted', 'Access'],
    ['safety', 'warning', 'Safety'],
    ['general', 'primary', 'General'],
    ['other', 'muted', 'Other'],
  ]

  const segments: DonutSegment[] = []
  for (const [key, tone, label] of CAT_ORDER) {
    if ((counts[key] ?? 0) > 0) segments.push({ label, value: counts[key], tone })
  }
  const total = segments.reduce((acc, s) => acc + s.value, 0)
  return { segments, total, failed: false }
}

// ─── 30-day activity bar ────────────────────────────────────────────

export async function getThirtyDayActivity(
  orgId: string,
  client?: AnyClient,
): Promise<ActivityData> {
  const supabase = await resolveClient(client)
  // Days are the association's (BL-043): a violation logged at 9pm
  // Eastern belongs to that day's bar, not the next UTC day's.
  const timeZone = await orgTimeZone(supabase, orgId)
  const firstDay = addCalendarDays(todayIn(timeZone), -29)
  const startIso = instantAtLocalTime(firstDay, 0, timeZone).toISOString()

  // Initialize empty buckets for every day in the 30-day window so the
  // chart shows a continuous x-axis even when nothing happened.
  const buckets = new Map<string, ActivityBucket>()
  for (let i = 0; i < 30; i++) {
    const key = addCalendarDays(firstDay, i)
    buckets.set(key, { date: key, violations: 0, arc: 0, invitations: 0 })
  }

  const [violsRes, arcsRes, invitesRes] = await Promise.all([
    readAllResult<{ created_at: string }>((from, to) =>
      supabase
        .from('hoa_violations')
        .select('id, created_at')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .gte('created_at', startIso)
        .order('id', { ascending: true })
        .range(from, to) as never,
    ),
    readAllResult<{ submitted_at: string }>((from, to) =>
      supabase
        .from('arc_requests' as never)
        .select('id, submitted_at')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .gte('submitted_at', startIso)
        .order('id', { ascending: true })
        .range(from, to) as never,
    ),
    readAllResult<{ created_at: string }>((from, to) =>
      supabase
        .from('vendor_onboarding_invitations' as never)
        .select('id, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', startIso)
        .order('id', { ascending: true })
        .range(from, to) as never,
    ),
  ])

  const failed = [violsRes, arcsRes, invitesRes].some((r) => {
    if (!r.error) return false
    console.error('getThirtyDayActivity failed', { code: r.error.code, message: r.error.message })
    return true
  })
  const viols = violsRes.data
  const arcs = arcsRes.data
  const invites = invitesRes.data

  for (const r of (viols ?? []) as Array<{ created_at: string }>) {
    const bucket = buckets.get(dayOf(r.created_at, timeZone) ?? '')
    if (bucket) bucket.violations += 1
  }
  for (const r of (arcs ?? []) as unknown as Array<{ submitted_at: string }>) {
    const bucket = buckets.get(dayOf(r.submitted_at, timeZone) ?? '')
    if (bucket) bucket.arc += 1
  }
  for (const r of (invites ?? []) as unknown as Array<{ created_at: string }>) {
    const bucket = buckets.get(dayOf(r.created_at, timeZone) ?? '')
    if (bucket) bucket.invitations += 1
  }

  return { buckets: Array.from(buckets.values()), failed }
}

// ─── KPI heroes ─────────────────────────────────────────────────────

export async function getDashboardKpis(
  orgId: string,
  client?: AnyClient,
): Promise<DashboardKpis> {
  const supabase = await resolveClient(client)

  const today = new Date()
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30)
  // due_date is a calendar date: compare it with the association's
  // calendar day 30 days ago, not a UTC-midnight parse (BL-043).
  const thirtyDaysAgoDay = addCalendarDays(todayIn(await orgTimeZone(supabase, orgId), today), -30)

  // Outstanding dues — sum of remaining unpaid balance across all
  // assessments rows. Replaces the legacy hoa_dues path which is no
  // longer being written to (assessments is the table the /dues/new
  // form and materialize action populate).
  //
  // "Previous" = balance that was outstanding 30+ days ago, used by
  // the KPI trend arrow.
  // A KPI that falls back to 0 on error reads as "nothing is outstanding".
  // Consumers that state these numbers to a board need to tell the two
  // apart. Code and message only — PostgrestError.details can carry row
  // values.
  let failed = false
  const note = (error: { code?: string; message?: string } | null): void => {
    if (!error) return
    console.error('getDashboardKpis failed', { code: error.code, message: error.message })
    failed = true
  }

  let duesNow = 0
  let duesPrev = 0
  const { data: assessmentRows, error: assessmentsError } = await readAllResult<{
    amount: number | string | null
    status: string | null
    due_date: string | null
    payments: { amount: number | string }[]
  }>((from, to) =>
    supabase
      .from('assessments')
      .select('id, amount, status, due_date, payments(amount)')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .neq('status', 'paid')
      .neq('status', 'waived')
      .neq('status', 'written_off')
      .order('id', { ascending: true })
      .range(from, to) as never,
  )
  note(assessmentsError)
  if (assessmentRows) {
    for (const r of assessmentRows as Array<{
      amount: number | string | null
      status: string | null
      due_date: string | null
      payments: { amount: number | string }[]
    }>) {
      const paid = (r.payments ?? []).reduce(
        (s, p) => s + Number(p.amount), 0,
      )
      const remainder = Math.max(Number(r.amount ?? 0) - paid, 0)
      if (remainder <= 0) continue
      duesNow += remainder
      if (r.due_date && r.due_date.slice(0, 10) < thirtyDaysAgoDay) duesPrev += remainder
    }
  }

  // Open violations (current count).
  const { count: violationsNow, error: violationsNowError } = await supabase
    .from('hoa_violations')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .in('status', ['open', 'notice_sent'])
  note(violationsNowError)
  const { count: violationsPrev, error: violationsPrevError } = await supabase
    .from('hoa_violations')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .in('status', ['open', 'notice_sent'])
    .lt('created_at', thirtyDaysAgo.toISOString())
  note(violationsPrevError)

  const { count: activeVendors, error: vendorsError } = await supabase
    .from('vendors' as never)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'active')
  note(vendorsError)

  const { count: openTickets, error: ticketsError } = await supabase
    .from('tickets' as never)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)
  note(ticketsError)

  return {
    duesOutstandingUsd: { value: duesNow, previous: duesPrev || null },
    openViolations: {
      value: violationsNow ?? 0,
      previous: violationsPrev ?? null,
    },
    activeVendors: { value: activeVendors ?? 0, previous: null },
    openTickets: { value: openTickets ?? 0, previous: null },
    failed,
  }
}
