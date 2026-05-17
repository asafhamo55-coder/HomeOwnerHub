'use server'

// RBAC helpers. Used by layouts and server actions to enforce role
// gates introduced in migration 0012. RLS is the backstop at the DB
// layer; these helpers fail fast in app code so the user gets a clean
// redirect instead of a cryptic DB error.

import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg, type CurrentOrg } from '@/lib/orgs'

export type Role = 'admin' | 'board' | 'resident'

// ─── Reads ───────────────────────────────────────────────────────────

export async function getCurrentUserRoleInOrg(
  orgId: string,
): Promise<Role | null> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle<{ role: Role | string }>()

  if (!data) return null
  const role = data.role
  if (role === 'admin' || role === 'board' || role === 'resident') return role
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
