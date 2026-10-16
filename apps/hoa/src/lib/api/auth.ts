// Route-handler auth gates (RC-3, RC-4). Thin wrappers over the role model
// the app already has — getCurrentUserRole (lib/auth.ts) and
// requireBoardOrAdminForAction (lib/accounting/guard.ts) — that THROW the
// envelope instead of returning a result or redirecting. There is no second
// role model here: board/admin vs resident is decided by the same code
// that gates server actions.
//
//   401 unauthenticated — no session
//   403 forbidden       — signed in, but no HOA org (reason: no_org) or wrong role.
//                         A resident hitting a board surface gets 403, not 404.
//
// Every org id a handler uses comes from these, never from the request body.

import { getCurrentUserRole, type Role } from '@/lib/auth'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import type { CurrentOrg } from '@/lib/orgs'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ApiRouteError } from './errors'
import { logRouteFailure } from './log'

const NO_ORG = 'You are not signed in to an organization.'

export async function requireRouteUser(): Promise<{ userId: string }> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new ApiRouteError('unauthenticated')
  return { userId: user.id }
}

async function noOrgOrSignedOut(): Promise<never> {
  await requireRouteUser() // throws 401 when there is no session at all
  throw new ApiRouteError('forbidden', NO_ORG, { reason: 'no_org' })
}

/** Any member of the caller's current HOA org, residents included. For resident-facing surfaces only. */
export async function requireRouteMember(): Promise<{ orgId: string; role: Role; org: CurrentOrg }> {
  const ctx = await getCurrentUserRole()
  if (!ctx) return noOrgOrSignedOut()
  return { orgId: ctx.org.id, role: ctx.role, org: ctx.org }
}

/** The shared board gate. Every board-only route calls this first. */
export async function requireRouteBoardOrAdmin(
  denied: string = BOARD_ONLY_DENIED,
): Promise<{ orgId: string; role: 'admin' | 'board' }> {
  const gate = await requireBoardOrAdminForAction(denied)
  if (gate.ok) return { orgId: gate.orgId, role: gate.role }
  if (gate.error === denied) throw new ApiRouteError('forbidden', denied)
  return noOrgOrSignedOut()
}

/** Platform staff (platform_admins). Not an org role. */
export async function requireRoutePlatformAdmin(): Promise<{ userId: string }> {
  const { userId } = await requireRouteUser()
  if (!(await isPlatformAdmin())) throw new ApiRouteError('forbidden')
  return { userId }
}

interface LooseQuery {
  select(cols: string): LooseQuery
  eq(col: string, value: unknown): LooseQuery
  maybeSingle(): PromiseLike<{ data: unknown; error: { code?: string } | null }>
}

/**
 * A client-supplied foreign id (associationId, fundId, unitId, …) must
 * belong to the caller's org before it is written or used (R-18). A
 * foreign or missing id is 404 not_found — the same answer either way, so
 * it does not confirm another org's ids exist.
 */
export async function requireOrgOwned(
  table: string,
  id: string,
  orgId: string,
  opts: { orgColumn?: 'organization_id' | 'org_id'; message?: string } = {},
): Promise<void> {
  const supabase = (await getSupabaseServerClient()) as unknown as { from(t: string): LooseQuery }
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq(opts.orgColumn ?? 'organization_id', orgId)
    .maybeSingle()
  if (error) {
    logRouteFailure(`org-owned.${table}`, error, { orgId })
    throw new ApiRouteError('internal')
  }
  if (!data) throw new ApiRouteError('not_found', opts.message)
}
