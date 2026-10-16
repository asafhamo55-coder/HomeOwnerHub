// Decides whether an admin may impersonate a given owner, and resolves
// that owner's identity — confined to the admin's own org.
//
// enterResidentPortal is a server action: its arguments come straight from
// the caller and are not to be trusted. Before this check it accepted any
// unitId / ownerUserId / email, so an admin of org A (and anyone can become
// one by signing up) could point the portal at an owner in org B. Every
// lookup here is filtered by organization_id, and email matching is exact
// and case-insensitive: `%` and `_` are escaped, so `%` matches nobody.
//
// Takes the client as an argument (no next/headers) so it is testable with
// a fake in unit tests and against real Postgres in tests/integration.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { escapeLikePattern } from './properties/resolve'

type Db = SupabaseClient<Database>

export interface TargetRequest {
  email: string
  unitId?: string | null
  ownerUserId?: string | null
}

export type TargetResolution =
  | { ok: true; userId: string | null; email: string }
  | { ok: false; reason: 'invalid_email' | 'unit_not_in_org' | 'owner_not_in_org' | 'email_not_in_org' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Exact, case-insensitive match pattern for `.ilike()` — no wildcards survive. */
export function exactIlike(value: string): string {
  return escapeLikePattern(value.trim().toLowerCase())
}

async function ownsInOrg(db: Db, orgId: string, userId: string, unitId: string | null): Promise<boolean> {
  let q = db
    .from('ownerships')
    .select('id')
    .eq('organization_id', orgId)
    .eq('owner_user_id', userId)
    .is('valid_to', null)
  if (unitId) q = q.eq('unit_id', unitId)
  const { data, error } = await q.limit(1)
  return !error && (data ?? []).length > 0
}

async function emailLinkedInOrg(db: Db, orgId: string, email: string): Promise<boolean> {
  const pattern = exactIlike(email)
  const [own, res] = await Promise.all([
    db
      .from('ownerships')
      .select('id')
      .eq('organization_id', orgId)
      .ilike('owner_email', pattern)
      .is('valid_to', null)
      .limit(1),
    db
      .from('property_residents')
      .select('id')
      .eq('organization_id', orgId)
      .ilike('email', pattern)
      .is('moved_out_at', null)
      .is('deleted_at', null)
      .limit(1),
  ])
  if ((!own.error && (own.data ?? []).length > 0) || (!res.error && (res.data ?? []).length > 0)) {
    return true
  }
  // Legacy owner record on the property itself (the Owner card's source).
  const legacy = await db
    .from('hoa_properties')
    .select('id')
    .eq('org_id', orgId)
    .ilike('owner_email', pattern)
    .limit(1)
  return !legacy.error && (legacy.data ?? []).length > 0
}

export async function resolveImpersonationTarget(
  db: Db,
  orgId: string,
  input: TargetRequest,
): Promise<TargetResolution> {
  const email = (input.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return { ok: false, reason: 'invalid_email' }

  const unitId = input.unitId ?? null
  if (unitId) {
    const { data, error } = await db
      .from('units')
      .select('id')
      .eq('id', unitId)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (error || !data) return { ok: false, reason: 'unit_not_in_org' }
  }

  // An explicit owner id must hold a current ownership in THIS org.
  if (input.ownerUserId) {
    if (!(await ownsInOrg(db, orgId, input.ownerUserId, null))) {
      return { ok: false, reason: 'owner_not_in_org' }
    }
  }

  // The email is what the email-fallback reads key on, so it must belong
  // to someone linked to a unit in this org: a current ownership or
  // residency row here, or an account (exact address) that owns here.
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .ilike('email', exactIlike(email))
    .limit(1)
    .maybeSingle<{ id: string }>()
  const profileId = profile?.id ?? null
  const linked =
    (await emailLinkedInOrg(db, orgId, email)) ||
    (profileId !== null && (await ownsInOrg(db, orgId, profileId, null)))
  if (!linked) return { ok: false, reason: 'email_not_in_org' }

  let userId: string | null = input.ownerUserId ?? null
  if (!userId && unitId) {
    const { data } = await db
      .from('ownerships')
      .select('owner_user_id')
      .eq('organization_id', orgId)
      .eq('unit_id', unitId)
      .is('valid_to', null)
      .not('owner_user_id', 'is', null)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle<{ owner_user_id: string | null }>()
    userId = data?.owner_user_id ?? null
  }
  // Safe to adopt: the address was just shown to be linked in this org.
  if (!userId) userId = profileId

  return { ok: true, userId, email }
}
