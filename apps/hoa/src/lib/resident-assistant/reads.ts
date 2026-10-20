/**
 * BL-096 — the resident assistant's reads.
 *
 * Every function here takes a ResidentScope: the signed-in resident's OWN
 * (RLS-bound) Supabase client, their org, their user id and email, and the
 * units they own or live in (resolved by getResidentUnits, the same lookup
 * the Dues and Requests screens use). Nothing here can be pointed at
 * another owner:
 *
 *   1. RLS on the resident's client is the boundary (0061 for money,
 *      0063 for the rest).
 *   2. Every query also filters on the scope's units / user id / org.
 *   3. Every returned row is checked against the scope AGAIN before it is
 *      shaped, so a looser policy or a dropped filter still cannot widen
 *      what the model sees. The unit test drives these with a fake client
 *      that ignores every filter and returns a neighbour's rows too.
 *
 * Outputs are small, camelCase, money in integer cents, and carry no
 * names, emails, phones or free text written by other people (no ticket
 * bodies, no violation descriptions, no "about" addresses).
 *
 * No 'use server', no Next imports and relative imports only:
 * tests/integration/security/resident-assistant-scope.test.ts imports this
 * with a real resident JWT client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { loadLedgerRows } from '../resident-ledger'
import { chargeWindow, scopeLedgerRows } from '../resident-sale-window'
import { residentTimeZone, summarizeResidentDues } from '../resident-dues'
import { chargeTypeLabel } from '../assessment-labels'
import { buildRecipientIdentityFilters, pickRowPerCommunication, type RecipientRow } from '../communications/resident-scope'
import { resolveForDisplay } from '../communications/display'
import { fetchResidentMeetings, ResidentMeetingsLoadError, type MeetingsClient } from '../resident-meetings/query'
import { todayIn } from '../association-time'
import { propertyIdsForUnits } from '../properties/resolve'

/** The slice of ResidentUnit (lib/resident.ts) the assistant needs. */
export interface AssistantUnit {
  unit_id: string
  unit_number?: string | null
  address?: string | null
  association_id: string | null
  association_name?: string | null
  association_time_zone?: string | null
  charges_from?: string | null
}

export interface ResidentScope {
  /** The resident's own RLS-bound client. Never service role. */
  db: SupabaseClient<Database>
  /** The current org. Every read is confined to it. */
  orgId: string
  userId: string | null
  email: string | null
  units: AssistantUnit[]
  /**
   * Which tickets and ARC applications readMyRequests returns. Omitted (the
   * resident assistant) means the ones this user submitted. 'unit' is the
   * board's inbox drafter (BL-101 A2): every one filed against the scope's
   * units, whoever submitted it, read on the BOARD's RLS client. Build
   * that scope with unitScope(), never by hand.
   */
  requestsBy?: 'submitter' | 'unit'
}

/**
 * A one-home scope for board-side callers (the inbox drafter and context
 * rail). `db` must be the board member's own RLS client, never service
 * role. No user id or email: nothing here is read "as" a resident, and
 * reported concerns (keyed on the reporter) are left out.
 */
export function unitScope(input: {
  db: SupabaseClient<Database>
  orgId: string
  unitIds: string[]
  timeZone: string
  /**
   * The first day of charges the sender may be told about, when the
   * home's current ownership began with a recorded sale
   * (resident-sale-window.ts). Null/omitted = the whole unit history.
   */
  chargesFrom?: string | null
}): ResidentScope {
  return {
    db: input.db,
    orgId: input.orgId,
    userId: null,
    email: null,
    units: input.unitIds.map((unit_id) => ({
      unit_id,
      association_id: null,
      association_time_zone: input.timeZone,
      charges_from: input.chargesFrom ?? null,
    })),
    requestsBy: 'unit',
  }
}

/** A read failed: the answer is UNKNOWN, never empty. Carries a code only. */
export class ScopeReadFailed extends Error {
  constructor(
    readonly what: string,
    readonly dbCode?: string,
  ) {
    super(`resident assistant read failed: ${what}`)
    this.name = 'ScopeReadFailed'
  }
}

function codeOf(error: unknown): string | undefined {
  const c = (error as { code?: unknown } | null)?.code
  return typeof c === 'string' ? c : undefined
}

const cents = (n: number | string | null | undefined): number => {
  const v = Number(n ?? 0)
  return Number.isFinite(v) ? Math.round(v * 100) : 0
}

function unitIdsOf(scope: ResidentScope): string[] {
  return [...new Set(scope.units.map((u) => u.unit_id).filter(Boolean))]
}

function unitLabel(scope: ResidentScope, unitId: string | null): string | null {
  if (!unitId) return null
  const u = scope.units.find((x) => x.unit_id === unitId)
  // The resident's own home: their address is theirs to see.
  return u ? (u.unit_number ?? u.address ?? null) : null
}

export function scopeToday(scope: ResidentScope, now: Date = new Date()): { today: string; timeZone: string } {
  const timeZone = residentTimeZone(scope.units)
  return { today: todayIn(timeZone, now), timeZone }
}

// ─── my_account ──────────────────────────────────────────────────────

export interface MyAccount {
  homes: number
  /** What is still owed on open charges, net of partial payments. */
  balanceCents: number
  openChargeCount: number
  pastDueCount: number
  /** Earliest due date among open charges, YYYY-MM-DD, or null. */
  nextDueDate: string | null
  /** Most urgent first, at most 10. */
  openCharges: Array<{ type: string; dueDate: string; amountCents: number; pastDue: boolean; home: string | null }>
  lastPayment: { date: string; amountCents: number } | null
  /** The association's today the past-due flags were judged against. */
  today: string
  /** True when the ledger read hit its row cap: totals may be incomplete. */
  truncated: boolean
}

export async function readMyAccount(scope: ResidentScope, now: Date = new Date()): Promise<MyAccount> {
  const unitIds = unitIdsOf(scope)
  const { today, timeZone } = scopeToday(scope, now)
  const empty: MyAccount = {
    homes: unitIds.length,
    balanceCents: 0,
    openChargeCount: 0,
    pastDueCount: 0,
    nextDueDate: null,
    openCharges: [],
    lastPayment: null,
    today,
    truncated: false,
  }
  if (unitIds.length === 0) return empty

  const rows = await loadLedgerRows(scope.db, unitIds, scope.orgId)
  if (!rows.ok) throw new ScopeReadFailed('ledger')

  // Belt and braces (header, point 3).
  const mine = new Set(unitIds)
  const assessments = rows.assessments.filter((a) => mine.has(a.unit_id))
  const assessmentIds = new Set(assessments.map((a) => a.id))
  const payments = rows.payments.filter(
    (p) => (p.unit_id !== null && mine.has(p.unit_id)) || (p.assessment_id !== null && assessmentIds.has(p.assessment_id)),
  )

  // A buyer never sees the seller's charges (resident-sale-window.ts).
  const scoped = scopeLedgerRows(assessments, payments, chargeWindow(scope.units), timeZone)

  const paidByAssessment = new Map<string, number>()
  for (const p of scoped.payments) {
    if (!p.assessment_id) continue
    paidByAssessment.set(p.assessment_id, (paidByAssessment.get(p.assessment_id) ?? 0) + Number(p.amount))
  }
  const open = scoped.assessments.filter((a) => a.status === 'open' || a.status === 'partial')
  const dues = summarizeResidentDues(open, paidByAssessment, today)

  const last = [...scoped.payments].sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0]

  return {
    homes: unitIds.length,
    balanceCents: cents(dues.balance),
    openChargeCount: dues.openCount,
    pastDueCount: dues.pastDueCount,
    nextDueDate: dues.nextDueDate,
    openCharges: dues.charges.slice(0, 10).map((c) => ({
      type: chargeTypeLabel(c.assessmentType),
      dueDate: c.dueDate,
      amountCents: cents(c.amount),
      pastDue: c.pastDue,
      home: scope.units.length > 1 ? unitLabel(scope, c.unitId) : null,
    })),
    lastPayment: last ? { date: last.paid_at.slice(0, 10), amountCents: cents(last.amount) } : null,
    today,
    truncated: rows.truncated,
  }
}

/**
 * The active (or proposed) payment plan on the resident's homes.
 *
 * payment_plans is board-only under 0061, so on a resident's client this
 * usually returns nothing. `visible: false` then means "can't see", not
 * "no plan": the assistant must say it can't see plan details.
 */
export async function readMyPaymentPlan(
  scope: ResidentScope,
): Promise<
  | { visible: true; plan: { status: string; installmentCents: number; installments: number; totalCents: number; startDate: string } }
  | { visible: false }
> {
  const unitIds = unitIdsOf(scope)
  if (unitIds.length === 0) return { visible: false }
  const { data, error } = await scope.db
    .from('payment_plans')
    .select('unit_id, organization_id, status, installment_amount, installment_count, total_amount, start_date, created_at')
    .in('unit_id', unitIds)
    .eq('organization_id', scope.orgId)
    .in('status', ['active', 'proposed'])
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) return { visible: false }
  const mine = new Set(unitIds)
  const row = (data ?? []).find((r) => mine.has(r.unit_id) && r.organization_id === scope.orgId)
  if (!row) return { visible: false }
  return {
    visible: true,
    plan: {
      status: row.status,
      installmentCents: cents(row.installment_amount),
      installments: row.installment_count,
      totalCents: cents(row.total_amount),
      startDate: row.start_date,
    },
  }
}

// ─── my_requests ─────────────────────────────────────────────────────

const CLOSED_VIOLATION_STATUSES = new Set(['resolved', 'dismissed', 'waived'])
const LIST_LIMIT = 20

export interface MyRequests {
  tickets: Array<{ id: string; subject: string; category: string; status: string; createdAt: string; home: string | null }>
  arcApplications: Array<{ id: string; summary: string; category: string; status: string; submittedAt: string; decidedAt: string | null }>
  /** Open violations recorded against the resident's own homes. */
  violationsOnMyHome: Array<{
    id: string
    type: string
    status: string
    fineCents: number | null
    curePeriodDays: number | null
    noticeSentAt: string | null
    createdAt: string | null
  }>
  /** Concerns the resident reported. Category and status only. */
  reportedConcerns: Array<{ id: string; category: string; status: string; submittedAt: string }>
}

type Loose = { from: (t: string) => any }

export async function readMyRequests(scope: ResidentScope): Promise<MyRequests> {
  if (scope.requestsBy === 'unit') return readUnitRequests(scope)
  const db = scope.db as unknown as Loose
  const userId = scope.userId
  const unitIds = unitIdsOf(scope)

  const [tickets, arc, reports, violations] = await Promise.all([
    userId
      ? db
          .from('tickets')
          .select('id, unit_id, category, subject, status, created_at, submitted_by, organization_id')
          .eq('submitted_by', userId)
          .eq('organization_id', scope.orgId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(LIST_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    userId
      ? db
          .from('arc_requests')
          .select('id, category, summary, status, board_response_at, submitted_at, submitted_by, organization_id')
          .eq('submitted_by', userId)
          .eq('organization_id', scope.orgId)
          .order('submitted_at', { ascending: false })
          .limit(LIST_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    userId
      ? db
          .from('resident_violation_reports')
          .select('id, category, status, submitted_at, reported_by, organization_id')
          .eq('reported_by', userId)
          .eq('organization_id', scope.orgId)
          .order('submitted_at', { ascending: false })
          .limit(LIST_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    readViolationsOnMyHomes(scope, unitIds),
  ])

  if (tickets.error) throw new ScopeReadFailed('tickets', codeOf(tickets.error))
  if (arc.error) throw new ScopeReadFailed('arc', codeOf(arc.error))
  if (reports.error) throw new ScopeReadFailed('reports', codeOf(reports.error))

  type TicketRow = { id: string; unit_id: string | null; category: string; subject: string; status: string; created_at: string; submitted_by: string; organization_id: string }
  type ArcRow = { id: string; category: string; summary: string; status: string; board_response_at: string | null; submitted_at: string; submitted_by: string; organization_id: string }
  type ReportRow = { id: string; category: string; status: string; submitted_at: string; reported_by: string; organization_id: string }

  const own = <T extends { organization_id: string }>(rows: unknown, by: (r: T) => string): T[] =>
    ((rows ?? []) as T[]).filter((r) => userId !== null && by(r) === userId && r.organization_id === scope.orgId)

  return {
    tickets: own<TicketRow>(tickets.data, (r) => r.submitted_by).map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      createdAt: t.created_at,
      home: unitLabel(scope, t.unit_id),
    })),
    arcApplications: own<ArcRow>(arc.data, (r) => r.submitted_by).map((a) => ({
      id: a.id,
      summary: a.summary,
      category: a.category,
      status: a.status,
      submittedAt: a.submitted_at,
      decidedAt: a.board_response_at,
    })),
    violationsOnMyHome: violations,
    reportedConcerns: own<ReportRow>(reports.data, (r) => r.reported_by).map((r) => ({
      id: r.id,
      category: r.category,
      status: r.status,
      submittedAt: r.submitted_at,
    })),
  }
}

/**
 * Board side (scope.requestsBy === 'unit'): tickets and ARC applications
 * filed against the scope's units, whoever submitted them. Same shapes and
 * the same belt-and-braces re-check as the resident path, keyed on unit_id
 * instead of submitted_by. Reported concerns are keyed on the reporter, so
 * they are not part of a home's record and come back empty.
 */
async function readUnitRequests(scope: ResidentScope): Promise<MyRequests> {
  const db = scope.db as unknown as Loose
  const unitIds = unitIdsOf(scope)
  if (unitIds.length === 0) return { tickets: [], arcApplications: [], violationsOnMyHome: [], reportedConcerns: [] }

  const [tickets, arc, violations] = await Promise.all([
    db
      .from('tickets')
      .select('id, unit_id, category, subject, status, created_at, organization_id')
      .in('unit_id', unitIds)
      .eq('organization_id', scope.orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT),
    db
      .from('arc_requests')
      .select('id, unit_id, category, summary, status, board_response_at, submitted_at, organization_id')
      .in('unit_id', unitIds)
      .eq('organization_id', scope.orgId)
      .is('deleted_at', null)
      .order('submitted_at', { ascending: false })
      .limit(LIST_LIMIT),
    readViolationsOnMyHomes(scope, unitIds),
  ])
  if (tickets.error) throw new ScopeReadFailed('tickets', codeOf(tickets.error))
  if (arc.error) throw new ScopeReadFailed('arc', codeOf(arc.error))

  type TicketRow = { id: string; unit_id: string | null; category: string; subject: string; status: string; created_at: string; organization_id: string }
  type ArcRow = { id: string; unit_id: string | null; category: string; summary: string; status: string; board_response_at: string | null; submitted_at: string; organization_id: string }
  const mine = new Set(unitIds)
  const onMyUnits = <T extends { organization_id: string; unit_id: string | null }>(rows: unknown): T[] =>
    ((rows ?? []) as T[]).filter((r) => r.organization_id === scope.orgId && r.unit_id !== null && mine.has(r.unit_id))

  return {
    tickets: onMyUnits<TicketRow>(tickets.data).map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      createdAt: t.created_at,
      home: unitLabel(scope, t.unit_id),
    })),
    arcApplications: onMyUnits<ArcRow>(arc.data).map((a) => ({
      id: a.id,
      summary: a.summary,
      category: a.category,
      status: a.status,
      submittedAt: a.submitted_at,
      decidedAt: a.board_response_at,
    })),
    violationsOnMyHome: violations,
    reportedConcerns: [],
  }
}

// Violations are keyed by hoa_properties.id; a unit links to it through the
// property bridge (lib/properties/resolve.ts).
async function readViolationsOnMyHomes(scope: ResidentScope, unitIds: string[]): Promise<MyRequests['violationsOnMyHome']> {
  if (unitIds.length === 0) return []
  const db = scope.db as unknown as Loose
  let bridge: Map<string, string>
  try {
    bridge = await propertyIdsForUnits(scope.db, scope.orgId, unitIds)
  } catch (err) {
    throw new ScopeReadFailed('units', codeOf(err))
  }
  const mine = new Set(unitIds)
  const propertyIds = [...new Set([...bridge].filter(([unit]) => mine.has(unit)).map(([, property]) => property))]
  if (propertyIds.length === 0) return []

  const vRes = await db
    .from('hoa_violations')
    .select('id, property_id, org_id, violation_type, status, fine_amount, cure_period_days, notice_sent_at, created_at')
    .in('property_id', propertyIds)
    .eq('org_id', scope.orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (vRes.error) throw new ScopeReadFailed('violations', codeOf(vRes.error))
  const props = new Set(propertyIds)
  return (
    (vRes.data ?? []) as Array<{
      id: string
      property_id: string
      org_id: string
      violation_type: string
      status: string
      fine_amount: number | string | null
      cure_period_days: number | null
      notice_sent_at: string | null
      created_at: string | null
    }>
  )
    .filter((v) => props.has(v.property_id) && v.org_id === scope.orgId && !CLOSED_VIOLATION_STATUSES.has(v.status))
    .map((v) => ({
      id: v.id,
      type: v.violation_type,
      status: v.status,
      fineCents: v.fine_amount === null || v.fine_amount === undefined ? null : cents(v.fine_amount),
      curePeriodDays: v.cure_period_days,
      noticeSentAt: v.notice_sent_at,
      createdAt: v.created_at,
    }))
}

// ─── community_updates ───────────────────────────────────────────────

const ANNOUNCEMENT_LIMIT = 5
const RECIPIENT_ROWS = 200

export interface CommunityUpdates {
  announcements: Array<{ subject: string; category: string; sentAt: string }>
  /** Upcoming meetings, or unavailable when the resident meetings read isn't in the database yet. */
  meetings: { available: false } | { available: true; upcoming: Array<{ date: string; type: string; agendaPosted: boolean }> }
}

export async function readCommunityUpdates(scope: ResidentScope, now: Date = new Date()): Promise<CommunityUpdates> {
  const [announcements, meetings] = await Promise.all([readMyAnnouncements(scope), readUpcomingMeetings(scope, now)])
  return { announcements, meetings }
}

async function readMyAnnouncements(scope: ResidentScope): Promise<CommunityUpdates['announcements']> {
  const unitIds = unitIdsOf(scope)
  const identity = { unitIds, userId: scope.userId, email: scope.email }
  const filters = buildRecipientIdentityFilters(identity)
  // An empty or() matches every row (resident-scope.ts): skip the read.
  if (filters.length === 0) return []
  const db = scope.db as unknown as Loose

  const rec = await db
    .from('communication_recipients')
    .select('communication_id, rendered_subject, unit_id, user_id, email, sent_at, organization_id')
    .eq('organization_id', scope.orgId)
    .or(filters.join(','))
    .order('sent_at', { ascending: false, nullsFirst: false })
    .range(0, RECIPIENT_ROWS - 1)
  if (rec.error) throw new ScopeReadFailed('announcement recipients', codeOf(rec.error))

  const mine = new Set(unitIds)
  const email = scope.email?.toLowerCase() ?? null
  const rows = (
    (rec.data ?? []) as Array<RecipientRow & { user_id: string | null; email: string | null; organization_id: string }>
  ).filter(
    (r) =>
      r.organization_id === scope.orgId &&
      !!r.sent_at &&
      ((r.unit_id !== null && mine.has(r.unit_id)) ||
        (scope.userId !== null && r.user_id === scope.userId) ||
        (email !== null && (r.email ?? '').toLowerCase() === email)),
  )
  const byComm = pickRowPerCommunication(rows)
  const ids = [...byComm.keys()].slice(0, ANNOUNCEMENT_LIMIT)
  if (ids.length === 0) return []

  const comms = await db
    .from('communications')
    .select('id, subject, category, sent_at, organization_id')
    .eq('organization_id', scope.orgId)
    .eq('status', 'sent')
    .is('deleted_at', null)
    .in('id', ids)
  if (comms.error) throw new ScopeReadFailed('announcements', codeOf(comms.error))

  const nameByUnit = new Map(scope.units.map((u) => [u.unit_id, u.association_name ?? '']))
  const fallbackName = scope.units[0]?.association_name ?? ''
  const allowed = new Set(ids)
  return (
    (comms.data ?? []) as Array<{ id: string; subject: string; category: string; sent_at: string | null; organization_id: string }>
  )
    .filter((c) => allowed.has(c.id) && c.organization_id === scope.orgId)
    .map((c) => {
      const r = byComm.get(c.id)
      const associationName = (r?.unit_id ? nameByUnit.get(r.unit_id) : null) || fallbackName
      return {
        // The literal line this reader was sent, else the template with
        // per-recipient fields labelled (never another owner's values).
        subject: r?.rendered_subject ?? resolveForDisplay(c.subject, { associationName }).text,
        category: c.category,
        sentAt: (r?.sent_at ?? c.sent_at ?? '').slice(0, 10),
      }
    })
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
}

async function readUpcomingMeetings(scope: ResidentScope, now: Date): Promise<CommunityUpdates['meetings']> {
  const { today, timeZone } = scopeToday(scope, now)
  try {
    const res = await fetchResidentMeetings(scope.db as unknown as MeetingsClient, { orgId: scope.orgId, today, timeZone })
    if (!res.available) return { available: false }
    return {
      available: true,
      upcoming: res.upcoming.slice(0, 5).map((m) => ({ date: m.date, type: m.typeLabel, agendaPosted: m.agenda !== null })),
    }
  } catch (err) {
    if (err instanceof ResidentMeetingsLoadError) throw new ScopeReadFailed('meetings', err.code)
    throw err
  }
}
