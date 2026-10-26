'use server'

// RBAC helpers. Used by layouts and server actions to enforce role
// gates introduced in migration 0012. RLS is the backstop at the DB
// layer; these helpers fail fast in app code so the user gets a clean
// redirect instead of a cryptic DB error.

import { redirect } from 'next/navigation'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { getCurrentOrg, getMembershipRole, type CurrentOrg } from '@/lib/orgs'

import { homeFor, isProfessionalRole, type ProfessionalRole, type Role } from '@/lib/roles'

// BL-168 (migration 0070): cpa and attorney are outside professionals, not
// members. They resolve only once M6_APPLIED is true; with it false the
// vocabulary is exactly today's three roles. The sync helpers live in
// lib/roles.ts (a 'use server' file may export only async functions).
export type { Role, ProfessionalRole }

// ─── Reads ───────────────────────────────────────────────────────────

export async function getCurrentUserRoleInOrg(
  orgId: string,
): Promise<Role | null> {
  // Per-request memoized and answered from the one membership read
  // (lib/orgs.ts) — this ran on every guard, bell and action check.
  const role = await getMembershipRole(orgId)
  if (role === 'admin' || role === 'board' || role === 'resident') return role
  // getMembershipRole already answers null for an expired grant (lib/orgs.ts).
  if (M6_APPLIED && isProfessionalRole(role)) return role
  return null
}

// Picks the role for the user's "current" org (per getCurrentOrg).
// Returns null when there's no signed-in user or no org membership.
export async function getCurrentUserRole(): Promise<{
  role: Role
  org: CurrentOrg
} | null> {
  const org = await getCurrentOrg()
  if (!org) return null
  const role = await getCurrentUserRoleInOrg(org.id)
  if (!role) return null
  return { role, org }
}

// ─── Guards ──────────────────────────────────────────────────────────
// Each guard redirects on failure so callers don't have to thread
// error state. The dashboard/resident layouts call these once at the
// top; individual pages don't need explicit checks.

export async function requireBoardOrAdmin(): Promise<{
  role: 'admin' | 'board'
  org: CurrentOrg
}> {
  const ctx = await getCurrentUserRole()
  if (!ctx) redirect('/onboarding')
  if (ctx.role === 'resident') redirect('/resident')
  // A professional is never board: they have their own home (BL-168).
  if (ctx.role !== 'admin' && ctx.role !== 'board') redirect('/pro')
  return { role: ctx.role, org: ctx.org }
}

export async function requireAdmin(): Promise<{
  role: 'admin'
  org: CurrentOrg
}> {
  const ctx = await getCurrentUserRole()
  if (!ctx) redirect('/onboarding')
  if (ctx.role !== 'admin') redirect('/')
  return { role: 'admin', org: ctx.org }
}

export async function requireResident(): Promise<{
  role: 'resident'
  org: CurrentOrg
}> {
  const ctx = await getCurrentUserRole()
  if (!ctx) redirect('/onboarding')
  // Board/admin land back on the manager dashboard. They have the
  // 'My Account' surface inside the manager UI for their own dues
  // and unit info; the /resident tree is residents-only.
  if (ctx.role !== 'resident') redirect('/')
  return { role: 'resident', org: ctx.org }
}

/**
 * BL-168. Admits exactly the listed roles; anyone else is redirected to
 * their own home. For pages that serve a professional (the (pro) tree).
 * With M6_APPLIED false no professional role resolves, so this admits only
 * admin, board and resident rows from the list.
 */
export async function requireRole<R extends Role>(
  roles: readonly R[],
): Promise<{ role: R; org: CurrentOrg }> {
  const ctx = await getCurrentUserRole()
  if (!ctx) redirect('/onboarding')
  if (!(roles as readonly Role[]).includes(ctx.role)) redirect(homeFor(ctx.role))
  return { role: ctx.role as R, org: ctx.org }
}

/** Any active professional (cpa or attorney). */
export async function requireProfessional(): Promise<{
  role: ProfessionalRole
  org: CurrentOrg
}> {
  return requireRole(['cpa', 'attorney'] as const)
}
