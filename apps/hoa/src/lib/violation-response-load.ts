import 'server-only'

/**
 * BL-129: the read behind /resident/violations/[id] for a violation on the
 * resident's own home. Not a server action (no 'use server'): only the
 * page calls it. See violation-response.ts for where responses live.
 */

import { createAdminClient } from '@homeowner-portal/db'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { getCurrentOrg } from '@/lib/orgs'
import {
  findResponseTicketId,
  loadOwnViolation,
  residentViolationView,
  type ResidentViolationView,
} from '@/lib/violation-response'
import { loadResidentHearing, type ResidentHearingLoad } from '@/lib/violation-hearings/queries'

export interface MyViolationThread {
  ticketId: string
  messages: Array<{ id: string; author_role: 'resident' | 'board' | 'admin'; body: string; created_at: string }>
}

export type MyHomeViolation =
  | {
      ok: true
      violation: ResidentViolationView
      thread: MyViolationThread | null
      threadFailed: boolean
      canRespond: boolean
      /** BL-133 (M4_APPLIED): the hearing request and, once noticed, the hearing. `off` while the flag is off. */
      hearing: ResidentHearingLoad
    }
  | { ok: false; reason: 'not_found' | 'error' }

export async function loadMyHomeViolation(violationId: string): Promise<MyHomeViolation> {
  const [actor, units, org] = await Promise.all([getResidentActor(), getResidentUnits(), getCurrentOrg()])
  const orgId = actor.orgId ?? org?.id ?? null
  if (!orgId) return { ok: false, reason: 'not_found' }

  const own = await loadOwnViolation(actor.client, {
    violationId,
    unitIds: units.map((u) => u.unit_id),
    orgId,
  })
  if (!own.ok) return own
  const violation = residentViolationView(own.violation)
  // BL-133: service role for the hearing only, after loadOwnViolation
  // confirmed the home; scoped to this org and violation, limited columns.
  // No query at all while M4_APPLIED is off.
  const hearing = await loadResidentHearing(createAdminClient() as never, orgId, violationId)

  // An impersonated account-less owner has no user id, so no thread; an
  // impersonating admin reads but never writes.
  if (!actor.id) {
    return { ok: true, violation, thread: null, threadFailed: false, canRespond: false, hearing }
  }

  // Service role for the link only, after loadOwnViolation confirmed the
  // home; scoped to this org, violation and resident.
  const ticketId = await findResponseTicketId(createAdminClient(), { orgId, violationId, userId: actor.id })
  const canRespond = !actor.impersonating && !violation.closed
  if (ticketId === 'error') return { ok: true, violation, thread: null, threadFailed: true, canRespond: false, hearing }
  if (!ticketId) return { ok: true, violation, thread: null, threadFailed: false, canRespond, hearing }

  const [ticketRes, msgRes] = await Promise.all([
    actor.client
      .from('tickets' as never)
      .select('id, description, created_at')
      .eq('id', ticketId)
      .eq('organization_id' as never, orgId)
      .eq('submitted_by' as never, actor.id)
      .is('deleted_at', null)
      .maybeSingle(),
    // internal: false — explicit, because the impersonated client is the
    // service role and would otherwise show the board's internal notes.
    actor.client
      .from('ticket_messages' as never)
      .select('id, author_role, body, created_at')
      .eq('ticket_id', ticketId)
      .eq('internal' as never, false)
      .order('created_at', { ascending: true }),
  ])
  if (ticketRes.error || msgRes.error) {
    console.error('[violation-response] thread read failed', { code: ticketRes.error?.code ?? msgRes.error?.code ?? null })
    return { ok: true, violation, thread: null, threadFailed: true, canRespond: false, hearing }
  }
  const ticket = ticketRes.data as { id: string; description: string; created_at: string } | null
  // The link exists but the board deleted the ticket: nothing to show, and
  // nowhere visible to write to.
  if (!ticket) return { ok: true, violation, thread: null, threadFailed: true, canRespond: false, hearing }

  const messages = [
    { id: `${ticket.id}-first`, author_role: 'resident' as const, body: ticket.description, created_at: ticket.created_at },
    ...((msgRes.data ?? []) as MyViolationThread['messages']),
  ]
  return { ok: true, violation, thread: { ticketId: ticket.id, messages }, threadFailed: false, canRespond, hearing }
}
