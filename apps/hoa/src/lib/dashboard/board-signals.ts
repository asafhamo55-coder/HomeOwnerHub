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

import type {
  ApprovalsInbox,
  AtRiskResult,
  LeaseSummary,
  ResidentQueueCounts,
} from './queries'
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

const MS_PER_DAY = 86_400_000

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
  atRisk: AtRiskResult
  approvals: ApprovalsInbox
  lease: LeaseSummary
  residentQueues: ResidentQueueCounts
  kpis: DashboardKpis
  triage: TriageSnapshot
  now?: Date
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
  const now = input.now ?? new Date()
  const signals: BoardSignal[] = []

  // ─── Money ─────────────────────────────────────────────────────────

  const duesOverdue = input.atRisk.items.filter((i) => i.kind === 'dues_overdue')
  if (duesOverdue.length > 0) {
    signals.push({
      kind: 'dues_overdue',
      headline: `${duesOverdue.length} ${plural(duesOverdue.length, 'unit is', 'units are')} more than 30 days behind on dues`,
      href: '/dues',
      severity: 'red',
    })
  }

  const duesPct = pctChange(
    input.kpis.duesOutstandingUsd.value,
    input.kpis.duesOutstandingUsd.previous,
  )
  if (
    duesPct !== null &&
    duesPct >= DUES_TREND_MIN_PCT &&
    input.kpis.duesOutstandingUsd.value >= DUES_TREND_MIN_USD
  ) {
    signals.push({
      kind: 'dues_trend',
      headline: `Dues outstanding up ${duesPct}% over the last 30 days, now ${usd(input.kpis.duesOutstandingUsd.value)}`,
      href: '/dues',
      severity: 'amber',
    })
  }

  // ─── Compliance ────────────────────────────────────────────────────

  const cureDeadlines = input.atRisk.items.filter((i) => i.kind === 'cure_deadline')
  if (cureDeadlines.length > 0) {
    // daysOffset is negative once the deadline has passed. A deadline the
    // association let slip is a different conversation from one coming up.
    const elapsed = cureDeadlines.filter((i) => i.daysOffset < 0).length
    signals.push(
      elapsed > 0
        ? {
            kind: 'cure_deadline',
            headline: `${elapsed} violation cure ${plural(elapsed, 'deadline has', 'deadlines have')} already elapsed`,
            href: '/violations',
            severity: 'red',
          }
        : {
            kind: 'cure_deadline',
            headline: `${cureDeadlines.length} violation cure ${plural(cureDeadlines.length, 'deadline falls', 'deadlines fall')} within the week`,
            href: '/violations',
            severity: 'amber',
          },
    )
  }

  const cois = input.atRisk.items.filter((i) => i.kind === 'coi_expiring')
  if (cois.length > 0) {
    signals.push({
      kind: 'coi_expiring',
      headline: `${cois.length} vendor ${plural(cois.length, 'certificate of insurance expires', 'certificates of insurance expire')} within 30 days`,
      href: '/vendors',
      severity: 'amber',
    })
  }

  const violationPct = pctChange(
    input.kpis.openViolations.value,
    input.kpis.openViolations.previous,
  )
  if (
    violationPct !== null &&
    violationPct >= VIOLATION_TREND_MIN_PCT &&
    input.kpis.openViolations.value >= VIOLATION_TREND_MIN_COUNT
  ) {
    signals.push({
      kind: 'violations_trend',
      headline: `Open violations up ${violationPct}% over the last 30 days, now ${input.kpis.openViolations.value}`,
      href: '/violations',
      severity: 'amber',
    })
  }

  // ─── Leasing ───────────────────────────────────────────────────────

  const { lease } = input
  if (
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
          : `Lease cap nearly reached: ${lease.headroom} slot left under the ${lease.capPct}% cap${mixed}`,
      href: '/leases',
      severity: lease.headroom === 0 ? 'red' : 'amber',
    })
  }

  if (lease.waitingListCount > 0) {
    signals.push({
      kind: 'waiting_list',
      headline: `${lease.waitingListCount} ${plural(lease.waitingListCount, 'property is', 'properties are')} queued on the lease waiting list`,
      href: '/leases',
      severity: 'info',
    })
  }

  // ─── Resident queues ───────────────────────────────────────────────

  const { residentQueues } = input
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

  const stale = input.approvals.items.filter((i) => {
    if (i.pendingSince === null) return false
    const since = new Date(i.pendingSince).getTime()
    if (Number.isNaN(since)) return false
    return (now.getTime() - since) / MS_PER_DAY > STALE_APPROVAL_DAYS
  })
  if (stale.length > 0) {
    signals.push({
      kind: 'stale_approvals',
      headline: `${stale.length} board ${plural(stale.length, 'approval has', 'approvals have')} been pending over ${STALE_APPROVAL_DAYS} days`,
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
