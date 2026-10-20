'use server'

/**
 * BL-101 A4 — "Create from this email": the board turns a thread into a
 * record, or links it to one, and the link shows in the rail's Linked
 * records.
 *
 *   - linkViolationToThread: the violation wizard, opened from a thread,
 *     links the violation it just recorded.
 *   - fileContactUpdateFromThread: files the PR-10 contact-update request
 *     (lib/contact-updates) from a verified resident's email. It lands in
 *     /approvals → Contact updates like a resident's own; nothing on file
 *     changes until a board member approves it.
 *   - createTicketFromThread: a board ticket on the thread's home, from
 *     the email (submitted_by = the board member, per plan A4).
 *   - listLinkCandidates / linkExistingRecord: the "Link an existing record" picker,
 *     limited to the thread's home.
 *
 * NOT here: filing an ARC application for a resident (needs B4,
 * `on_behalf_of` + resident visibility). The menu instead hands the
 * resident a prefilled link to their own ARC form (convert/model.ts
 * boardArcHref), which needs no server write.
 *
 * Every write runs on the board member's own RLS client, org-scoped from
 * the session, and every link goes through writeThreadLink (type + org
 * checks, lib/inbox/links.ts). No email or SMS is sent, and no board
 * notification is queued (the board member filed it themselves). Logs
 * carry ids and error codes only — never an address, a phone or a body.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireBoardOrAdminForAction, BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { checkSenderForUnit, latestInboundSender } from '@/lib/inbox/account-context'
import { resolvePropertyForUnit, resolveUnitForProperty, asUnitId } from '@/lib/properties/resolve'
import { CONTACT_CATEGORY, CONTACT_SUBJECT, checkContactForm, formatInboxContactRequest, type ContactChange, type ContactField } from '@/lib/contact-updates/model'
import { OPEN_STATUSES, trustContactTickets } from '@/lib/contact-updates/apply'
import { authSubmitterEmails } from '@/lib/contact-updates/submitter-email'
import { verifyLinkTarget, writeThreadLink } from '@/lib/inbox/links'
import {
  TICKET_DESCRIPTION_MAX,
  TICKET_DESCRIPTION_MIN,
  TICKET_SUBJECT_MAX,
  TICKET_SUBJECT_MIN,
  isReservedTicketSubject,
  pickLinkCandidates,
  type LinkCandidate,
} from './model'
import { CONTACT_ACK, TICKET_CATEGORIES, ticketAck } from './ack'

type ServerDb = Awaited<ReturnType<typeof getSupabaseServerClient>>

export type ConvertResult = { ok: true; message: string; ack?: string; warning?: string } | { ok: false; error: string; fieldErrors?: Partial<Record<ContactField, string>> }

const uuid = z.string().uuid()

function codeOf(error: unknown): string | null {
  const c = (error as { code?: unknown } | null)?.code
  return typeof c === 'string' ? c : null
}

async function session() {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false as const, error: gate.error }
  const db = await getSupabaseServerClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in.' }
  return { ok: true as const, db, orgId: gate.orgId, userId: user.id }
}

/** The thread's home: its unit, the property it bridges to, and every unit on that lot. */
async function threadHome(
  db: ServerDb,
  orgId: string,
  threadId: string,
): Promise<{ ok: true; unitId: string | null; propertyId: string | null; unitIds: string[] } | { ok: false; error: string }> {
  const { data, error } = await db
    .from('inbox_threads')
    .select('id, unit_id')
    .eq('organization_id', orgId)
    .eq('id', threadId)
    .maybeSingle()
  if (error) {
    console.error('[inbox.convert] thread read failed', { orgId, threadId, code: error.code })
    return { ok: false, error: 'Couldn’t load this conversation. Try again.' }
  }
  if (!data) return { ok: false, error: 'Thread not found.' }
  if (!data.unit_id) return { ok: true, unitId: null, propertyId: null, unitIds: [] }
  try {
    const propertyId = await resolvePropertyForUnit(db, orgId, asUnitId(data.unit_id))
    const unitIds = propertyId ? (await resolveUnitForProperty(db, orgId, propertyId)).unitIds.map(String) : []
    return { ok: true, unitId: data.unit_id, propertyId, unitIds: [...new Set([data.unit_id, ...unitIds])] }
  } catch (err) {
    console.error('[inbox.convert] home lookup failed', { orgId, threadId, code: codeOf(err) })
    return { ok: false, error: 'Couldn’t load this conversation’s home. Try again.' }
  }
}

function revalidateThread(threadId: string) {
  revalidatePath(`/inbox/${threadId}`)
  revalidatePath('/inbox')
}

// ─── Violation (from the wizard) ────────────────────────────────────

/**
 * Called by the violation wizard once it has recorded a violation it was
 * opened for from a thread (`/violations/new?from_thread=`). The
 * violation is already saved; a failure here only means the link is
 * missing, so the wizard says so and the board can link it by hand.
 */
export async function linkViolationToThread(input: { threadId: string; violationId: string }): Promise<ConvertResult> {
  if (!uuid.safeParse(input.threadId).success || !uuid.safeParse(input.violationId).success) {
    return { ok: false, error: 'Invalid link target.' }
  }
  const s = await session()
  if (!s.ok) return s
  const written = await writeThreadLink(s.db, {
    orgId: s.orgId,
    userId: s.userId,
    threadId: input.threadId,
    type: 'violation',
    resourceId: input.violationId,
  })
  if (!written.ok) return { ok: false, error: written.error }
  revalidateThread(input.threadId)
  return { ok: true, message: 'Linked to the email.' }
}

// ─── Ticket ─────────────────────────────────────────────────────────

const TicketFromThreadSchema = z.object({
  threadId: uuid,
  category: z.enum(TICKET_CATEGORIES, { errorMap: () => ({ message: 'Pick a category.' }) }),
  subject: z
    .string()
    .trim()
    .min(TICKET_SUBJECT_MIN, 'Subject is too short.')
    .max(TICKET_SUBJECT_MAX, 'Subject is too long.')
    .refine((s) => !isReservedTicketSubject(s), 'That subject is reserved for contact updates. Use Update contact details instead.'),
  description: z
    .string()
    .trim()
    .min(TICKET_DESCRIPTION_MIN, 'Describe the issue in more detail.')
    .max(TICKET_DESCRIPTION_MAX, 'The description is too long.'),
})

export type TicketFromThreadField = 'category' | 'subject' | 'description'

export type TicketFromThreadResult =
  | { ok: true; ticketId: string; message: string; ack: string; warning?: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<TicketFromThreadField, string>> }

/**
 * Plan A4 "Create a ticket": a board ticket on the thread's home, from
 * the email, linked back to the thread.
 *
 * `submitted_by` is the board member (board RLS board_or_admin_ticket
 * allows the insert), so the resident won't see it in /resident/tickets
 * until on-behalf filing (B4); the acknowledgement line never says they
 * will. No email, SMS or resident notification is sent. A failed link
 * leaves the ticket in place and says so.
 */
export async function createTicketFromThread(input: {
  threadId: string
  category: string
  subject: string
  description: string
}): Promise<TicketFromThreadResult> {
  const parsed = TicketFromThreadSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Partial<Record<TicketFromThreadField, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if ((key === 'category' || key === 'subject' || key === 'description') && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    if (Object.keys(fieldErrors).length === 0) return { ok: false, error: 'Thread not found.' }
    return { ok: false, error: Object.values(fieldErrors)[0] ?? 'Check the highlighted fields.', fieldErrors }
  }
  const { threadId, category, subject, description } = parsed.data

  const s = await session()
  if (!s.ok) return s
  const { db, orgId, userId } = s

  const home = await threadHome(db, orgId, threadId)
  if (!home.ok) return home
  if (!home.unitId) return { ok: false, error: 'File this email under a home first.' }

  const { data: unit, error: unitError } = await db
    .from('units')
    .select('association_id')
    .eq('organization_id', orgId)
    .eq('id', home.unitId)
    .maybeSingle()
  if (unitError) {
    console.error('[inbox.convert] unit read failed', { orgId, threadId, code: unitError.code })
    return { ok: false, error: 'Couldn’t load this home. Try again.' }
  }

  const { data: row, error } = await db
    .from('tickets')
    .insert({
      organization_id: orgId,
      association_id: unit?.association_id ?? null,
      unit_id: home.unitId,
      submitted_by: userId,
      category,
      subject,
      description,
      status: 'open',
    })
    .select('id')
    .single()
  if (error || !row) {
    console.error('[inbox.convert] ticket insert failed', { orgId, threadId, code: codeOf(error) })
    return { ok: false, error: 'Couldn’t create the ticket. Try again.' }
  }

  const linked = await writeThreadLink(db, { orgId, userId, threadId, type: 'ticket', resourceId: row.id })
  revalidateThread(threadId)
  revalidatePath('/tickets')
  const message = 'Ticket created.'
  const ack = ticketAck(category)
  return linked.ok
    ? { ok: true, ticketId: row.id, message, ack }
    : { ok: true, ticketId: row.id, message, ack, warning: 'It couldn’t be linked to this email. Use Create from email → Link an existing record.' }
}

// ─── Contact update (PR-10) ─────────────────────────────────────────

export interface ContactFromThreadInput {
  threadId: string
  phone: string
  email: string
  mailing: string
}

/**
 * File the email's change as a PR-10 contact-update request.
 *
 * Only for a thread filed under a home whose sender is VERIFIED for it
 * (the A2 disclosure gate): the request names the person by the address
 * the email came from, so an unverified sender would let anyone ask for
 * a resident's details to change. Only filled-in fields are asked for.
 * One waiting request per sender per home.
 */
export async function fileContactUpdateFromThread(input: ContactFromThreadInput): Promise<ConvertResult> {
  if (!uuid.safeParse(input.threadId).success) return { ok: false, error: 'Thread not found.' }
  const s = await session()
  if (!s.ok) return s
  const { db, orgId, userId } = s
  const { threadId } = input

  const home = await threadHome(db, orgId, threadId)
  if (!home.ok) return home
  if (!home.unitId) return { ok: false, error: 'File this email under a home first.' }

  const { data: msgs, error: msgError } = await db
    .from('inbox_messages')
    .select('direction, from_email')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })
  if (msgError) {
    console.error('[inbox.convert] messages read failed', { orgId, threadId, code: msgError.code })
    return { ok: false, error: 'Couldn’t load this conversation. Try again.' }
  }
  const sender = latestInboundSender(
    (msgs ?? []).map((m) => ({ direction: m.direction as 'inbound' | 'outbound', fromEmail: m.from_email })),
  )
  const check = await checkSenderForUnit(db, orgId, home.unitId, sender)
  if (!check.verified || !sender) {
    return {
      ok: false,
      error: 'The sender’s address isn’t on file for a resident of this home, so a contact update can’t be filed for them. Update the People section on the property page instead.',
    }
  }

  const checked = checkContactForm({ phone: input.phone, email: input.email, mailing: input.mailing }, { requireEmail: false })
  if (!checked.ok) {
    return { ok: false, error: Object.values(checked.fieldErrors)[0] ?? 'Check the highlighted fields.', fieldErrors: checked.fieldErrors }
  }
  const changes: ContactChange[] = (['phone', 'email', 'mailing'] as const)
    .filter((f) => checked.values[f] !== null)
    .map((f) => ({ field: f, from: null, to: checked.values[f] }))
  if (changes.length === 0) return { ok: false, error: 'Fill in at least one detail to update.' }
  if (checked.values.email === sender) {
    return { ok: false, error: 'That email is already the one they wrote from.', fieldErrors: { email: 'Already on file.' } }
  }

  // One waiting request per sender per home.
  const { data: waiting, error: waitError } = await db
    .from('tickets')
    .select('id, subject, description, submitted_by')
    .eq('organization_id', orgId)
    .eq('unit_id', home.unitId)
    .eq('subject', CONTACT_SUBJECT)
    .in('status', OPEN_STATUSES)
    .is('deleted_at', null)
    .limit(20)
  if (waitError) {
    console.error('[inbox.convert] contact tickets read failed', { orgId, threadId, code: waitError.code })
    return { ok: false, error: 'Couldn’t check for a waiting request. Try again.' }
  }
  // A waiting request counts only as far as its real submitter backs it
  // (trustContactTickets): an "Emailed in by" line only from a board/admin
  // submitter, a "Signed in as" line only when it is the submitter's own
  // sign-in email. A resident can't block this filing by typing either.
  const trusted = await trustContactTickets(db, orgId, waiting ?? [], { submitterEmails: authSubmitterEmails })
  if (trusted === null) return { ok: false, error: 'Couldn’t check for a waiting request. Try again.' }
  const dup = trusted.find((t) => t.request.signInEmail === sender)
  if (dup) {
    return { ok: false, error: 'A contact update for this resident is already waiting in Approvals. Decide that one first.' }
  }

  const { data: unit, error: unitError } = await db
    .from('units')
    .select('association_id')
    .eq('organization_id', orgId)
    .eq('id', home.unitId)
    .maybeSingle()
  if (unitError) {
    console.error('[inbox.convert] unit read failed', { orgId, threadId, code: unitError.code })
    return { ok: false, error: 'Couldn’t load this home. Try again.' }
  }

  const { data: row, error } = await db
    .from('tickets')
    .insert({
      organization_id: orgId,
      association_id: unit?.association_id ?? null,
      unit_id: home.unitId,
      submitted_by: userId,
      category: CONTACT_CATEGORY,
      subject: CONTACT_SUBJECT,
      description: formatInboxContactRequest(changes, sender),
      status: 'open',
    })
    .select('id')
    .single()
  if (error || !row) {
    console.error('[inbox.convert] contact ticket insert failed', { orgId, threadId, code: codeOf(error) })
    return { ok: false, error: 'Couldn’t file the contact update. Try again.' }
  }

  const linked = await writeThreadLink(db, { orgId, userId, threadId, type: 'ticket', resourceId: row.id })
  revalidateThread(threadId)
  revalidatePath('/approvals')
  const message = 'Contact update filed. Approve it in Approvals → Contact updates.'
  return linked.ok ? { ok: true, message, ack: CONTACT_ACK } : { ok: true, message, ack: CONTACT_ACK, warning: 'It couldn’t be linked to this email. Use Create from email → Link an existing record.' }
}

// ─── Link an existing record ────────────────────────────────────────

const LINKABLE = ['ticket', 'arc_request', 'violation'] as const
type Linkable = (typeof LINKABLE)[number]

export type CandidatesResult = { ok: true; candidates: LinkCandidate[]; filed: boolean } | { ok: false; error: string }

/** Tickets, ARC applications and violations on the thread's home, minus what's already linked. */
export async function listLinkCandidates(threadId: string): Promise<CandidatesResult> {
  if (!uuid.safeParse(threadId).success) return { ok: false, error: 'Thread not found.' }
  const s = await session()
  if (!s.ok) return s
  const { db, orgId } = s
  const home = await threadHome(db, orgId, threadId)
  if (!home.ok) return home
  if (!home.unitId) return { ok: true, candidates: [], filed: false }

  const none = Promise.resolve({ data: [], error: null })
  const [tickets, arcs, violations, links] = await Promise.all([
    db
      .from('tickets')
      .select('id, subject, status, created_at, unit_id, organization_id')
      .eq('organization_id', orgId)
      .in('unit_id', home.unitIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(25),
    db
      .from('arc_requests')
      .select('id, summary, status, submitted_at, unit_id, organization_id')
      .eq('organization_id', orgId)
      .in('unit_id', home.unitIds)
      .is('deleted_at', null)
      .order('submitted_at', { ascending: false })
      .limit(25),
    home.propertyId
      ? db
          .from('hoa_violations')
          .select('id, violation_type, status, created_at, property_id, org_id')
          .eq('org_id', orgId)
          .eq('property_id', home.propertyId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(25)
      : none,
    db.from('inbox_thread_links').select('resource_type, resource_id').eq('organization_id', orgId).eq('thread_id', threadId),
  ])
  for (const [table, r] of [['tickets', tickets], ['arc_requests', arcs], ['hoa_violations', violations], ['inbox_thread_links', links]] as const) {
    if (r.error) {
      console.error('[inbox.convert] candidates read failed', { orgId, threadId, table, code: codeOf(r.error) })
      return { ok: false, error: 'Couldn’t load this home’s records. Try again.' }
    }
  }
  const units = new Set(home.unitIds)
  const rows: LinkCandidate[] = [
    ...((tickets.data ?? []) as Array<{ id: string; subject: string; status: string; created_at: string; unit_id: string | null; organization_id: string }>)
      .filter((t) => t.organization_id === orgId && t.unit_id !== null && units.has(t.unit_id))
      .map((t) => ({ type: 'ticket' as const, id: t.id, label: t.subject, status: t.status, date: t.created_at })),
    ...((arcs.data ?? []) as Array<{ id: string; summary: string; status: string; submitted_at: string | null; unit_id: string | null; organization_id: string }>)
      .filter((a) => a.organization_id === orgId && a.unit_id !== null && units.has(a.unit_id))
      .map((a) => ({ type: 'arc_request' as const, id: a.id, label: a.summary, status: a.status, date: a.submitted_at })),
    ...((violations.data ?? []) as Array<{ id: string; violation_type: string; status: string; created_at: string | null; property_id: string; org_id: string }>)
      .filter((v) => v.org_id === orgId && v.property_id === home.propertyId)
      .map((v) => ({ type: 'violation' as const, id: v.id, label: v.violation_type.replace(/_/g, ' '), status: v.status, date: v.created_at })),
  ]
  const already = ((links.data ?? []) as Array<{ resource_type: string; resource_id: string }>).map((l) => ({ type: l.resource_type, id: l.resource_id }))
  return { ok: true, candidates: pickLinkCandidates(rows, already), filed: true }
}

/**
 * Link one of the home's records. Re-checked on the server: the record
 * must be a live one of that type in this org (writeThreadLink) AND on
 * the thread's home — the picker's scope is enforced, not just shown.
 */
export async function linkExistingRecord(input: { threadId: string; type: string; id: string }): Promise<ConvertResult> {
  const type = LINKABLE.find((t) => t === input.type) as Linkable | undefined
  if (!type || !uuid.safeParse(input.threadId).success || !uuid.safeParse(input.id).success) {
    return { ok: false, error: 'Invalid link target.' }
  }
  const s = await session()
  if (!s.ok) return s
  const { db, orgId, userId } = s
  const home = await threadHome(db, orgId, input.threadId)
  if (!home.ok) return home
  if (!home.unitId) return { ok: false, error: 'File this email under a home first.' }

  const target = await verifyLinkTarget(db, orgId, type, input.id)
  if (!target.ok) {
    return { ok: false, error: target.reason === 'failed' ? 'Could not link this thread. Try again.' : 'That record wasn’t found in this community.' }
  }
  const onHome =
    type === 'violation'
      ? home.propertyId !== null && target.propertyId === home.propertyId
      : target.unitId !== null && home.unitIds.includes(target.unitId)
  if (!onHome) return { ok: false, error: 'That record is for a different home.' }

  const written = await writeThreadLink(db, { orgId, userId, threadId: input.threadId, type, resourceId: input.id })
  if (!written.ok) return { ok: false, error: written.error }
  revalidateThread(input.threadId)
  return { ok: true, message: 'Linked.' }
}
