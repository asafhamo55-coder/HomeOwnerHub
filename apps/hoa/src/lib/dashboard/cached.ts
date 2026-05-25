// Cached versions of the dashboard fetchers (v2 — module-scoped pattern).
//
// v1 (commit 988f26c) broke prod with a runtime error because each call
// to the exported getter re-invoked `unstable_cache(...)()` inside an
// arrow factory. That pattern is unsupported — Next.js docs require
// the unstable_cache wrapper to be created ONCE at module scope, with
// dynamic inputs passed as function arguments (which Next includes in
// the implicit cache key alongside `keyParts`).
//
// v2 follows the canonical pattern:
//   1. ONE unstable_cache call per fetcher, at module scope.
//   2. orgId is a function ARGUMENT — not closed over.
//   3. createAdminClient() runs INSIDE the cached function — no
//      closure capture of a SupabaseClient (which is non-serializable
//      and would corrupt cache identity if captured).
//   4. Tags are STATIC at wrap time. Per-org tag invalidation isn't
//      supported by unstable_cache options, so we use a single static
//      'dashboard' tag. revalidatePath('/') from mutation libs is the
//      primary invalidation; the 5s TTL is the safety net.
//
// SAFETY:
//   - Admin client bypasses RLS, but we only enter this code path after
//     the page has already resolved the user's org via getCurrentOrg().
//     Two users in the same org should see the same dashboard data
//     (counts, sums, charts — none of it is per-user-restricted).
//   - 5s TTL bounds any worst-case staleness/leak window.

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

// 5s TTL — matches the previous cached.ts setting. Short enough that
// a user navigating back to the dashboard sees current data within a
// session, long enough to dedupe within a single render's Promise.all
// when multiple call sites end up requesting the same orgId.
const TTL_SEC = 5

// Static tag — revalidateTag('dashboard') busts ALL cached dashboard
// entries (across all orgs). Acceptable because each mutation
// originates in a single org context, and the cross-org busting only
// costs the other orgs one fresh fetch on their next view.
const DASHBOARD_TAG = 'dashboard'

// Exported so mutation libs can call revalidateTag(DASHBOARD_TAG_ALL).
// Same value as DASHBOARD_TAG above — exported as a stable name.
export const DASHBOARD_TAG_ALL = DASHBOARD_TAG

// Helper that constructs a fresh admin client. Called INSIDE each
// cached function (not captured in closure).
function admin(): AnyClient {
  return createAdminClient() as unknown as AnyClient
}

// ─── KPI heroes ─────────────────────────────────────────────────────

const _kpis = unstable_cache(
  async (orgId: string) => getDashboardKpis(orgId, admin()),
  ['dashboard-kpis-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedDashboardKpis(orgId: string) {
  return _kpis(orgId)
}

// ─── Donuts ─────────────────────────────────────────────────────────

const _violationDonut = unstable_cache(
  async (orgId: string) => getViolationStatusDonut(orgId, admin()),
  ['violation-donut-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedViolationStatusDonut(orgId: string) {
  return _violationDonut(orgId)
}

const _vendorDonut = unstable_cache(
  async (orgId: string) => getVendorComplianceDonut(orgId, admin()),
  ['vendor-compliance-donut-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedVendorComplianceDonut(orgId: string) {
  return _vendorDonut(orgId)
}

// ─── 30-day activity ────────────────────────────────────────────────

const _activity = unstable_cache(
  async (orgId: string) => getThirtyDayActivity(orgId, admin()),
  ['thirty-day-activity-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedThirtyDayActivity(orgId: string) {
  return _activity(orgId)
}

// ─── Approvals inbox ────────────────────────────────────────────────

const _approvals = unstable_cache(
  async (orgId: string) => getApprovalsInbox(orgId, admin()),
  ['approvals-inbox-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedApprovalsInbox(orgId: string) {
  return _approvals(orgId)
}

// ─── At-risk this week ──────────────────────────────────────────────

const _atRisk = unstable_cache(
  async (orgId: string) => getAtRiskThisWeek(orgId, admin()),
  ['at-risk-week-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedAtRiskThisWeek(orgId: string) {
  return _atRisk(orgId)
}

// ─── Lease summary ──────────────────────────────────────────────────

const _lease = unstable_cache(
  async (orgId: string) => getLeaseSummary(orgId, admin()),
  ['lease-summary-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedLeaseSummary(orgId: string) {
  return _lease(orgId)
}

// ─── Next meeting ───────────────────────────────────────────────────

const _nextMeeting = unstable_cache(
  async (orgId: string) => getNextMeeting(orgId, admin()),
  ['next-meeting-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedNextMeeting(orgId: string) {
  return _nextMeeting(orgId)
}

// ─── Compliance heat map ────────────────────────────────────────────

const _heatMap = unstable_cache(
  async (orgId: string) => getComplianceHeatMap(orgId, admin()),
  ['compliance-heatmap-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedComplianceHeatMap(orgId: string) {
  return _heatMap(orgId)
}

// ─── Latest digest ──────────────────────────────────────────────────

const _digest = unstable_cache(
  async (orgId: string) => getLatestDigest(orgId, admin()),
  ['latest-digest-v2'],
  { revalidate: TTL_SEC, tags: [DASHBOARD_TAG] },
)
export function getCachedLatestDigest(orgId: string) {
  return _digest(orgId)
}
