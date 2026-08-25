/**
 * What in this community needs the BOARD, as opposed to the manager.
 *
 * Every headline here is assembled from numbers already computed in SQL by
 * the dashboard's own queries. The model that ranks these signals is never
 * asked to produce a figure — it selects, orders and explains. That is the
 * same guarantee `generateDigestSuggestion` makes about the digest's one
 * sentence, extended to the insight list: a wrong number cannot reach a
 * board member because no number on the card originates with the model.
 *
 * This module is deliberately pure. It takes data the dashboard page has
 * already fetched and returns rows — no Supabase client, no awaits. The
 * thresholds below are the whole editorial policy of the feature, and a
 * pure function is the only way to test them without a database.
 */

import type { AtRiskResult, LeaseSummary, ResidentQueueCounts, StaleApprovalCount } from './queries'
import type { DashboardKpis } from './charts'
import type { TriageSnapshot } from './triage'

// ─── Thresholds ──────────────────────────────────────────────────────
//
// Exported so the tests pin behaviour AT the boundary rather than at a
// number copied into the test file, which would keep passing after
// someone edits the threshold here.

/** Percent rise in outstanding dues over the KPI window worth a mention. */
export const DUES_TREND_MIN_PCT = 15
/** Below this the percentage swing is noise on a trivially small balance. */
export const DUES_TREND_MIN_USD = 500
/** Percent rise in open violations over the KPI window worth a mention. */
export const VIOLATION_TREND_MIN_PCT = 25
/** Below this a "+50%" is two violations becoming three. */
export const VIOLATION_TREND_MIN_COUNT = 5
/** Lease slots remaining under the cap before the board should hear about it. */
export const LEASE_HEADROOM_THRESHOLD = 1
/** ARC applications awaiting a decision before it reads as a backlog. */
export const ARC_BACKLOG_THRESHOLD = 3
/** Open maintenance tickets before it reads as a backlog. */
export const OPEN_TICKET_THRESHOLD = 10
/** Days an approval may sit pending before the board is the bottleneck. */
export const STALE_APPROVAL_DAYS = 14
/** Unmatched inbox threads before the property mapping needs attention. */
export const UNTRIAGED_THRESHOLD = 5

export type SignalKind =
  | 'dues_overdue'
  | 'dues_trend'
  | 'cure_deadline'
  | 'coi_expiring'
  | 'violations_trend'
  | 'lease_cap'
  | 'waiting_list'
  | 'arc_backlog'
  | 'ticket_backlog'
  | 'resident_concerns'
  | 'stale_approvals'
  | 'untriaged_mail'

/** Red = already breached; amber = heading that way; info = worth knowing. */
export type SignalSeverity = 'red' | 'amber' | 'info'

export interface BoardSignal {
  kind: SignalKind
  /** Complete sentence with its figures baked in. Never model-authored. */
  headline: string
  href: string
  severity: SignalSeverity
}

export interface BoardSignalsInput {
  /**
   * Counts only — deliberately NOT the whole AtRiskResult. `items` is a
   * six-row render list sliced after a sort that runs across all three
   * kinds, and counting it is exactly the bug this narrowing makes
   * unrepresentable: it under-reported every headline and could drop a
   * red legal-exposure signal entirely.
   */
  atRisk: Pick<AtRiskResult, 'counts' | 'failed'>
  staleApprovals: StaleApprovalCount
  lease: LeaseSummary
  residentQueues: ResidentQueueCounts
  kpis: DashboardKpis
  triage: TriageSnapshot
}

const SEVERITY_ORDER: Record<SignalSeverity, number> = { red: 0, amber: 1, info: 2 }

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

function usd(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`
}

/**
 * Percent change, or null when there is no comparable baseline. A previous
 * value of zero yields null rather than Infinity — "up ∞%" is not a fact a
 * board can act on.
 */
function pctChange(value: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null
  return Math.round(((value - previous) / previous) * 100)
}

/**
 * Every signal currently firing, most severe first. Nothing is capped here:
 * the caller decides how many reach the card, and the model decides which.
 */
export function buildBoardSignals(input: BoardSignalsInput): BoardSignal[] {
  const signals: BoardSignal[] = []

  // Every block below is guarded by its source's `failed` flag. A query
  // that errored returns zeros, and a zero from a failed query means
  // UNKNOWN — rendering it as "nothing is overdue" is the one kind of
  // false reassurance a board card must never give. Only `triage` used to
  // carry this flag; the rest were added when this feature promoted them
  // into a card whose entire premise is that silence means all clear.

  // ─── Money ─────────────────────────────────────────────────────────

  const atRisk = input.atRisk.failed ? null : input.atRisk.counts

  if (atRisk !== null && atRisk.duesOverdueUnits > 0) {
    signals.push({
      kind: 'dues_overdue',
      headline: `${atRisk.duesOverdueUnits} ${plural(atRisk.duesOverdueUnits, 'unit is', 'units are')} more than 30 days behind on dues`,
      href: '/dues',
      severity: 'red',
    })
  }

  const kpis = input.kpis.failed ? null : input.kpis

  const duesPct =
    kpis === null
      ? null
      : pctChange(kpis.duesOutstandingUsd.value, kpis.duesOutstandingUsd.previous)
  if (
    kpis !== null &&
    duesPct !== null &&
    duesPct >= DUES_TREND_MIN_PCT &&
    kpis.duesOutstandingUsd.value >= DUES_TREND_MIN_USD
  ) {
    signals.push({
      kind: 'dues_trend',
      headline: `Dues outstanding up ${duesPct}% over the last 30 days, now ${usd(kpis.duesOutstandingUsd.value)}`,
      href: '/dues',
      severity: 'amber',
    })
  }

  // ─── Compliance ────────────────────────────────────────────────────

  if (atRisk !== null && atRisk.cureDeadlinesElapsed > 0) {
    // A deadline the association let slip is a different conversation from
    // one coming up, so the elapsed count wins the slot outright rather
    // than being folded into a combined total.
    signals.push({
      kind: 'cure_deadline',
      headline: `${atRisk.cureDeadlinesElapsed} violation cure ${plural(atRisk.cureDeadlinesElapsed, 'deadline has', 'deadlines have')} already elapsed`,
      href: '/violations',
      severity: 'red',
    })
  } else if (atRisk !== null && atRisk.cureDeadlinesUpcoming > 0) {
    signals.push({
      kind: 'cure_deadline',
      headline: `${atRisk.cureDeadlinesUpcoming} violation cure ${plural(atRisk.cureDeadlinesUpcoming, 'deadline falls', 'deadlines fall')} within the week`,
      href: '/violations',
      severity: 'amber',
    })
  }

  if (atRisk !== null && atRisk.coiExpiring > 0) {
    signals.push({
      kind: 'coi_expiring',
      headline: `${atRisk.coiExpiring} vendor ${plural(atRisk.coiExpiring, 'certificate of insurance expires', 'certificates of insurance expire')} within 30 days`,
      href: '/vendors',
      severity: 'amber',
    })
  }

  const violationPct =
    kpis === null ? null : pctChange(kpis.openViolations.value, kpis.openViolations.previous)
  if (
    kpis !== null &&
    violationPct !== null &&
    violationPct >= VIOLATION_TREND_MIN_PCT &&
    kpis.openViolations.value >= VIOLATION_TREND_MIN_COUNT
  ) {
    signals.push({
      kind: 'violations_trend',
      headline: `Open violations up ${violationPct}% over the last 30 days, now ${kpis.openViolations.value}`,
      href: '/violations',
      severity: 'amber',
    })
  }

  // ─── Leasing ───────────────────────────────────────────────────────

  const { lease } = input
  // A failed leased-count query returns 0, which computes as MAXIMUM
  // headroom — the signal would go quiet on exactly the day the community
  // breaches its cap.
  if (
    !lease.failed &&
    lease.hasAssociation &&
    lease.capPct !== null &&
    lease.headroom !== null &&
    lease.headroom <= LEASE_HEADROOM_THRESHOLD
  ) {
    const mixed = lease.capIsMixed ? ' (most restrictive cap)' : ''
    signals.push({
      kind: 'lease_cap',
      headline:
        lease.headroom === 0
          ? `Lease cap reached: ${lease.leasedCount} of ${lease.totalUnits} units leased against a ${lease.capPct}% cap${mixed}`
          : `Lease cap nearly reached: ${lease.headroom} ${plural(lease.headroom, 'slot', 'slots')} left under the ${lease.capPct}% cap${mixed}`,
      href: '/leases',
      severity: lease.headroom === 0 ? 'red' : 'amber',
    })
  }

  if (!lease.failed && lease.waitingListCount > 0) {
    signals.push({
      kind: 'waiting_list',
      headline: `${lease.waitingListCount} ${plural(lease.waitingListCount, 'property is', 'properties are')} queued on the lease waiting list`,
      href: '/leases',
      severity: 'info',
    })
  }

  // ─── Resident queues ───────────────────────────────────────────────

  const residentQueues = input.residentQueues.failed
    ? { openTickets: 0, pendingArcRequests: 0, openConcerns: 0 }
    : input.residentQueues

  if (residentQueues.pendingArcRequests >= ARC_BACKLOG_THRESHOLD) {
    signals.push({
      kind: 'arc_backlog',
      headline: `${residentQueues.pendingArcRequests} architectural ${plural(residentQueues.pendingArcRequests, 'request is', 'requests are')} awaiting a decision`,
      href: '/arc',
      severity: 'amber',
    })
  }

  if (residentQueues.openTickets >= OPEN_TICKET_THRESHOLD) {
    signals.push({
      kind: 'ticket_backlog',
      headline: `${residentQueues.openTickets} maintenance tickets are still open`,
      href: '/tickets',
      severity: 'amber',
    })
  }

  if (residentQueues.openConcerns > 0) {
    signals.push({
      kind: 'resident_concerns',
      headline: `${residentQueues.openConcerns} resident-reported ${plural(residentQueues.openConcerns, 'concern is', 'concerns are')} under review`,
      href: '/violations',
      severity: 'amber',
    })
  }

  // ─── Board process ─────────────────────────────────────────────────

  // Counted by a dedicated query rather than by filtering the approvals
  // inbox: that inbox takes the NEWEST 10 rows per source, and stale
  // approvals are by definition the oldest — so the worse the backlog got,
  // the closer the old implementation reported to zero.
  const { staleApprovals } = input
  if (!staleApprovals.failed && staleApprovals.count > 0) {
    signals.push({
      kind: 'stale_approvals',
      headline: `${staleApprovals.count} board ${plural(staleApprovals.count, 'approval has', 'approvals have')} been pending over ${STALE_APPROVAL_DAYS} days`,
      href: '/',
      severity: 'red',
    })
  }

  // A failed triage query means the counts are UNKNOWN. Reporting the zero
  // it defaults to — or the partial number it returned — would be inventing
  // a fact, which is the one thing this card must never do.
  if (!input.triage.failed && input.triage.untriaged.count >= UNTRIAGED_THRESHOLD) {
    signals.push({
      kind: 'untriaged_mail',
      headline: `${input.triage.untriaged.count} emails are not matched to any property`,
      href: '/inbox',
      severity: 'amber',
    })
  }

  // Stable within a severity band: the push order above is the editorial
  // order (money, then compliance, then leasing, then queues), and a stable
  // sort preserves it so the list does not reshuffle between refreshes.
  return signals.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
