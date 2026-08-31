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
import { listMyTickets, type TicketRow } from '@/lib/resident-tickets'
import { listMyArcRequests, type ArcRequestRow } from '@/lib/resident-submissions'

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

/** One outstanding charge on a resident's account, net of partial payments. */
export interface ResidentCharge {
  /** Assessment id. */
  id: string
  /** Owning unit id, so a multi-unit resident can tell charges apart. */
  unitId: string
  /** e.g. "regular", "special", "late_fee", "fine" — humanized in the UI. */
  assessmentType: string
  /** ISO yyyy-mm-dd. */
  dueDate: string
  /** Remaining owed on this charge, net of any partial payment. */
  amount: number
  /** Already past its due date as of today. */
  pastDue: boolean
}

export interface ResidentDues {
  /** Total still owed across every owned unit (net of partial payments). */
  balance: number
  /** Number of unpaid/partially-paid assessments. */
  openCount: number
  /** How many of those are already past their due date. */
  pastDueCount: number
  /** Earliest upcoming/overdue due date, ISO yyyy-mm-dd, or null. */
  nextDueDate: string | null
  /** Every outstanding charge, most urgent first (past-due, oldest first). */
  charges: ResidentCharge[]
}

export interface ResidentDashboard {
  /** First name for the greeting; falls back to the email local-part. */
  firstName: string | null
  units: ResidentUnit[]
  associationName: string | null
  orgName: string | null
  recentAnnouncements: number
  openViolations: OpenViolationRow[]
  dues: ResidentDues
  /** Tickets still open or in progress (closed ones are dropped). */
  openTickets: TicketRow[]
  /** ARC applications awaiting a board decision. */
  pendingArc: ArcRequestRow[]
}

type Supabase = SupabaseClient<Database>

const EMPTY_DUES: ResidentDues = {
  balance: 0,
  openCount: 0,
  pastDueCount: 0,
  nextDueDate: null,
  charges: [],
}

export async function getResidentDashboard(): Promise<ResidentDashboard> {
  const actor = await getResidentActor()
  const supabase = actor.client
  const org = await getCurrentOrg()

  // Impersonation-safe: scope on the actor's identity (the service-role
  // client used while impersonating has no auth session of its own).
  const actorUser = actor.id ? { id: actor.id, email: actor.email } : null
  const units = await getResidentUnits()

  const unitIds = units.map((u) => u.unit_id)

  const [firstName, openViolations, dues, tickets, arc, recentAnnouncements] = await Promise.all([
    resolveFirstName(supabase, actorUser),
    getOpenViolations(supabase, unitIds),
    getDues(supabase, unitIds),
    listMyTickets(),
    listMyArcRequests(),
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
    orgName: org?.name ?? null,
    recentAnnouncements,
    openViolations,
    dues,
    openTickets: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress'),
    pendingArc: arc.filter((a) => a.status === 'submitted' || a.status === 'in_review'),
  }
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
async function getOpenViolations(supabase: Supabase, unitIds: string[]): Promise<OpenViolationRow[]> {
  if (unitIds.length === 0) return []

  const { data: unitRows } = await supabase
    .from('units' as never)
    .select('legacy_hoa_property_id')
    .in('id' as never, unitIds)

  const propertyIds = [
    ...new Set(
      ((unitRows ?? []) as unknown as Array<{ legacy_hoa_property_id: string | null }>)
        .map((u) => u.legacy_hoa_property_id)
        .filter((id): id is string => id != null),
    ),
  ]
  if (propertyIds.length === 0) return []

  const { data } = await supabase
    .from('hoa_violations')
    .select(
      'id, violation_type, description, status, severity, fine_amount, cure_period_days, notice_sent_at, created_at',
    )
    .in('property_id', propertyIds)
    .not('status', 'in', `(${CLOSED_VIOLATION_STATUSES.map((s) => `"${s}"`).join(',')})`)
    .order('created_at', { ascending: false })
    .limit(20)

  return (data ?? []) as unknown as OpenViolationRow[]
}

// Outstanding dues across every owned unit. Sums open/partial
// assessments and subtracts any payments already applied so partials
// report the true remaining balance.
async function getDues(supabase: Supabase, unitIds: string[]): Promise<ResidentDues> {
  if (unitIds.length === 0) return EMPTY_DUES

  const { data: rows } = await supabase
    .from('assessments')
    .select('id, unit_id, amount, due_date, status, assessment_type')
    .in('unit_id', unitIds)
    .in('status', ['open', 'partial'])
    .is('deleted_at', null)

  const assessments = (rows ?? []) as Array<{
    id: string
    unit_id: string
    amount: number
    due_date: string
    status: string
    assessment_type: string
  }>
  if (assessments.length === 0) return EMPTY_DUES

  const { data: payRows } = await supabase
    .from('payments')
    .select('assessment_id, amount')
    .in(
      'assessment_id',
      assessments.map((a) => a.id),
    )

  const paidByAssessment = new Map<string, number>()
  for (const p of (payRows ?? []) as Array<{ assessment_id: string | null; amount: number }>) {
    if (!p.assessment_id) continue
    paidByAssessment.set(p.assessment_id, (paidByAssessment.get(p.assessment_id) ?? 0) + Number(p.amount))
  }

  const today = new Date().toISOString().slice(0, 10)
  let balance = 0
  let openCount = 0
  let pastDueCount = 0
  let nextDueDate: string | null = null
  const charges: ResidentCharge[] = []

  for (const a of assessments) {
    const remaining = Number(a.amount) - (paidByAssessment.get(a.id) ?? 0)
    if (remaining <= 0) continue
    const pastDue = Boolean(a.due_date && a.due_date <= today)
    balance += remaining
    openCount++
    if (pastDue) pastDueCount++
    if (a.due_date && (nextDueDate === null || a.due_date < nextDueDate)) nextDueDate = a.due_date
    charges.push({
      id: a.id,
      unitId: a.unit_id,
      assessmentType: a.assessment_type,
      dueDate: a.due_date,
      amount: Math.round(remaining * 100) / 100,
      pastDue,
    })
  }

  // Most urgent first: past-due charges (oldest due date leading), then
  // upcoming charges ordered by due date.
  charges.sort((x, y) => {
    if (x.pastDue !== y.pastDue) return x.pastDue ? -1 : 1
    return x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : 0
  })

  return { balance: Math.round(balance * 100) / 100, openCount, pastDueCount, nextDueDate, charges }
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
