import { cache } from 'react'
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
import { STALE_APPROVAL_DAYS } from '@/lib/dashboard/board-signals'
import {
  getDashboardKpis,
  getThirtyDayActivity,
  getTicketCategoryDonut,
  getViolationStatusDonut,
} from '@/lib/dashboard/charts'
import { getTriageSnapshot } from '@/lib/dashboard/triage'
import { countNewSince, readBaseline, todayISO } from '@/lib/dashboard/digest-facts'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { timed } from '@/lib/perf/timing'

/**
 * The dashboard's loaders, timed and memoized per request (BL-099).
 *
 * The dashboard streams each card on its own (app/(dashboard)/page.tsx):
 * a card renders as soon as ITS data is in, instead of every card waiting
 * for the slowest of fifteen reads. Several cards share a source — the
 * "Needs attention" row and the at-risk card both read getAtRiskThisWeek —
 * so each loader is wrapped in React `cache()`: the first card to ask
 * starts the read, the others await the same promise. Still one query per
 * source per request, exactly as before.
 *
 * Every function here is the same query with the same arguments the page
 * used to call directly; only the timing log and the memo are new.
 */
const R = '/'

export const dashboardKpis = cache((orgId: string) => timed(R, 'dashboard.kpis', () => getDashboardKpis(orgId)))
export const violationDonut = cache((orgId: string) =>
  timed(R, 'dashboard.violationDonut', () => getViolationStatusDonut(orgId)),
)
export const ticketDonut = cache((orgId: string) =>
  timed(R, 'dashboard.ticketDonut', () => getTicketCategoryDonut(orgId)),
)
export const thirtyDayActivity = cache((orgId: string) =>
  timed(R, 'dashboard.activity', () => getThirtyDayActivity(orgId)),
)
export const approvalsInbox = cache((orgId: string) =>
  timed(R, 'dashboard.approvals', () => getApprovalsInbox(orgId)),
)
export const atRiskThisWeek = cache((orgId: string) => timed(R, 'dashboard.atRisk', () => getAtRiskThisWeek(orgId)))
export const nextMeeting = cache((orgId: string) =>
  timed(R, 'dashboard.nextMeeting', () => getNextMeetingResult(orgId)),
)
export const leaseSummary = cache((orgId: string) => timed(R, 'dashboard.lease', () => getLeaseSummary(orgId)))
export const latestDigest = cache((orgId: string) => timed(R, 'dashboard.digest', () => getLatestDigest(orgId)))
export const complianceHeatMap = cache((orgId: string) =>
  timed(R, 'dashboard.heatMap', () => getComplianceHeatMap(orgId)),
)
export const triageSnapshot = cache((orgId: string) =>
  timed(R, 'dashboard.triage', async () => getTriageSnapshot(await getSupabaseServerClient(), orgId)),
)
export const communitySnapshot = cache((orgId: string) =>
  timed(R, 'dashboard.community', () => getCommunitySnapshot(orgId)),
)
export const residentQueueCounts = cache((orgId: string) =>
  timed(R, 'dashboard.residentQueues', () => getResidentQueueCounts(orgId)),
)
export const staleApprovalCount = cache((orgId: string) =>
  timed(R, 'dashboard.staleApprovals', () => getStaleApprovalCount(orgId, STALE_APPROVAL_DAYS)),
)
/** "New since this morning" — two dependent reads (baseline, then counts). */
export const newSinceBaseline = cache((orgId: string) =>
  timed(R, 'dashboard.newSince', async () => {
    const supabase = await getSupabaseServerClient()
    const baseline = await readBaseline(supabase, orgId, todayISO())
    return baseline !== null ? countNewSince(supabase, orgId, baseline.capturedAt) : null
  }),
)
