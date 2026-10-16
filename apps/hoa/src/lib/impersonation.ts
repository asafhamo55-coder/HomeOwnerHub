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
// service-role client scoped to that owner AND to the org the
// impersonation was started in. It is always READ-ONLY — the resident
// write actions refuse while impersonating.
//
// The cookie is an HMAC-signed token (impersonation-token.ts) bound to
// the org and to the admin who started it, with an expiry. It used to be
// bare JSON that anyone could write, which — with the service-role client
// below — let any signed-up "admin" read any tenant's residents. A forged,
// expired, or transplanted (other org / other user) cookie is now ignored.
//
// Service role bypasses RLS, so the org confinement has to live in every
// reader: each consumer of getResidentActor() filters on `actor.orgId`.
//
// NOTE: this module is intentionally NOT `'use server'`. getResidentActor
// returns a Supabase client (non-serializable), so it can't be a server
// action. The mutating server actions live in impersonation-actions.ts.

import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, type Database } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { verifyImpersonationToken } from '@/lib/impersonation-token'
import { IMPERSONATION_COOKIE } from '@/lib/session-cookies'

export { IMPERSONATION_COOKIE }
export const IMPERSONATION_MAX_AGE = 60 * 60 * 8 // 8h, then forces a reset

export const IMPERSONATION_REFUSED = 'That owner is not part of this organization.'

export const IMPERSONATION_READONLY_MSG =
  'Read-only while viewing as a resident — exit to your admin account to make changes.'

/**
 * HMAC secret for the impersonation cookie. Same chain as the Zelle pay
 * settings signature (PAY_SETTINGS_SECRET, else the service-role key), so
 * every deployment already has one. Null fails closed: no impersonation.
 */
export function impersonationSecret(): string | null {
  return paySettingsSecret()
}

export interface ImpersonationTarget {
  /** Owner's auth user id, if they have an account. Null for email-only owners. */
  userId: string | null
  email: string
  name: string
  /** Property to return to on exit. */
  propertyId: string | null
  /** Org the impersonation was started in. Every read is confined to it. */
  orgId: string
}

export interface ResidentActor {
  /** Effective auth user id for reads. Null when impersonating an
   *  account-less owner (data is then reached via the email path). */
  id: string | null
  email: string | null
  displayName: string | null
  impersonating: boolean
  /** While impersonating: the only org reads may return rows from. The
   *  client is service-role then, so RLS does NOT bound it — every reader
   *  must filter on this. Null when not impersonating (RLS bounds reads). */
  orgId: string | null
  /** RLS-bound client normally; service-role client while impersonating. */
  client: SupabaseClient<Database>
}

// Verifies the impersonation cookie: authentic HMAC, unexpired, issued in
// the CURRENT org, to the CURRENTLY signed-in user. Anything else is
// ignored. Callers must still confirm the user is an admin (below).
async function readTarget(): Promise<ImpersonationTarget | null> {
  const store = await cookies()
  const raw = store.get(IMPERSONATION_COOKIE)?.value
  if (!raw) return null

  const supabase = await getSupabaseServerClient()
  const [org, userRes] = await Promise.all([getCurrentOrg(), supabase.auth.getUser()])
  const claims = verifyImpersonationToken(raw, impersonationSecret(), {
    orgId: org?.id ?? null,
    actorUserId: userRes.data.user?.id ?? null,
  })
  if (!claims) return null
  return {
    userId: claims.userId,
    email: claims.email,
    name: claims.name,
    propertyId: claims.propertyId,
    orgId: claims.orgId,
  }
}

// The current impersonation target, but only for a real admin of the org
// the cookie is bound to. Powers the banner + the resident-layout gate.
// Returns null for everyone else even if a cookie is somehow present.
export async function getImpersonationTarget(): Promise<ImpersonationTarget | null> {
  const target = await readTarget()
  if (!target) return null
  if ((await getCurrentUserRoleInOrg(target.orgId)) !== 'admin') return null
  return target
}

// Central identity resolver for every resident-side read. When an admin
// has a valid impersonation cookie, reads run as the target owner via a
// service-role client (confined to `orgId` by every reader); otherwise
// they run as the signed-in user via the RLS-bound client. The cookie is
// verified and the admin check repeated on EVERY call.
export async function getResidentActor(): Promise<ResidentActor> {
  const userClient = await getSupabaseServerClient()

  const target = await getImpersonationTarget()
  if (target) {
    return {
      id: target.userId,
      email: target.email,
      displayName: target.name,
      impersonating: true,
      orgId: target.orgId,
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
    orgId: null,
    client: userClient as SupabaseClient<Database>,
  }
}
