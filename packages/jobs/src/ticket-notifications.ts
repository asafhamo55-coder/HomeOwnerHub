/**
 * Tell the board when a resident opens a ticket.
 *
 * createResidentTicket used to insert the row, revalidate two paths, and
 * return — nobody was told, on any channel, so a reported leak waited until
 * someone happened to open /tickets.
 *
 * This runs as an Inngest job rather than inline in the server action for
 * two reasons: a resident must not wait on the board's notifications, and a
 * push-provider hiccup must not fail or slow ticket creation. See
 * docs/superpowers/specs/2026-08-31-ticket-notifications-design.md.
 *
 * `notifications` rows are the RECORD; Web Push is an optimisation on top.
 * A board member who never grants permission still sees the in-app list,
 * and a failed push never loses the notification.
 */

import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'

/** Roles that run the association and should hear about a new ticket. */
const NOTIFIED_ROLES = new Set(['board', 'admin'])

/** OS notification bodies are clipped around this; truncate deliberately. */
const MAX_BODY = 160

export interface OrgMemberRow {
  user_id: string
  role: string
}

/**
 * Who hears about a ticket: board members and admins, in listing order,
 * each once, never the person who opened it.
 *
 * The reporter exclusion is not cosmetic — a board member who also owns a
 * unit files tickets like any other resident, and being pushed your own
 * submission is the fastest way to make someone turn notifications off.
 */
export function boardRecipients(
  members: OrgMemberRow[],
  submittedBy: string | null,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of members) {
    if (!NOTIFIED_ROLES.has(m.role)) continue
    if (submittedBy && m.user_id === submittedBy) continue
    if (seen.has(m.user_id)) continue
    seen.add(m.user_id)
    out.push(m.user_id)
  }
  return out
}

export interface TicketSummary {
  id: string
  subject: string
  category?: string | null
  unitLabel: string | null
}

export interface NotificationContent {
  title: string
  body: string
  link: string
  /** Collapses repeat pushes for one ticket into a single OS notification. */
  tag: string
}

/**
 * The unit leads the title because that is what a board member triages on —
 * "10079 Trumpet Pk" tells them whose problem it is before they open
 * anything. The subject is the body, truncated rather than left for the OS
 * to clip mid-word.
 */
export function buildTicketNotification(ticket: TicketSummary): NotificationContent {
  const subject = ticket.subject.trim()
  const body =
    subject.length === 0
      ? 'A resident submitted a new ticket.'
      : subject.length > MAX_BODY
        ? `${subject.slice(0, MAX_BODY - 1)}…`
        : subject

  return {
    title: ticket.unitLabel ? `New ticket — ${ticket.unitLabel}` : 'New ticket',
    body,
    link: `/tickets/${ticket.id}`,
    tag: `ticket:${ticket.id}`,
  }
}

/**
 * Whether a push failure means the endpoint is gone for good.
 *
 * Only 404 and 410 say the subscription no longer exists. Everything else —
 * rate limits, provider 5xx, a bad VAPID header (401), too large a payload
 * (413) — is transient or our fault, and deleting the row for those would
 * silently unsubscribe a board member who did nothing wrong.
 */
export function isDeadSubscription(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}

/**
 * The step surface this job needs. Deliberately NON-generic: Inngest's
 * real `step.run` returns Jsonify<Awaited<T>>, which is not assignable
 * back to an arbitrary T, so a generic signature fails structural typing
 * against the real step object. See the same finding at
 * mailbox-send.ts:27-32, where it was tried and abandoned.
 */
export interface TicketNotificationsStep {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>
}

export interface TicketNotificationsLogger {
  warn(message: string): void
}

export interface TicketNotificationsPayload {
  ticketId: string
  organizationId: string
}

/**
 * Notify the board that a resident opened a ticket.
 *
 * Exported so it can be driven against a real database. The Inngest
 * wrapper below is a thin shell: it unwraps the event and supplies the
 * admin client, and holds no logic worth testing.
 */
export async function runTicketNotifications(
  db: ReturnType<typeof createAdminClient>,
  step: TicketNotificationsStep,
  logger: TicketNotificationsLogger,
  payload: TicketNotificationsPayload,
): Promise<{ notified: number; pushed?: number }> {
  const { ticketId, organizationId: payloadOrganizationId } = payload

  const ticket = (await step.run('load-ticket', async () => {
    const { data } = await db
      .from('tickets')
      .select('id, subject, category, unit_id, submitted_by, organization_id')
      .eq('id', ticketId)
      .maybeSingle()
    return data
  })) as {
    id: string
    subject: string
    category: string | null
    unit_id: string | null
    submitted_by: string | null
    organization_id: string
  } | null

  if (!ticket) {
    logger.warn(`ticket-notifications: ticket ${ticketId} not found`)
    return { notified: 0 }
  }

  // Tenant isolation: the ticket's own org is the only org that counts. The
  // event payload is caller-supplied and is never used to pick recipients,
  // write notifications or send pushes.
  const organizationId = ticket.organization_id
  if (payloadOrganizationId !== organizationId) {
    logger.warn(
      `ticket-notifications: payload org ${payloadOrganizationId} does not match ticket ${ticketId} org ${organizationId}; using the ticket's org`,
    )
  }

  const recipients = (await step.run('resolve-recipients', async () => {
    const { data } = await db
      .from('org_members')
      .select('user_id, role')
      .eq('org_id', organizationId)
    return boardRecipients((data ?? []) as OrgMemberRow[], ticket.submitted_by)
  })) as string[]
  if (recipients.length === 0) return { notified: 0 }

  const unitLabel = (await step.run('resolve-unit', async () => {
    if (!ticket.unit_id) return null
    const { data } = await db
      .from('units')
      .select('label, address_line1')
      .eq('id', ticket.unit_id)
      .eq('organization_id', organizationId)
      .maybeSingle()
    const row = data as { label: string | null; address_line1: string | null } | null
    return row?.label ?? row?.address_line1 ?? null
  })) as string | null

  const content = buildTicketNotification({
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    unitLabel,
  })

  // The durable record, written before any push is attempted, so a
  // provider outage costs the OS banner and nothing else.
  await step.run('write-notifications', async () => {
    // Dedupe by reading first rather than ON CONFLICT. The unique index
    // guarding this is PARTIAL (`WHERE entity_id IS NOT NULL`), and
    // Postgres infers a partial index for ON CONFLICT only if the
    // statement repeats that predicate — which PostgREST cannot emit. An
    // upsert here fails outright with "no unique or exclusion constraint
    // matching the ON CONFLICT specification".
    const { data: existing } = await db
      .from('notifications')
      .select('user_id')
      .eq('kind', 'ticket.created')
      .eq('entity_id', ticket.id)
    const already = new Set(((existing ?? []) as { user_id: string }[]).map((r) => r.user_id))
    const fresh = recipients.filter((userId) => !already.has(userId))
    if (fresh.length === 0) return

    const { error } = await db.from('notifications').insert(
      fresh.map((userId) => ({
        organization_id: organizationId,
        user_id: userId,
        kind: 'ticket.created',
        title: content.title,
        body: content.body,
        link: content.link,
        entity_type: 'ticket',
        entity_id: ticket.id,
      })),
    )
    // 23505 means a concurrent retry inserted the same rows between the
    // read and the write — the desired end state either way.
    if (error && error.code !== '23505') {
      logger.warn(`ticket-notifications: notifications insert: ${error.message}`)
    }
  })

  const pushed = (await step.run('send-push', async () => {
    const { sendPushToUsers } = await import('./web-push')
    return sendPushToUsers(db, organizationId, recipients, content, logger)
  })) as number

  return { notified: recipients.length, pushed }
}

/**
 * Fan-out. Fire-and-forget from the caller's perspective: the event is
 * sent by createResidentTicket and nothing downstream can fail the insert.
 */
export const ticketNotificationsJob = inngest.createFunction(
  { id: 'ticket-notifications', name: 'Notify the board of a new ticket' },
  { event: 'ticket/created' },
  async ({ event, logger, step }) => {
    const { ticketId, organizationId } = event.data as TicketNotificationsPayload
    return runTicketNotifications(createAdminClient(), step, logger, {
      ticketId,
      organizationId,
    })
  },
)
