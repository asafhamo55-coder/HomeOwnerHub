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
}

// ─── Donut: violations by status ────────────────────────────────────

export async function getViolationStatusDonut(
  orgId: string,
  client?: AnyClient,
): Promise<DonutData> {
  const supabase = await resolveClient(client)
  const { data } = await supabase
    .from('hoa_violations')
    .select('status')
    .eq('org_id', orgId)
    .is('deleted_at', null)

  const rows = (data ?? []) as Array<{ status: string | null }>
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const s = r.status ?? 'unknown'
    counts[s] = (counts[s] ?? 0) + 1
  }

  // Each violation state gets its own tone so adjacent slices on the
  // donut are always distinguishable. The progression mirrors the
  // lifecycle: board action → resident cure window → outcome.
  const SEG_ORDER: Array<[string, DonutSegment['tone'], string]> = [
    ['open', 'primary', 'Open'],            // blue — needs board review
    ['notice_sent', 'warning', 'Notice sent'], // amber — cure window
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
  return { segments, total }
}

// ─── Donut: tickets by category ─────────────────────────────────────

export async function getTicketCategoryDonut(
  orgId: string,
  client?: AnyClient,
): Promise<DonutData> {
  const supabase = await resolveClient(client)
  const { data } = await supabase
    .from('tickets' as never)
    .select('category')
    .eq('organization_id', orgId)
    .is('deleted_at', null)

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
  return { segments, total }
}

// ─── 30-day activity bar ────────────────────────────────────────────

export async function getThirtyDayActivity(
  orgId: string,
  client?: AnyClient,
): Promise<ActivityData> {
  const supabase = await resolveClient(client)
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - 29)
  start.setUTCHours(0, 0, 0, 0)
  const startIso = start.toISOString()

  // Initialize empty buckets for every day in the 30-day window so the
  // chart shows a continuous x-axis even when nothing happened.
  const buckets = new Map<string, ActivityBucket>()
  for (let i = 0; i < 30; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    buckets.set(key, { date: key, violations: 0, arc: 0, invitations: 0 })
  }

  const [{ data: viols }, { data: arcs }, { data: invites }] = await Promise.all([
    supabase
      .from('hoa_violations')
      .select('created_at')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .gte('created_at', startIso),
    supabase
      .from('arc_requests' as never)
      .select('submitted_at')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .gte('submitted_at', startIso),
    supabase
      .from('vendor_onboarding_invitations' as never)
      .select('created_at')
      .eq('organization_id', orgId)
      .gte('created_at', startIso),
  ])

  for (const r of (viols ?? []) as Array<{ created_at: string }>) {
    const k = r.created_at.slice(0, 10)
    const bucket = buckets.get(k)
    if (bucket) bucket.violations += 1
  }
  for (const r of (arcs ?? []) as unknown as Array<{ submitted_at: string }>) {
    const k = r.submitted_at.slice(0, 10)
    const bucket = buckets.get(k)
    if (bucket) bucket.arc += 1
  }
  for (const r of (invites ?? []) as unknown as Array<{ created_at: string }>) {
    const k = r.created_at.slice(0, 10)
    const bucket = buckets.get(k)
    if (bucket) bucket.invitations += 1
  }

  return { buckets: Array.from(buckets.values()) }
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

  // Outstanding dues — sum of remaining unpaid balance across all
  // assessments rows. Replaces the legacy hoa_dues path which is no
  // longer being written to (assessments is the table the /dues/new
  // form and materialize action populate).
  //
  // "Previous" = balance that was outstanding 30+ days ago, used by
  // the KPI trend arrow.
  let duesNow = 0
  let duesPrev = 0
  const { data: assessmentRows } = await supabase
    .from('assessments')
    .select('amount, status, due_date, payments(amount)')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .neq('status', 'paid')
    .neq('status', 'waived')
    .neq('status', 'written_off')
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
      const due = r.due_date ? new Date(r.due_date) : null
      if (due && due < thirtyDaysAgo) duesPrev += remainder
    }
  }

  // Open violations (current count).
  const { count: violationsNow } = await supabase
    .from('hoa_violations')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .in('status', ['open', 'notice_sent'])
  const { count: violationsPrev } = await supabase
    .from('hoa_violations')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .in('status', ['open', 'notice_sent'])
    .lt('created_at', thirtyDaysAgo.toISOString())

  const { count: activeVendors } = await supabase
    .from('vendors' as never)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'active')

  const { count: openTickets } = await supabase
    .from('tickets' as never)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)

  return {
    duesOutstandingUsd: { value: duesNow, previous: duesPrev || null },
    openViolations: {
      value: violationsNow ?? 0,
      previous: violationsPrev ?? null,
    },
    activeVendors: { value: activeVendors ?? 0, previous: null },
    openTickets: { value: openTickets ?? 0, previous: null },
  }
}
