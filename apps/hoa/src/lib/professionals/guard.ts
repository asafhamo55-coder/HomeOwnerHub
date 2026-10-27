// BL-168 — role gates for the professional and officer actions.
//
// Server actions are public POST endpoints (see the gate ratchet in
// src/server-action-gate-ratchet.test.ts): the (pro) and (dashboard)
// layouts redirecting the wrong role does nothing to stop a direct POST.
// RLS (migration 0071) is the real boundary; these fail fast with a
// readable error, before any service-role client is built.
//
// Returns a result rather than redirecting, like accounting/guard.ts.

import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { getCurrentUserRole } from '@/lib/auth'
import { getSignedInUser } from '@/lib/orgs'
import { isProfessionalRole, type ProfessionalRole } from '@/lib/roles'
import { PRO_ROLES } from './model'

export const PRO_DENIED = 'This isn’t available to your role.'
export const NOT_LIVE = 'Professional access isn’t switched on yet.'
export const NOT_SIGNED_IN = 'You are not signed in to an organization.'

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

export type ProGate =
  | { ok: true; role: ProfessionalRole; orgId: string; userId: string }
  | { ok: false; error: string }

/**
 * An ACTIVE CPA or attorney (expired grants resolve to no role at all:
 * lib/orgs.ts getMembershipRole), limited to `roles`. Call first in every
 * action a professional may take.
 */
export async function requireProfessionalForAction(
  roles: readonly ProfessionalRole[] = PRO_ROLES,
  denied: string = PRO_DENIED,
): Promise<ProGate> {
  const ctx = await getCurrentUserRole()
  if (!ctx) return { ok: false, error: NOT_SIGNED_IN }
  // Before M6_APPLIED no professional role resolves (lib/auth.ts), so every
  // caller is denied here with the same message; the flag check below is
  // belt and braces.
  if (!isProfessionalRole(ctx.role) || !roles.includes(ctx.role)) return { ok: false, error: denied }
  if (!M6_APPLIED) return { ok: false, error: NOT_LIVE }
  const user = await getSignedInUser()
  if (!user) return { ok: false, error: NOT_SIGNED_IN }
  return { ok: true, role: ctx.role, orgId: ctx.org.id, userId: user.id }
}
