'use server'

// Aggregates everything the resident "My Home" dashboard needs in one
// call, ordered by priority: things that need the resident's action
// (open violations against their unit, outstanding dues) come first,
// followed by their in-flight submissions (open tickets, pending ARC).
//
// Every query is scoped to the units the signed-in user actually owns.
// The underlying tables (assessments, hoa_violations, payments) use an
// org-wide RLS policy — a resident can technically read the whole
// community's rows — so the unit/property filters here are what keep a
// resident from seeing a neighbour's dues or violations.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import {
  countNewAnnouncements,
  fetchMyAnnouncementRows,
  getAnnouncementsLastViewedAt,
  type ReaderIdentity,
} from '@/lib/resident-announcements'
import { getResidentUnits, type ResidentUnit } from '@/lib/resident'
import { loadMyTickets, type TicketRow } from '@/lib/resident-tickets'
import { loadMyArcRequests, type ArcRequestRow } from '@/lib/resident-submissions'
import { loadOrFail } from '@/lib/load-or-fail'
import { buildLedger, loadLedgerRows, loadUnappliedCredits, type Ledger } from '@/lib/resident-ledger'
import { todayIn } from '@/lib/association-time'
import { chargeWindow, scopeAssessments, scopeLedgerRows, type ChargeWindow } from '@/lib/resident-sale-window'
import {
  emptyResidentDues,
  residentTimeZone,
  summarizeResidentDues,
  type ResidentAssessmentRow,
  type ResidentDues,
} from '@/lib/resident-dues'

// Violation statuses that mean "closed" — anything else is still open
// against the resident. Excluding terminal states (rather than
// whitelisting open ones) keeps this correct even if the status
// vocabulary drifts.
const CLOSED_VIOLATION_STATUSES = ['resolved', 'dismissed', 'waived']

export interface OpenViolationRow {
  id: string
  violation_type: string
  description: string
  status: string
  severity: string | null
  fine_amount: number | null
  cure_period_days: number | null
  notice_sent_at: string | null
  created_at: string | null
}

export type { ResidentCharge, ResidentDues } from '@/lib/resident-dues'

export interface ResidentDashboard {
  /** First name for the greeting; falls back to the email local-part. */
  firstName: string | null
  units: ResidentUnit[]
  associationName: string | null
  /** The active HOA org (scopes browser-remembered UI such as the first-week card). */
  orgId: string | null
  orgName: string | null
  recentAnnouncements: number
  openViolations: OpenViolationRow[]
  dues: ResidentDues
  /** Tickets still open or in progress (closed ones are dropped). */
  openTickets: TicketRow[]
  /** ARC applications awaiting a board decision. */
  pendingArc: ArcRequestRow[]
  /**
   * Which reads failed. A failed read leaves its field at the empty value,
   * which on its own would render as "You're all caught up" — callers must
   * check these before stating anything about the account.
   */
  failed: { dues: boolean; violations: boolean; requests: boolean }
}

type Supabase = SupabaseClient<Database>

export async function getResidentDashboard(): Promise<ResidentDashboard> {
  // Three independent reads, together (BL-099; they ran one after another).
  const [actor, org, units] = await Promise.all([getResidentActor(), getCurrentOrg(), getResidentUnits()])
  const supabase = actor.client

  // Impersonation-safe: scope on the actor's identity (the service-role
  // client used while impersonating has no auth session of its own).
  const actorUser = actor.id ? { id: actor.id, email: actor.email } : null

  const unitIds = units.map((u) => u.unit_id)
  const today = todayIn(residentTimeZone(units))

  const [firstName, openViolations, dues, tickets, arc, recentAnnouncements] = await Promise.all([
    resolveFirstName(supabase, actorUser),
    getOpenViolations(supabase, unitIds, actor.orgId),
    getDues(supabase, unitIds, actor.orgId, today, chargeWindow(units)),
    loadMyTickets(),
    loadMyArcRequests(),
    getRecentAnnouncements(supabase, org?.id ?? null, {
      unitIds,
      userId: actor.id,
      email: actor.email,
    }),
  ])

  const associationName =
    units.map((u) => u.association_name).find((n): n is string => n != null && n !== '') ?? null

  return {
    firstName,
    units,
    associationName,
    orgId: org?.id ?? null,
    orgName: org?.name ?? null,
    recentAnnouncements,
    openViolations: openViolations ?? [],
    dues: dues ?? emptyResidentDues(today),
    openTickets: tickets.ok
      ? tickets.data.filter((t) => t.status === 'open' || t.status === 'in_progress')
      : [],
    pendingArc: arc.ok
      ? arc.data.filter((a) => a.status === 'submitted' || a.status === 'in_review')
      : [],
    failed: {
      dues: dues === null,
      violations: openViolations === null,
      requests: !tickets.ok || !arc.ok,
    },
  }
}

/**
 * Just the dues slice of the dashboard (units + open charges), for screens
 * that don't need tickets, ARC or announcements (Pay, ledger, statement).
 */
export async function getResidentDues(): Promise<{
  units: ResidentUnit[]
  dues: ResidentDues
  failed: boolean
}> {
  const [actor, units] = await Promise.all([getResidentActor(), getResidentUnits()])
  const today = todayIn(residentTimeZone(units))
  const dues = await getDues(actor.client, units.map((u) => u.unit_id), actor.orgId, today, chargeWindow(units))
  return { units, dues: dues ?? emptyResidentDues(today), failed: dues === null }
}

/**
 * The resident's full ledger (every charge, payment and credit on their
 * units, running balance). Read with the actor's client, so 0061's resident
 * policies bound it — see tests/integration/security/resident-ledger-rls.test.ts.
 */
export async function getResidentLedger(): Promise<{
  units: ResidentUnit[]
  ledger: Ledger | null
  truncated: boolean
}> {
  const [actor, units] = await Promise.all([getResidentActor(), getResidentUnits()])
  const rows = await loadLedgerRows(actor.client, units.map((u) => u.unit_id), actor.orgId)
  if (!rows.ok) return { units, ledger: null, truncated: false }
  // A buyer sees their ownership's history only (resident-sale-window.ts).
  const zone = residentTimeZone(units)
  const scoped = scopeLedgerRows(rows.assessments, rows.payments, chargeWindow(units), zone)
  // BL-177: unapplied credit (none, and no query, before M7_APPLIED).
  const credits = await loadUnappliedCredits(actor.client, units.map((u) => u.unit_id), actor.orgId)
  if (!credits.ok) return { units, ledger: null, truncated: false }
  return {
    units,
    ledger: buildLedger(scoped.assessments, scoped.payments, zone, credits.credits),
    truncated: rows.truncated,
  }
}

/** Name and email for the printed statement's "Prepared for" line. */
export async function getResidentIdentity(): Promise<{ name: string | null; email: string | null }> {
  const actor = await getResidentActor()
  if (!actor.id) return { name: actor.displayName, email: actor.email ?? null }
  const { data, error } = await actor.client
    .from('profiles')
    .select('full_name')
    .eq('id', actor.id)
    .maybeSingle<{ full_name: string | null }>()
  const fullName = error ? null : data?.full_name?.trim() || null
  return { name: fullName ?? actor.displayName, email: actor.email ?? null }
}

async function resolveFirstName(
  supabase: Supabase,
  user: { id: string; email?: string | null } | null,
): Promise<string | null> {
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle<{ full_name: string | null }>()
  const fullName = data?.full_name?.trim() || null
  if (fullName) return fullName.split(/\s+/)[0] ?? null
  return user.email ? user.email.split('@')[0] : null
}

// Violations are keyed by hoa_properties.id; a resident's units link to
// that legacy id via units.legacy_hoa_property_id. Resolve the property
// ids first, then pull unresolved violations for them.
// Null means a read failed — the violations are UNKNOWN, not none.
// `orgId` is the impersonation org (service-role client, no RLS): when set,
// every read here is confined to it. Null = RLS-bound client.
async function getOpenViolations(
  supabase: Supabase,
  unitIds: string[],
  orgId: string | null,
): Promise<OpenViolationRow[] | null> {
  if (unitIds.length === 0) return []

  let unitQuery = supabase.from('units' as never).select('legacy_hoa_property_id').in('id' as never, unitIds)
  if (orgId) unitQuery = unitQuery.eq('organization_id' as never, orgId)
  const unitResult = await loadOrFail('resident unit properties', unitQuery)
  if (!unitResult.ok) return null
  const unitRows = unitResult.data

  const propertyIds = [
    ...new Set(
      ((unitRows ?? []) as unknown as Array<{ legacy_hoa_property_id: string | null }>)
        .map((u) => u.legacy_hoa_property_id)
        .filter((id): id is string => id != null),
    ),
  ]
  if (propertyIds.length === 0) return []

  let violationQuery = supabase
    .from('hoa_violations')
    .select(
      'id, violation_type, description, status, severity, fine_amount, cure_period_days, notice_sent_at, created_at',
    )
    .in('property_id', propertyIds)
    .not('status', 'in', `(${CLOSED_VIOLATION_STATUSES.map((s) => `"${s}"`).join(',')})`)
  if (orgId) violationQuery = violationQuery.eq('org_id', orgId)
  const result = await loadOrFail(
    'resident open violations',
    violationQuery.order('created_at', { ascending: false }).limit(20),
  )
  if (!result.ok) return null
  return (result.data ?? []) as unknown as OpenViolationRow[]
}

// Outstanding dues across every owned unit. Sums open/partial
// assessments and subtracts any payments already applied so partials
// report the true remaining balance.
// Null means a read failed: the balance is UNKNOWN. Returning EMPTY_DUES
// here is what used to tell a resident "You're all paid up" on a timeout.
async function getDues(
  supabase: Supabase,
  unitIds: string[],
  orgId: string | null,
  /** The association's today (BL-043) — not the UTC day. */
  today: string,
  /** Per-unit first visible day: a buyer never sees the seller's charges. */
  window: ChargeWindow,
): Promise<ResidentDues | null> {
  if (unitIds.length === 0) return emptyResidentDues(today)

  let assessmentQuery = supabase
    .from('assessments')
    .select('id, unit_id, amount, due_date, status, assessment_type, memo_code')
    .in('unit_id', unitIds)
    .in('status', ['open', 'partial'])
    .is('deleted_at', null)
  if (orgId) assessmentQuery = assessmentQuery.eq('organization_id', orgId)
  const assessmentResult = await loadOrFail('resident dues', assessmentQuery)
  if (!assessmentResult.ok) return null
  const rows = assessmentResult.data

  const assessments = scopeAssessments((rows ?? []) as ResidentAssessmentRow[], window)
  if (assessments.length === 0) return emptyResidentDues(today)

  // Without payments every partial charge would read as owed in full.
  let paymentQuery = supabase
    .from('payments')
    .select('assessment_id, amount')
    .in(
      'assessment_id',
      assessments.map((a) => a.id),
    )
  if (orgId) paymentQuery = paymentQuery.eq('organization_id', orgId)
  const paymentResult = await loadOrFail('resident payments', paymentQuery)
  if (!paymentResult.ok) return null
  const payRows = paymentResult.data

  const paidByAssessment = new Map<string, number>()
  for (const p of (payRows ?? []) as Array<{ assessment_id: string | null; amount: number }>) {
    if (!p.assessment_id) continue
    paidByAssessment.set(p.assessment_id, (paidByAssessment.get(p.assessment_id) ?? 0) + Number(p.amount))
  }

  return summarizeResidentDues(assessments, paidByAssessment, today)
}

/**
 * Announcements addressed to THIS reader that arrived since they last
 * opened the page. Was a count of every communication the org sent in 30
 * days, which showed a Madison Park owner "15 new" above a list of 3 — see
 * resident-announcements.ts.
 */
async function getRecentAnnouncements(
  supabase: Supabase,
  orgId: string | null,
  identity: ReaderIdentity,
): Promise<number> {
  if (!orgId) return 0
  const [rows, lastViewedAt] = await Promise.all([
    fetchMyAnnouncementRows(supabase as never, orgId, identity),
    getAnnouncementsLastViewedAt(supabase as never, identity.userId),
  ])
  return countNewAnnouncements(rows, lastViewedAt)
}
