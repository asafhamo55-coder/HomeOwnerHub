/**
 * Who an inbox thread can be assigned to (BL-101 A6): the org's board
 * members and admins, never residents. Stored in the existing
 * `inbox_threads.assigned_to` (FK profiles), so no migration.
 *
 * Names come through the service-role client because profiles RLS only
 * lets a user read their own row (see lib/members.ts listMembers). Every
 * read is scoped to the caller's org, which the caller has already
 * confirmed with requireBoardOrAdmin. Ids only in logs.
 */

import { createAdminClient } from '@homeowner-portal/db'

/** Roles that can own a thread. Mirrors the inbox RLS bar (auth_is_board_or_admin). */
export const ASSIGNABLE_ROLES = ['board', 'admin'] as const

export interface Assignee {
  userId: string
  /** Full name, else email, else a neutral fallback. */
  name: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/**
 * The org's board/admin members with display names, sorted by name. Throws
 * on a failed read: an empty picker would read as "nobody can take this".
 */
export async function listAssignees(orgId: string, db: Db = createAdminClient()): Promise<Assignee[]> {
  const { data, error } = await db
    .from('org_members')
    .select('user_id, role, profile:profiles(email, full_name)')
    .eq('org_id', orgId)
    .in('role', [...ASSIGNABLE_ROLES])
  if (error) {
    console.error('listAssignees: org_members read failed', { orgId, code: error.code })
    throw new Error(`listAssignees: ${error.code ?? 'error'}`)
  }

  const allowed: readonly string[] = ASSIGNABLE_ROLES
  const rows = (data ?? []) as Array<{
    user_id: string | null
    role: string
    profile: { email: string | null; full_name: string | null } | null
  }>
  return rows
    .filter((row): row is typeof row & { user_id: string } => Boolean(row.user_id) && allowed.includes(row.role))
    .map((row) => ({
      userId: row.user_id,
      name: row.profile?.full_name?.trim() || row.profile?.email?.trim() || 'Board member',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Whether `userId` is a board/admin member of `orgId`. Throws on a failed read. */
export async function isAssignableMember(
  orgId: string,
  userId: string,
  db: Db = createAdminClient(),
): Promise<boolean> {
  const { data, error } = await db
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('isAssignableMember: org_members read failed', { orgId, code: error.code })
    throw new Error(`isAssignableMember: ${error.code ?? 'error'}`)
  }
  const allowed: readonly string[] = ASSIGNABLE_ROLES
  return Boolean(data && allowed.includes((data as { role: string }).role))
}
