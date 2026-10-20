// PR-10 board side: read the waiting contact-update requests, and approve
// or reject one. Takes the deciding board member's own RLS client — the
// rows it changes are board/admin-write only (0041, 0063), and nothing
// here uses the service role.
//
// Relative imports only — tests/integration imports this file and has no
// `@/` path mapping in tsconfig.integration.json.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { applySelfContact } from '../properties/lot'
import { propertyIdsForUnits } from '../properties/resolve'
import {
  AUDIT_APPLIED,
  AUDIT_REJECTED,
  CONTACT_CATEGORY,
  CONTACT_SUBJECT,
  FIELD_LABEL,
  HELD_REASON,
  parseContactRequest,
  planContactApply,
  readMailing,
  type ApplyContext,
  type ApplyOwnershipRow,
  type ApplyResidentRow,
  type ApplyTenancyRow,
  type ContactField,
  type ContactRequest,
  type ContactValues,
} from './model'

type Db = SupabaseClient<Database>

export interface ContactTicketRow {
  id: string
  unit_id: string | null
  submitted_by: string
  subject: string
  description: string
  status: string
  created_at: string
}

export const TICKET_COLUMNS = 'id, unit_id, submitted_by, subject, description, status, created_at'
export const OPEN_STATUSES = ['open', 'in_progress']

export interface ContactEntry {
  ticket: ContactTicketRow
  request: ContactRequest
  /** "12 Oak Street · Unit 2B"; null when the ticket's home couldn't be found. */
  home: string | null
  propertyId: string | null
  /** What applying would do (or why it can't). */
  context: ApplyContext | null
  /** The submitter's details as the home's records hold them now. */
  current: ContactValues | null
}

/** Log ids and codes only — a PostgREST message can quote row values. */
function logFailure(step: string, error: unknown, ids: Record<string, string | null>): void {
  const e = error as { code?: string } | null
  console.error(`[contact-updates] ${step} failed`, { ...ids, code: e?.code ?? null })
}

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * The home and the records behind each request, in a fixed number of
 * queries whatever the count (units, residents, ownerships, tenancies,
 * properties). `ok: false` = a read failed; the caller says so.
 */
export async function loadContactEntries(
  db: Db,
  orgId: string,
  tickets: readonly ContactTicketRow[],
): Promise<{ ok: true; entries: ContactEntry[] } | { ok: false }> {
  const parsed = tickets.flatMap((t) => {
    const request = parseContactRequest(t.subject, t.description)
    return request ? [{ ticket: t, request }] : []
  })
  const unitIds = [...new Set(parsed.map((p) => p.ticket.unit_id).filter((u): u is string => !!u))]
  if (unitIds.length === 0) {
    return { ok: true, entries: parsed.map((p) => ({ ...p, home: null, propertyId: null, context: null, current: null })) }
  }

  // Unit → property through the bridge module (lib/properties/resolve.ts).
  let propertyOf: Map<string, string>
  try {
    propertyOf = (await propertyIdsForUnits(db, orgId, unitIds)) as Map<string, string>
  } catch (err) {
    logFailure('units.bridge', err, { orgId })
    return { ok: false }
  }
  const { data: units, error: uErr } = await db
    .from('units')
    .select('id, address_line1, unit_number')
    .eq('organization_id', orgId)
    .in('id', unitIds)
  if (uErr) {
    logFailure('units', uErr, { orgId })
    return { ok: false }
  }
  type UnitRow = { id: string; address_line1: string | null; unit_number: string | null }
  const unitById = new Map(((units ?? []) as UnitRow[]).map((u) => [u.id, u]))
  const propertyIds = [...new Set(propertyOf.values())]

  const none = Promise.resolve({ data: [] as unknown[], error: null })
  const [res, own, ten, props] = await Promise.all([
    propertyIds.length === 0
      ? none
      : db
          .from('property_residents' as never)
          .select('id, property_id, full_name, email, phone, notes, role')
          .eq('organization_id' as never, orgId as never)
          .in('property_id' as never, propertyIds as never)
          .is('moved_out_at' as never, null)
          .is('deleted_at' as never, null),
    db
      .from('ownerships')
      .select('id, unit_id, owner_user_id, owner_email, owner_phone')
      .eq('organization_id', orgId)
      .in('unit_id', unitIds)
      .is('valid_to', null),
    db
      .from('tenancies')
      .select('id, unit_id, tenant_user_id, tenant_email, tenant_phone')
      .eq('organization_id', orgId)
      .in('unit_id', unitIds)
      .eq('status', 'active'),
    propertyIds.length === 0
      ? none
      : db.from('hoa_properties').select('id, owner_email, owner_phone').eq('org_id', orgId).in('id', propertyIds).is('deleted_at', null),
  ])
  for (const [step, r] of [['residents', res], ['ownerships', own], ['tenancies', ten], ['properties', props]] as const) {
    if (r.error) {
      logFailure(step, r.error, { orgId })
      return { ok: false }
    }
  }
  const residents = (res.data ?? []) as unknown as Array<ApplyResidentRow & { property_id: string }>
  const ownerships = (own.data ?? []) as unknown as Array<ApplyOwnershipRow & { unit_id: string }>
  const tenancies = (ten.data ?? []) as unknown as Array<ApplyTenancyRow & { unit_id: string }>
  const properties = new Map(
    ((props.data ?? []) as unknown as Array<{ id: string; owner_email: string | null; owner_phone: string | null }>).map((p) => [p.id, p]),
  )

  const entries = parsed.map(({ ticket, request }): ContactEntry => {
    const unit = ticket.unit_id ? unitById.get(ticket.unit_id) : undefined
    if (!unit) return { ticket, request, home: null, propertyId: null, context: null, current: null }
    const pid = propertyOf.get(unit.id) ?? null
    const home = [unit.address_line1, unit.unit_number ? `Unit ${unit.unit_number}` : null].filter(Boolean).join(' · ') || 'Home'
    const prop = pid ? properties.get(pid) : undefined
    const context: ApplyContext = {
      request,
      submitterId: ticket.submitted_by,
      residents: pid ? residents.filter((r) => r.property_id === pid) : [],
      ownerships: ownerships.filter((o) => o.unit_id === unit.id),
      tenancies: tenancies.filter((t) => t.unit_id === unit.id),
      property: prop ? { owner_email: prop.owner_email, owner_phone: prop.owner_phone } : null,
    }
    const mineR = context.residents.find((r) => lower(r.email) === request.signInEmail)
    // An Inbox-filed request's submitter is a board member (model.ts
    // planContactApply): their account names nobody's row.
    const mineO =
      request.channel === 'inbox'
        ? context.ownerships.find((o) => o.owner_user_id === null && lower(o.owner_email) === request.signInEmail)
        : context.ownerships.find((o) => o.owner_user_id === ticket.submitted_by)
    const current: ContactValues | null = mineR
      ? { phone: mineR.phone, email: mineR.email, mailing: readMailing(mineR.notes) }
      : mineO
        ? { phone: mineO.owner_phone, email: mineO.owner_email, mailing: null }
        : null
    return { ticket, request, home, propertyId: pid, context, current }
  })
  return { ok: true, entries }
}

// ─── decide ─────────────────────────────────────────────────────────

export type DecideResult = { ok: true; message: string } | { ok: false; error: string }

export interface DecideInput {
  orgId: string
  ticketId: string
  deciderId: string
  deciderRole: 'board' | 'admin'
}

async function readTicket(db: Db, orgId: string, ticketId: string) {
  const { data, error } = await db
    .from('tickets' as never)
    .select(TICKET_COLUMNS)
    .eq('id' as never, ticketId as never)
    .eq('organization_id' as never, orgId as never)
    .is('deleted_at' as never, null)
    .maybeSingle()
  if (error) {
    logFailure('ticket.read', error, { orgId, ticketId })
    return { ok: false as const, error: 'Couldn’t load the request. Try again.' }
  }
  const t = data as unknown as ContactTicketRow | null
  if (!t) return { ok: false as const, error: 'That request wasn’t found.' }
  if (!OPEN_STATUSES.includes(t.status)) return { ok: false as const, error: 'That request was already handled.' }
  const request = parseContactRequest(t.subject, t.description)
  if (!request) return { ok: false as const, error: 'That request isn’t a contact update.' }
  return { ok: true as const, ticket: t, request }
}

/** Close the ticket iff it is still open — of two deciders, one wins. */
async function claim(db: Db, input: DecideInput, was: string): Promise<{ ok: true; was: string } | { ok: false; error: string }> {
  const { data, error } = await db
    .from('tickets' as never)
    .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: input.deciderId } as never)
    .eq('id' as never, input.ticketId as never)
    .eq('organization_id' as never, input.orgId as never)
    .eq('subject' as never, CONTACT_SUBJECT as never)
    .in('status' as never, OPEN_STATUSES as never)
    .select('id')
  if (error) {
    logFailure('ticket.claim', error, { orgId: input.orgId, ticketId: input.ticketId })
    return { ok: false, error: 'Couldn’t record the decision. Try again.' }
  }
  if (((data ?? []) as unknown[]).length === 0) return { ok: false, error: 'Someone already handled this request.' }
  return { ok: true, was }
}

async function reopen(db: Db, input: DecideInput, was: string): Promise<void> {
  const { error } = await db
    .from('tickets' as never)
    .update({ status: was, closed_at: null, closed_by: null } as never)
    .eq('id' as never, input.ticketId as never)
    .eq('organization_id' as never, input.orgId as never)
  if (error) logFailure('ticket.reopen', error, { orgId: input.orgId, ticketId: input.ticketId })
}

async function tellResident(db: Db, input: DecideInput, body: string): Promise<void> {
  const { error } = await db.from('ticket_messages' as never).insert({
    ticket_id: input.ticketId,
    author_id: input.deciderId,
    author_role: input.deciderRole,
    body,
    internal: false,
  } as never)
  if (error) logFailure('ticket.message', error, { orgId: input.orgId, ticketId: input.ticketId })
}

async function audit(db: Db, input: DecideInput, action: string, metadata: Record<string, unknown>): Promise<void> {
  const { error } = await db.from('audit_log').insert({
    org_id: input.orgId,
    user_id: input.deciderId,
    action,
    entity_type: 'ticket',
    entity_id: input.ticketId,
    metadata: metadata as never,
  })
  if (error) logFailure('audit', error, { orgId: input.orgId, ticketId: input.ticketId })
}

const fieldList = (fs: readonly ContactField[]) => {
  const names = fs.map((f) => FIELD_LABEL[f].toLowerCase())
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Approve: re-read the request and the home's records, plan exactly which
 * of the submitter's rows change (planContactApply), close the ticket
 * (the claim), write every row (applySelfContact), then tell the resident
 * and write the audit row (ids and field names only). A write failure
 * re-opens the ticket so it stays in /approvals.
 */
export async function approveContactUpdate(db: Db, input: DecideInput): Promise<DecideResult> {
  const t = await readTicket(db, input.orgId, input.ticketId)
  if (!t.ok) return t
  const loaded = await loadContactEntries(db, input.orgId, [t.ticket])
  if (!loaded.ok) return { ok: false, error: 'Couldn’t load the home’s records. Try again.' }
  const entry = loaded.entries[0]
  if (!entry?.context || !entry.propertyId) {
    return { ok: false, error: 'The home this request is for couldn’t be found. Reply on the ticket instead.' }
  }
  const planned = planContactApply(entry.context)
  if (!planned.ok) return planned
  const { plan } = planned

  const claimed = await claim(db, input, t.ticket.status)
  if (!claimed.ok) return claimed

  const applied = await applySelfContact(db, { orgId: input.orgId, propertyId: entry.propertyId, plan })
  if (!applied.ok) {
    await reopen(db, input, claimed.was)
    return { ok: false, error: applied.error }
  }

  const heldNote = plan.held.map((f) => HELD_REASON[f]).join(' ')
  await tellResident(
    db,
    input,
    [
      `Your ${fieldList(plan.applied)} ${plan.applied.length === 1 ? 'is' : 'are'} updated on file.`,
      plan.held.includes('email')
        ? 'We didn’t change your email: you sign in to the portal with the email on file, so changing it would lock you out. Ask the board to invite you to the portal, then send the change again.'
        : null,
      plan.held.includes('mailing') ? 'We didn’t change your mailing address: the board will add it to your record.' : null,
    ]
      .filter(Boolean)
      .join(' '),
  )
  await audit(db, input, AUDIT_APPLIED, {
    propertyId: entry.propertyId,
    unitId: entry.ticket.unit_id,
    submittedBy: entry.ticket.submitted_by,
    residentIds: plan.residents.map((r) => r.id),
    ownershipIds: plan.ownerships.map((o) => o.id),
    tenancyIds: plan.tenancies.map((x) => x.id),
    propertyOwnerFields: plan.property !== null,
    fields: plan.applied,
    held: plan.held,
  })

  return {
    ok: true,
    message: `Contact details updated: ${fieldList(plan.applied)}.${heldNote ? ` ${heldNote}` : ''}`,
  }
}

/** Reject: close the ticket with the reason, which the resident sees. Nothing on file changes. */
export async function rejectContactUpdate(db: Db, input: DecideInput & { reason: string }): Promise<DecideResult> {
  const reason = input.reason.trim()
  if (!reason) return { ok: false, error: 'A reason is required to reject.' }
  const t = await readTicket(db, input.orgId, input.ticketId)
  if (!t.ok) return t
  const claimed = await claim(db, input, t.ticket.status)
  if (!claimed.ok) return claimed
  await tellResident(db, input, `The board didn’t apply your contact update. ${reason}`)
  await audit(db, input, AUDIT_REJECTED, { unitId: t.ticket.unit_id, submittedBy: t.ticket.submitted_by })
  return { ok: true, message: 'Rejected. Nothing on file changed; the resident sees your reason.' }
}

/** The waiting requests, oldest first (head-count for the badge too). */
export function contactTicketsQuery(db: Db, orgId: string, opts: { head?: boolean } = {}) {
  return db
    .from('tickets' as never)
    .select(opts.head ? 'id' : TICKET_COLUMNS, { count: 'exact', head: opts.head === true })
    .eq('organization_id' as never, orgId as never)
    .eq('subject' as never, CONTACT_SUBJECT as never)
    .eq('category' as never, CONTACT_CATEGORY as never)
    .in('status' as never, OPEN_STATUSES as never)
    .is('deleted_at' as never, null)
}
