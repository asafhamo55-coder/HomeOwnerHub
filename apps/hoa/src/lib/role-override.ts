'use server'

// Admin-only role override for testing. Sets an HTTPOnly cookie that
// downstream layouts read to decide which UI tree to render. Has zero
// effect on RLS or server-side authorization — those always reference
// the real role from `org_members`. The override is purely UI routing.
//
// To disable in production: remove the RoleOverrideMount from the
// dashboard + resident layouts, or wrap it in a NODE_ENV / env-flag
// check. The server actions below stay no-op-safe even when the UI
// is gone, since they require the real user to be admin.

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg, type Role } from '@/lib/auth'

const COOKIE = 'hh_role_override'
const VALID: Role[] = ['admin', 'board', 'resident']

export async function getRoleOverride(): Promise<Role | null> {
  const store = await cookies()
  const value = store.get(COOKIE)?.value
  if (!value) return null
  if (VALID.includes(value as Role)) return value as Role
  return null
}

// Returns the role to use for ROUTING + UI decisions. Admins can
// override via the cookie; everyone else gets their real role.
export async function getEffectiveRoleInOrg(orgId: string): Promise<Role | null> {
  const real = await getCurrentUserRoleInOrg(orgId)
  if (real !== 'admin') return real

  const override = await getRoleOverride()
  return override ?? real
}

// Server action: set the override. Refuses unless the calling user's
// REAL role is admin. Then redirects to the role's home so the UI
// switches immediately.
export async function setRoleOverride(role: Role): Promise<void> {
  if (!VALID.includes(role)) return

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const org = await getCurrentOrg()
  if (!org) return

  const realRole = await getCurrentUserRoleInOrg(org.id)
  if (realRole !== 'admin') {
    // Silent no-op for non-admins. They could only call this by
    // crafting a request — RLS / role check stops it here.
    return
  }

  const store = await cookies()
  store.set(COOKIE, role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours, then forces a reset
  })

  revalidatePath('/')
  revalidatePath('/resident')

  // Send the user to the home for the new role so the UI flips
  // immediately. Throws a NEXT_REDIRECT internally — expected.
  if (role === 'resident') redirect('/resident')
  redirect('/')
}

// Server action: clear the override. Returns the user to their
// real role's UI.
export async function clearRoleOverride(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE)

  revalidatePath('/')
  revalidatePath('/resident')

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const org = await getCurrentOrg()
  if (!org) return

  const realRole = await getCurrentUserRoleInOrg(org.id)
  if (realRole === 'resident') redirect('/resident')
  redirect('/')
}
