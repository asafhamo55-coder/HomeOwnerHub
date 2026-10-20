/**
 * BL-129: a resident opens, and answers, a violation on their own home.
 *
 * Plain module (no 'use server'): the page loader and the server action in
 * violation-response-actions.ts both call into it with the clients they
 * hold, so the ownership rule is written once and tested without Next.
 *
 * WHERE A RESPONSE LIVES (verified 2026-10-20, no migration):
 * - hoa_violations has no message table. The board page /violations/[id]
 *   shows the letter, follow-ups and history, never a conversation.
 * - So a response is a TICKET (category 'general', the resident's unit),
 *   exactly as BL-123 files a records request: it rides the ticket thread
 *   (ticket_messages), the board's ticket notification (ticket/created) and
 *   the ticket attachments (submission_attachments thread 'ticket'), all
 *   under the 0024/0063 resident RLS: the resident writes those as
 *   themselves.
 * - The link from the violation to that ticket is an audit_log row
 *   (entity hoa_violation, action violation.resident_response, metadata
 *   { ticketId }), the same pattern the CA cure commitment uses. Residents
 *   cannot write audit_log (0063: board-only insert) or read it, so that
 *   one row is written and read with the SERVICE ROLE, scoped to the
 *   violation, the org and the resident, and only after this module has
 *   confirmed the violation is on a home the resident owns or occupies.
 *
 * OWNERSHIP. A violation is keyed by hoa_properties.id; a resident's units
 * reach it through the unit-to-home bridge (lib/properties/resolve.ts).
 * The check is explicit here, never left to RLS: until 0063 is applied,
 * the 0000 org_access policy lets any org member read every violation in
 * the org.
 *
 * Nothing here sends anything to a resident. Logs carry ids and codes only.
 */

import { propertyIdsForUnits } from '@/lib/properties/resolve'

export const VIOLATION_RESPONSE_AUDIT = 'violation.resident_response'
export const VIOLATION_RESPONSE_ENTITY = 'hoa_violation'

/** Statuses after which the board has finished with the case. */
export const CLOSED_VIOLATION_STATUSES = new Set(['resolved', 'dismissed', 'waived', 'cured'])

// Structural client type: the real Supabase client, the service-role
// client and the unit-test fakes all satisfy it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (table: string) => any }

/** The violation columns the resident page reads. Never ai_draft_letter. */
export const RESIDENT_VIOLATION_COLUMNS =
  'id, org_id, property_id, violation_type, description, ccr_section, status, notice_sent_at, approved_letter, cure_period_days, fine_amount, fine_start_date, photo_urls, created_at, resolved_at'

export interface OwnViolationRow {
  id: string
  org_id: string
  property_id: string | null
  violation_type: string
  description: string
  ccr_section: string | null
  status: string
  notice_sent_at: string | null
  approved_letter: string | null
  cure_period_days: number | null
  fine_amount: number | null
  fine_start_date: string | null
  photo_urls: string[] | null
  created_at: string | null
  resolved_at: string | null
}

/** What the resident is shown. The letter and the photos only once the
 *  notice has actually gone out: before that the case is the board's
 *  working file. */
export interface ResidentViolationView {
  id: string
  violationType: string
  description: string
  ruleCited: string | null
  status: string
  closed: boolean
  noticeSentAt: string | null
  letter: string | null
  cureBy: string | null
  curePeriodDays: number | null
  dailyFine: number | null
  finesStartedOn: string | null
  photos: string[]
  createdAt: string | null
  resolvedAt: string | null
}

export function cureByDate(noticeSentAt: string | null, curePeriodDays: number | null): string | null {
  if (!noticeSentAt || !curePeriodDays) return null
  const t = new Date(noticeSentAt).getTime()
  if (!Number.isFinite(t)) return null
  return new Date(t + curePeriodDays * 86_400_000).toISOString()
}

export function residentViolationView(v: OwnViolationRow): ResidentViolationView {
  const sent = Boolean(v.notice_sent_at)
  return {
    id: v.id,
    violationType: v.violation_type,
    description: v.description,
    ruleCited: v.ccr_section,
    status: v.status,
    closed: CLOSED_VIOLATION_STATUSES.has(v.status),
    noticeSentAt: v.notice_sent_at,
    letter: sent ? v.approved_letter : null,
    cureBy: cureByDate(v.notice_sent_at, v.cure_period_days),
    curePeriodDays: v.cure_period_days,
    dailyFine: v.fine_amount,
    finesStartedOn: v.fine_start_date,
    photos: sent ? (v.photo_urls ?? []).filter((u) => typeof u === 'string' && /^https:\/\//.test(u)) : [],
    createdAt: v.created_at,
    resolvedAt: v.resolved_at,
  }
}

/** units → their hoa_properties ids, per unit (lib/properties/resolve.ts,
 *  the one bridge rule). null = the read failed. */
export async function homePropertiesForUnits(
  db: Db,
  unitIds: string[],
  orgId: string,
): Promise<Array<{ unitId: string; propertyId: string }> | null> {
  if (unitIds.length === 0) return []
  try {
    const map = await propertyIdsForUnits(db as never, orgId, unitIds)
    return [...map].map(([unitId, propertyId]) => ({ unitId, propertyId }))
  } catch {
    // propertyIdsForUnits has already logged the code.
    return null
  }
}

export type OwnViolationLookup =
  | { ok: true; violation: OwnViolationRow; unitId: string }
  | { ok: false; reason: 'not_found' | 'error' }

/**
 * The violation, only if it sits on one of the resident's homes (and, when
 * an org is given, in that org). A violation on a neighbour's home, in
 * another org, deleted, or with no home is `not_found` — the same answer,
 * so the page cannot be used to probe for ids.
 */
export async function loadOwnViolation(
  db: Db,
  input: { violationId: string; unitIds: string[]; orgId: string },
): Promise<OwnViolationLookup> {
  if (!/^[0-9a-f-]{36}$/i.test(input.violationId)) return { ok: false, reason: 'not_found' }
  const homes = await homePropertiesForUnits(db, input.unitIds, input.orgId)
  if (homes === null) return { ok: false, reason: 'error' }
  if (homes.length === 0) return { ok: false, reason: 'not_found' }
  const propertyIds = [...new Set(homes.map((h) => h.propertyId))]

  const q = db
    .from('hoa_violations')
    .select(RESIDENT_VIOLATION_COLUMNS)
    .eq('id', input.violationId)
    .in('property_id', propertyIds)
    .is('deleted_at', null)
    .eq('org_id', input.orgId)
  const { data, error } = await q.maybeSingle()
  if (error) {
    console.error('[violation-response] violation read failed', { code: error.code ?? null })
    return { ok: false, reason: 'error' }
  }
  const row = data as OwnViolationRow | null
  // Belt and braces: the filter above already did this, but a fake or a
  // future query edit must not widen it silently.
  if (!row || !row.property_id || !propertyIds.includes(row.property_id)) return { ok: false, reason: 'not_found' }
  if (row.org_id !== input.orgId) return { ok: false, reason: 'not_found' }
  const unitId = homes.find((h) => h.propertyId === row.property_id)!.unitId
  return { ok: true, violation: row, unitId }
}

/**
 * The resident's response ticket for this violation, if they have one.
 * Service role (audit_log is board-only under RLS); scoped to org,
 * violation and resident. The caller must have run loadOwnViolation first.
 * null = none yet; 'error' = the read failed.
 */
export async function findResponseTicketId(
  admin: Db,
  input: { orgId: string; violationId: string; userId: string },
): Promise<string | null | 'error'> {
  const { data, error } = await admin
    .from('audit_log')
    .select('metadata, created_at')
    .eq('org_id', input.orgId)
    .eq('entity_type', VIOLATION_RESPONSE_ENTITY)
    .eq('entity_id', input.violationId)
    .eq('action', VIOLATION_RESPONSE_AUDIT)
    .eq('user_id', input.userId)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) {
    console.error('[violation-response] link read failed', { code: error.code ?? null })
    return 'error'
  }
  const row = ((data ?? []) as Array<{ metadata: unknown }>)[0]
  return ticketIdOf(row?.metadata)
}

export function ticketIdOf(metadata: unknown): string | null {
  const id = metadata && typeof metadata === 'object' ? (metadata as { ticketId?: unknown }).ticketId : null
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function responseTicketSubject(violationType: string): string {
  return `Response to violation notice: ${humanize(violationType)}`.slice(0, 200)
}

export type RespondResult =
  | { ok: true; ticketId: string; created: boolean }
  | { ok: false; error: string }

export const RESPOND_NOT_FOUND = 'We couldn’t find that notice on your home.'
export const RESPOND_CLOSED = 'This violation is closed, so it no longer takes responses.'
const RESPOND_FAILED = 'We couldn’t send your response. Please try again.'

/**
 * Post the resident's response. The first one opens the response ticket
 * (as the resident, under RLS) and links it to the violation (service
 * role); later ones are messages on that ticket (as the resident).
 *
 * `db` is the resident's RLS-bound client; `admin` the service role, used
 * only for the audit_log link (and to remove a ticket whose link could not
 * be written, so no orphan is left in the board's queue).
 */
export async function postViolationResponse(
  deps: { db: Db; admin: Db; notifyBoard: (ticketId: string) => Promise<void> },
  input: { violationId: string; body: string; userId: string; orgId: string; unitIds: string[]; associationIdOf: (unitId: string) => string | null },
): Promise<RespondResult> {
  const own = await loadOwnViolation(deps.db, { violationId: input.violationId, unitIds: input.unitIds, orgId: input.orgId })
  if (!own.ok) return { ok: false, error: own.reason === 'error' ? RESPOND_FAILED : RESPOND_NOT_FOUND }
  if (CLOSED_VIOLATION_STATUSES.has(own.violation.status)) return { ok: false, error: RESPOND_CLOSED }

  const existing = await findResponseTicketId(deps.admin, {
    orgId: input.orgId,
    violationId: input.violationId,
    userId: input.userId,
  })
  if (existing === 'error') return { ok: false, error: RESPOND_FAILED }

  if (existing) {
    const { error } = await deps.db.from('ticket_messages').insert({
      ticket_id: existing,
      author_id: input.userId,
      author_role: 'resident',
      body: input.body,
      internal: false,
    })
    if (error) {
      console.error('[violation-response] message insert failed', { violationId: input.violationId, code: error.code ?? null })
      return { ok: false, error: RESPOND_FAILED }
    }
    return { ok: true, ticketId: existing, created: false }
  }

  const { data: ticket, error: ticketError } = await deps.db
    .from('tickets')
    .insert({
      organization_id: input.orgId,
      association_id: input.associationIdOf(own.unitId),
      unit_id: own.unitId,
      submitted_by: input.userId,
      category: 'general',
      subject: responseTicketSubject(own.violation.violation_type),
      description: input.body,
      status: 'open',
    })
    .select('id')
    .single()
  if (ticketError || !ticket) {
    console.error('[violation-response] ticket insert failed', { violationId: input.violationId, code: ticketError?.code ?? null })
    return { ok: false, error: RESPOND_FAILED }
  }
  const ticketId = (ticket as { id: string }).id

  const { error: linkError } = await deps.admin.from('audit_log').insert({
    org_id: input.orgId,
    user_id: input.userId,
    action: VIOLATION_RESPONSE_AUDIT,
    entity_type: VIOLATION_RESPONSE_ENTITY,
    entity_id: input.violationId,
    metadata: { ticketId, unitId: own.unitId },
  })
  if (linkError) {
    console.error('[violation-response] link insert failed', { violationId: input.violationId, ticketId, code: linkError.code ?? null })
    // Unlinked, the board would see a stray ticket and the resident a page
    // that forgot their answer. Remove it (scoped to exactly this row).
    const { error: cleanupError } = await deps.admin
      .from('tickets')
      .delete()
      .eq('id', ticketId)
      .eq('organization_id', input.orgId)
      .eq('submitted_by', input.userId)
    if (cleanupError) console.error('[violation-response] orphan cleanup failed', { ticketId, code: cleanupError.code ?? null })
    return { ok: false, error: RESPOND_FAILED }
  }

  try {
    await deps.notifyBoard(ticketId)
  } catch (err) {
    // Saved already; a notification hiccup must not ask the resident to retry.
    console.error('[violation-response] board notification not queued', {
      ticketId,
      name: err instanceof Error ? err.name : 'unknown',
    })
  }
  return { ok: true, ticketId, created: true }
}

// ─── Board side ──────────────────────────────────────────────────────

export interface BoardResponseThread {
  ticketId: string
  status: string
  openedAt: string
  messages: Array<{ id: string; author_role: 'resident' | 'board' | 'admin'; body: string; internal: boolean; created_at: string }>
}

/**
 * Every homeowner response thread on one violation, for /violations/[id].
 * `db` is the board's RLS-bound client (board reads audit_log and tickets).
 * null = a read failed (the page says so; never "no responses").
 */
export async function loadBoardResponseThreads(
  db: Db,
  input: { orgId: string; violationId: string },
): Promise<BoardResponseThread[] | null> {
  const { data: links, error: linkError } = await db
    .from('audit_log')
    .select('metadata')
    .eq('org_id', input.orgId)
    .eq('entity_type', VIOLATION_RESPONSE_ENTITY)
    .eq('entity_id', input.violationId)
    .eq('action', VIOLATION_RESPONSE_AUDIT)
  if (linkError) {
    console.error('[violation-response] board link read failed', { code: linkError.code ?? null })
    return null
  }
  const ids = [
    ...new Set(((links ?? []) as Array<{ metadata: unknown }>).map((l) => ticketIdOf(l.metadata)).filter((x): x is string => x !== null)),
  ]
  if (ids.length === 0) return []

  const [tickets, messages] = await Promise.all([
    db
      .from('tickets')
      .select('id, status, description, created_at, submitted_by')
      .in('id', ids)
      .eq('organization_id', input.orgId)
      .is('deleted_at', null),
    db
      .from('ticket_messages')
      .select('id, ticket_id, author_role, body, internal, created_at')
      .in('ticket_id', ids)
      .order('created_at', { ascending: true }),
  ])
  if (tickets.error || messages.error) {
    console.error('[violation-response] board thread read failed', {
      code: tickets.error?.code ?? messages.error?.code ?? null,
    })
    return null
  }
  type T = { id: string; status: string; description: string; created_at: string }
  type M = { id: string; ticket_id: string; author_role: 'resident' | 'board' | 'admin'; body: string; internal: boolean; created_at: string }
  const msgs = (messages.data ?? []) as M[]
  return ((tickets.data ?? []) as T[])
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((t) => ({
      ticketId: t.id,
      status: t.status,
      openedAt: t.created_at,
      // The ticket's description is the first response.
      messages: [
        { id: `${t.id}-first`, author_role: 'resident' as const, body: t.description, internal: false, created_at: t.created_at },
        ...msgs.filter((m) => m.ticket_id === t.id).map(({ ticket_id: _t, ...m }) => m),
      ],
    }))
}
