// In-app (bell) notifications for the board when a resident acts.
//
// BELL ROWS ONLY. This module never sends email, SMS or push and never goes
// near the outbound guard: it writes `notifications` rows and nothing else.
// It is not a 'use server' file (it exports sync helpers) and is called from
// the resident server actions AFTER their main insert succeeded.
//
// Row shape, recipients and dedupe match packages/jobs/src/ticket-notifications.ts:
// board and admin members of ONE org, never the person who acted, one row per
// (user_id, kind, entity_id). The unique index behind that is partial, so
// PostgREST cannot upsert against it: read the existing rows first, insert
// only the missing ones, and treat a concurrent 23505 as the end state.

import { createAdminClient } from '@homeowner-portal/db'
import { reportError } from '@homeowner-portal/observability/report'

export const BOARD_NOTIFY_KINDS = {
  ticketReply: 'ticket.resident_reply',
  arcCreated: 'arc.created',
  concernCreated: 'concern.created',
} as const

const NOTIFIED_ROLES = ['board', 'admin']
const MAX_SUBJECT = 80

export interface BoardBellInput {
  organizationId: string
  /** The resident who acted. Never notified. */
  actorId: string
  kind: string
  title: string
  body: string | null
  link: string
  entityType: string
  /** The message, request or report id the row is deduped on. */
  entityId: string
}

function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > MAX_SUBJECT ? `${t.slice(0, MAX_SUBJECT - 1)}…` : t
}

export function ticketReplyBell(args: {
  organizationId: string
  actorId: string
  ticketId: string
  messageId: string
  subject: string
}): BoardBellInput {
  return {
    organizationId: args.organizationId,
    actorId: args.actorId,
    kind: BOARD_NOTIFY_KINDS.ticketReply,
    title: `New reply on '${clip(args.subject) || 'a ticket'}'`,
    body: 'A resident replied. Open the ticket to read it.',
    link: `/tickets/${args.ticketId}`,
    entityType: 'ticket_message',
    entityId: args.messageId,
  }
}

export function arcCreatedBell(args: {
  organizationId: string
  actorId: string
  arcId: string
  summary: string
}): BoardBellInput {
  const what = clip(args.summary)
  return {
    organizationId: args.organizationId,
    actorId: args.actorId,
    kind: BOARD_NOTIFY_KINDS.arcCreated,
    title: what ? `New ARC request: ${what}` : 'New ARC request',
    body: 'A resident submitted an architectural request for review.',
    link: `/arc/${args.arcId}`,
    entityType: 'arc_request',
    entityId: args.arcId,
  }
}

export function concernCreatedBell(args: {
  organizationId: string
  actorId: string
  reportId: string
}): BoardBellInput {
  return {
    organizationId: args.organizationId,
    actorId: args.actorId,
    kind: BOARD_NOTIFY_KINDS.concernCreated,
    title: 'New concern reported',
    body: 'A resident reported a concern. Open it to review.',
    link: `/violations/reports/${args.reportId}`,
    entityType: 'violation_report',
    entityId: args.reportId,
  }
}

type Db = ReturnType<typeof createAdminClient>

/**
 * Write one bell row per board/admin member of the org, once per entity.
 * Returns the number of rows written. Throws on a failed read or insert;
 * callers use notifyBoardSafely so that never reaches the resident.
 */
export async function writeBoardBellRows(db: Db, input: BoardBellInput): Promise<number> {
  const { data: members, error: membersErr } = await db
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', input.organizationId)
    .in('role', NOTIFIED_ROLES)
  if (membersErr) throw new Error(`board-notify: members read failed (${membersErr.code ?? 'no code'})`)

  const recipients = [
    ...new Set(
      ((members ?? []) as Array<{ user_id: string | null; role: string }>)
        .filter((m) => !!m.user_id && NOTIFIED_ROLES.includes(m.role) && m.user_id !== input.actorId)
        .map((m) => m.user_id as string),
    ),
  ]
  if (recipients.length === 0) return 0

  const { data: existing, error: readErr } = await db
    .from('notifications' as never)
    .select('user_id')
    .eq('organization_id', input.organizationId)
    .eq('kind', input.kind)
    .eq('entity_id', input.entityId)
  if (readErr) {
    throw new Error(`board-notify: dedupe read failed (${(readErr as { code?: string }).code ?? 'no code'})`)
  }
  const already = new Set(((existing ?? []) as Array<{ user_id: string }>).map((r) => r.user_id))
  const fresh = recipients.filter((id) => !already.has(id))
  if (fresh.length === 0) return 0

  const { error } = await db.from('notifications' as never).insert(
    fresh.map((userId) => ({
      organization_id: input.organizationId,
      user_id: userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.link,
      entity_type: input.entityType,
      entity_id: input.entityId,
    })) as never,
  )
  if (error) {
    // 23505: a concurrent submit wrote the same rows; that is the end state.
    if ((error as { code?: string }).code === '23505') return 0
    throw new Error(`board-notify: insert failed (${(error as { code?: string }).code ?? 'no code'})`)
  }
  return fresh.length
}

/**
 * The call the server actions make. Never throws: the resident's submission
 * is already saved, and a bell failure must not turn it into an error.
 * Failures go to reportError with ids and the kind only.
 */
export async function notifyBoardSafely(input: BoardBellInput): Promise<void> {
  try {
    await writeBoardBellRows(createAdminClient(), input)
  } catch (err) {
    reportError(err, 'board-in-app-notify', {
      kind: input.kind,
      entityId: input.entityId,
      organizationId: input.organizationId,
    })
  }
}
