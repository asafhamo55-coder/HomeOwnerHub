// Admin "enter owner portal" support — the read-side identity resolver.
//
// An admin can view a specific owner's resident portal exactly as that
// owner sees it. This differs from lib/role-override.ts (which only swaps
// the UI *role tree* but keeps the admin's own data): impersonation swaps
// the effective *identity* used by every resident-side read.
//
// Mechanism (modeled on the platform-admin tenant preview in
// lib/platform-admin.ts): an admin-only HTTPOnly cookie pins a target
// owner; getResidentActor() then resolves resident data through a
// service-role client scoped to that owner. It is always READ-ONLY — the
// resident write actions refuse while impersonating.
//
// NOTE: this module is intentionally NOT `'use server'`. getResidentActor
// returns a Supabase client (non-serializable), so it can't be a server
// action. The two mutating server actions live in impersonation-actions.ts.

import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, type Database } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'

export const IMPERSONATION_COOKIE = 'hh_impersonate'
export const IMPERSONATION_MAX_AGE = 60 * 60 * 8 // 8h, then forces a reset

export const IMPERSONATION_READONLY_MSG =
  'Read-only while viewing as a resident — exit to your admin account to make changes.'

export interface ImpersonationTarget {
  /** Owner's auth user id, if they have an account. Null for email-only owners. */
  userId: string | null
  email: string
  name: string
  /** Property to return to on exit. */
  propertyId: string | null
}

export interface ResidentActor {
  /** Effective auth user id for reads. Null when impersonating an
   *  account-less owner (data is then reached via the email path). */
  id: string | null
  email: string | null
  displayName: string | null
  impersonating: boolean
  /** RLS-bound client normally; service-role client while impersonating. */
  client: SupabaseClient<Database>
}

// Parses the impersonation cookie. Does NOT authorize — callers that act
// on it must confirm the real user is an admin (see getResidentActor).
async function readTarget(): Promise<ImpersonationTarget | null> {
  const store = await cookies()
  const raw = store.get(IMPERSONATION_COOKIE)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationTarget>
    if (typeof parsed.email !== 'string' || typeof parsed.name !== 'string') return null
    return {
      userId: typeof parsed.userId === 'string' ? parsed.userId : null,
      email: parsed.email,
      name: parsed.name,
      propertyId: typeof parsed.propertyId === 'string' ? parsed.propertyId : null,
    }
  } catch {
    return null
  }
}

// True only when the signed-in user is really an admin in the current org.
async function realUserIsAdmin(): Promise<boolean> {
  const org = await getCurrentOrg()
  if (!org) return false
  return (await getCurrentUserRoleInOrg(org.id)) === 'admin'
}

// The current impersonation target, but only for admins. Powers the
// banner + the resident-layout gate. Returns null for everyone else even
// if a cookie is somehow present.
export async function getImpersonationTarget(): Promise<ImpersonationTarget | null> {
  const target = await readTarget()
  if (!target) return null
  if (!(await realUserIsAdmin())) return null
  return target
}

// Central identity resolver for every resident-side read. When an admin
// has an active impersonation cookie, reads run as the target owner via a
// service-role client; otherwise they run as the signed-in user via the
// RLS-bound client. The admin check happens on EVERY call — the cookie is
// never trusted on its own.
export async function getResidentActor(): Promise<ResidentActor> {
  const userClient = await getSupabaseServerClient()

  const target = await readTarget()
  if (target && (await realUserIsAdmin())) {
    return {
      id: target.userId,
      email: target.email,
      displayName: target.name,
      impersonating: true,
      client: createAdminClient() as SupabaseClient<Database>,
    }
  }

  const {
    data: { user },
  } = await userClient.auth.getUser()
  return {
    id: user?.id ?? null,
    email: user?.email ?? null,
    displayName: user?.email ?? null,
    impersonating: false,
    client: userClient as SupabaseClient<Database>,
  }
}
