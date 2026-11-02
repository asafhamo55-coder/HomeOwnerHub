// Community board, server side (B5). Reads go through the caller's own session
// so RLS (0078) is the privacy boundary; writes use the service role, so every
// write path here proves membership first (RC-4).
//
// The tables are not in the generated Database types until prod has 0078 and
// gen:types runs, hence the loose client.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@homeowner-portal/db'
import { M13_APPLIED } from '@homeowner-portal/db/m13'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteMember, requireRouteUser } from '@/lib/api/auth'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { authorLabel, canUseAssociationBoard, isBoardModerator, type BoardRole } from './rules'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = SupabaseClient<any, 'public', any>

export function looseAdmin(): LooseDb {
  return createAdminClient() as unknown as LooseDb
}

export async function looseSession(): Promise<LooseDb> {
  return (await getSupabaseServerClient()) as unknown as LooseDb
}

export interface BoardActor {
  orgId: string
  userId: string
  role: BoardRole
  /** Associations a resident lives in (empty for a moderator, who uses the whole org). */
  residentAssociationIds: string[]
}

/** The associations the signed-in person lives in, from the same function the RLS policies use. */
export async function residentAssociationIds(session: LooseDb): Promise<string[]> {
  const { data, error } = await session.rpc('community_board_association_ids')
  if (error) {
    logRouteFailure('community-board.associations', error)
    throw new ApiRouteError('internal')
  }
  return Array.isArray(data) ? (data as string[]) : []
}

/**
 * Gate for every board route: the feature is on, the caller is a member of the
 * current org (professionals are refused), and a resident's association list is
 * loaded. Auth comes first (RC-3); the flag answers 404 so a dark feature does
 * not exist.
 */
export async function requireBoardActor(): Promise<BoardActor> {
  const { orgId, role } = await requireRouteMember()
  const { userId } = await requireRouteUser()
  if (!M13_APPLIED) throw new ApiRouteError('not_found')
  const ids = isBoardModerator(role) ? [] : await residentAssociationIds(await looseSession())
  return { orgId, userId, role, residentAssociationIds: ids }
}

export function requireModerator(actor: BoardActor): void {
  if (!isBoardModerator(actor.role)) {
    throw new ApiRouteError('forbidden', 'Only the board can do this.')
  }
}

export function requireAssociationAccess(actor: BoardActor, associationId: string): void {
  if (!canUseAssociationBoard(actor.role, associationId, actor.residentAssociationIds)) {
    // Same answer as a missing row: do not confirm another community's ids exist.
    throw new ApiRouteError('not_found')
  }
}

/** The name a neighbour sees for this person. */
export async function displayLabel(admin: LooseDb, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  return authorLabel((data as { full_name: string | null } | null)?.full_name)
}

export interface ThreadRow {
  id: string
  organization_id: string
  association_id: string
  title: string
  created_by: string | null
  closed_at: string | null
  hidden_at: string | null
  last_activity_at: string
  created_at: string
}

export interface PostRow {
  id: string
  organization_id: string
  association_id: string
  thread_id: string
  author_id: string | null
  author_label: string
  author_is_board: boolean
  is_opening: boolean
  body: string
  hidden_at: string | null
  hidden_reason: string | null
  created_at: string
}

/** A thread of the caller's org the caller may use, or 404. */
export async function loadThreadForActor(admin: LooseDb, actor: BoardActor, threadId: string): Promise<ThreadRow> {
  const { data, error } = await admin
    .from('board_threads')
    .select('id, organization_id, association_id, title, created_by, closed_at, hidden_at, last_activity_at, created_at')
    .eq('id', threadId)
    .eq('organization_id', actor.orgId)
    .maybeSingle()
  if (error) {
    logRouteFailure('community-board.thread', error, { orgId: actor.orgId })
    throw new ApiRouteError('internal')
  }
  const row = data as ThreadRow | null
  if (!row) throw new ApiRouteError('not_found')
  requireAssociationAccess(actor, row.association_id)
  if (row.hidden_at && !isBoardModerator(actor.role)) throw new ApiRouteError('not_found')
  return row
}

/** A post of the caller's org the caller may use, or 404. */
export async function loadPostForActor(admin: LooseDb, actor: BoardActor, postId: string): Promise<PostRow> {
  const { data, error } = await admin
    .from('board_posts')
    .select('id, organization_id, association_id, thread_id, author_id, author_label, author_is_board, is_opening, body, hidden_at, hidden_reason, created_at')
    .eq('id', postId)
    .eq('organization_id', actor.orgId)
    .maybeSingle()
  if (error) {
    logRouteFailure('community-board.post', error, { orgId: actor.orgId })
    throw new ApiRouteError('internal')
  }
  const row = data as PostRow | null
  if (!row) throw new ApiRouteError('not_found')
  requireAssociationAccess(actor, row.association_id)
  if (row.hidden_at && !isBoardModerator(actor.role)) throw new ApiRouteError('not_found')
  // A post of a hidden thread is hidden with it, for residents.
  if (!isBoardModerator(actor.role)) await loadThreadForActor(admin, actor, row.thread_id)
  return row
}
