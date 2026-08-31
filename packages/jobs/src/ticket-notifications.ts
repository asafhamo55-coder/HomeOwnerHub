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
 * Fan-out. Fire-and-forget from the caller's perspective: the event is sent
 * by createResidentTicket and nothing downstream can fail the insert.
 */
export const ticketNotificationsJob = inngest.createFunction(
  { id: 'ticket-notifications', name: 'Notify the board of a new ticket' },
  { event: 'ticket/created' },
  async ({ event, logger, step }) => {
    const { ticketId, organizationId } = event.data as {
      ticketId: string
      organizationId: string
    }
    const db = createAdminClient()

    const ticket = await step.run('load-ticket', async () => {
      const { data } = await db
        .from('tickets' as never)
        .select('id, subject, category, unit_id, submitted_by, organization_id')
        .eq('id', ticketId)
        .maybeSingle()
      return data as {
        id: string
        subject: string
        category: string | null
        unit_id: string | null
        submitted_by: string | null
        organization_id: string
      } | null
    })
    if (!ticket) {
      logger.warn(`ticket-notifications: ticket ${ticketId} not found`)
      return { notified: 0 }
    }

    const recipients = await step.run('resolve-recipients', async () => {
      const { data } = await db
        .from('org_members')
        .select('user_id, role')
        .eq('org_id', organizationId)
      return boardRecipients((data ?? []) as OrgMemberRow[], ticket.submitted_by)
    })
    if (recipients.length === 0) return { notified: 0 }

    const unitLabel = await step.run('resolve-unit', async () => {
      if (!ticket.unit_id) return null
      const { data } = await db
        .from('units' as never)
        .select('label, address_line1')
        .eq('id', ticket.unit_id)
        .maybeSingle()
      const row = data as { label: string | null; address_line1: string | null } | null
      return row?.label ?? row?.address_line1 ?? null
    })

    const content = buildTicketNotification({
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      unitLabel,
    })

    // The durable record. Written before any push is attempted, so a
    // provider outage costs the OS banner and nothing else. The partial
    // unique index on (user_id, kind, entity_id) makes an Inngest retry
    // idempotent rather than duplicating every row.
    await step.run('write-notifications', async () => {
      const { error } = await db.from('notifications' as never).upsert(
        recipients.map((userId) => ({
          organization_id: organizationId,
          user_id: userId,
          kind: 'ticket.created',
          title: content.title,
          body: content.body,
          link: content.link,
          entity_type: 'ticket',
          entity_id: ticket.id,
        })) as never,
        { onConflict: 'user_id,kind,entity_id', ignoreDuplicates: true } as never,
      )
      // Migration 0053 may not be applied yet. Log and continue to push
      // rather than failing the job — see the spec's degradation section.
      if (error) logger.warn(`ticket-notifications: notifications insert: ${error.message}`)
    })

    const pushed = await step.run('send-push', async () => {
      const { sendPushToUsers } = await import('./web-push')
      return sendPushToUsers(db, organizationId, recipients, content, logger)
    })

    return { notified: recipients.length, pushed }
  },
)
