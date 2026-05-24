// Cached versions of the dashboard fetchers.
//
// Why this exists: every dashboard page render fans out ~10 server-side
// queries to Supabase. Authenticated, per-user, per-org pages can't be
// edge-cached, so without caching every TTFB pays the full DB round-trip
// cost. unstable_cache memoizes server-side keyed by orgId. Two users in
// the same org share the cached result, and mutations can surgically
// bust it via revalidateTag('dashboard:<orgId>').
//
// The underlying fetchers in charts.ts / queries.ts each take an
// optional client. We pass createAdminClient() (no cookies) so
// unstable_cache can actually memoize — the standard server client
// reads cookies which would make every key request-unique.
//
// SAFETY:
//   - Admin client bypasses RLS, but we only enter this code path after
//     the page has already resolved the user's org via getCurrentOrg().
//     Two users in the same org should see the same dashboard data
//     (counts, sums, charts — none of it is per-user-restricted).
//   - The TTL bounds any worst-case staleness/leak window.
//   - Per-user data (drafts, "your assignments") is intentionally NOT
//     cached here — those are still called via the cookie-bound path.
//
// Tags:
//   `dashboard:${orgId}` — all dashboard cache entries for an org. Bust
//   from any mutation lib via revalidateTag(`dashboard:${orgId}`).

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getDashboardKpis,
  getThirtyDayActivity,
  getVendorComplianceDonut,
  getViolationStatusDonut,
} from './charts'
import {
  getApprovalsInbox,
  getAtRiskThisWeek,
  getComplianceHeatMap,
  getLatestDigest,
  getLeaseSummary,
  getNextMeeting,
} from './queries'

type AnyClient = SupabaseClient<any, any, any>

// 30s is the sweet spot for HOA workloads: users hitting the dashboard
// in quick succession during a board meeting will share warm cache, but
// after a mutation the next dashboard load (3-5s later) refreshes via
// revalidateTag. If the tag bust is dropped (e.g. background job
// mutation), the worst-case stale window is 30s.
const TTL_SEC = 30

function dashboardTag(orgId: string): string {
  return `dashboard:${orgId}`
}

function adminClient(): AnyClient {
  return createAdminClient() as unknown as AnyClient
}

// Tag for "anything dashboard-shaped under this org." Exported so
// mutation libs can call revalidateTag(DASHBOARD_TAG(org.id)).
export function DASHBOARD_TAG(orgId: string): string {
  return dashboardTag(orgId)
}

// ─── KPI heroes ─────────────────────────────────────────────────────

export const getCachedDashboardKpis = (orgId: string) =>
  unstable_cache(
    () => getDashboardKpis(orgId, adminClient()),
    ['dashboard-kpis', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()

// ─── Donuts ─────────────────────────────────────────────────────────

export const getCachedViolationStatusDonut = (orgId: string) =>
  unstable_cache(
    () => getViolationStatusDonut(orgId, adminClient()),
    ['violation-donut', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()

export const getCachedVendorComplianceDonut = (orgId: string) =>
  unstable_cache(
    () => getVendorComplianceDonut(orgId, adminClient()),
    ['vendor-compliance-donut', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()

// ─── 30-day activity ────────────────────────────────────────────────

export const getCachedThirtyDayActivity = (orgId: string) =>
  unstable_cache(
    () => getThirtyDayActivity(orgId, adminClient()),
    ['thirty-day-activity', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()

// ─── Approvals inbox ────────────────────────────────────────────────

export const getCachedApprovalsInbox = (orgId: string) =>
  unstable_cache(
    () => getApprovalsInbox(orgId, adminClient()),
    ['approvals-inbox', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()

// ─── At-risk this week ──────────────────────────────────────────────

export const getCachedAtRiskThisWeek = (orgId: string) =>
  unstable_cache(
    () => getAtRiskThisWeek(orgId, adminClient()),
    ['at-risk-week', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()

// ─── Lease summary ──────────────────────────────────────────────────

export const getCachedLeaseSummary = (orgId: string) =>
  unstable_cache(
    () => getLeaseSummary(orgId, adminClient()),
    ['lease-summary', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()

// ─── Next meeting ───────────────────────────────────────────────────

export const getCachedNextMeeting = (orgId: string) =>
  unstable_cache(
    () => getNextMeeting(orgId, adminClient()),
    ['next-meeting', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()

// ─── Compliance heat map ────────────────────────────────────────────

export const getCachedComplianceHeatMap = (orgId: string) =>
  unstable_cache(
    () => getComplianceHeatMap(orgId, adminClient()),
    ['compliance-heatmap', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()

// ─── Latest digest ──────────────────────────────────────────────────

export const getCachedLatestDigest = (orgId: string) =>
  unstable_cache(
    () => getLatestDigest(orgId, adminClient()),
    ['latest-digest', orgId],
    { revalidate: TTL_SEC, tags: [dashboardTag(orgId)] },
  )()
