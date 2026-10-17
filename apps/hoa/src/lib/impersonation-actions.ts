'use server'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'

// Server actions for admin "enter owner portal" impersonation. Entering
// refuses non-admins (via requireAdmin) and any target outside the admin's
// own org; both write an audit_log row. The read-side resolver lives in
// impersonation.ts.
//
// Server actions are public POST endpoints: every argument here is
// attacker-controlled. The target is re-derived from the database, scoped
// to the admin's org (impersonation-target.ts), never taken on trust.

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient, type Json } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'
import { requireAdmin } from '@/lib/auth'
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_MAX_AGE,
  IMPERSONATION_REFUSED,
  getImpersonationTarget,
  impersonationSecret,
} from '@/lib/impersonation'
import { signImpersonationToken } from '@/lib/impersonation-token'
import { resolveImpersonationTarget } from '@/lib/impersonation-target'

interface EnterInput {
  email: string
  name: string
  propertyId?: string | null
  /** Unit whose current owner we're viewing — used to resolve the auth uid. */
  unitId?: string | null
  /** Explicit owner auth uid when the caller already knows it. */
  ownerUserId?: string | null
}

export type EnterResult = { ok: false; error: string }

async function writeImpersonationAudit(
  action: 'resident_portal.enter' | 'resident_portal.exit' | 'resident_portal.refused',
  orgId: string,
  actorUserId: string,
  targetUserId: string | null,
  metadata: Json,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('audit_log')
    .insert({
      action,
      org_id: orgId,
      user_id: actorUserId,
      entity_type: 'ownership',
      entity_id: targetUserId,
      metadata,
    })
    .then(
      () => {},
      () => {}, // best-effort — never block the flow on an audit failure
    )
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

// Start impersonating an owner. Admin-gated and org-confined: the target
// must be linked to a unit in the admin's current org, or no cookie is set.
// On success sets a signed cookie bound to (org, admin), audits, and lands
// on the resident portal.
export async function enterResidentPortal(input: EnterInput): Promise<EnterResult | void> {
  const { org } = await requireAdmin()

  const {
    data: { user },
  } = await (await getSupabaseServerClient()).auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  const secret = impersonationSecret()
  if (!secret) return { ok: false, error: 'Owner portal preview is not configured.' }

  const admin = createAdminClient()
  const resolved = await resolveImpersonationTarget(admin, org.id, {
    email: str(input?.email) ?? '',
    unitId: str(input?.unitId),
    ownerUserId: str(input?.ownerUserId),
  })
  if (!resolved.ok) {
    // Ids and a reason code only — never the submitted address.
    await writeImpersonationAudit('resident_portal.refused', org.id, user.id, null, {
      reason: resolved.reason,
    })
    return { ok: false, error: IMPERSONATION_REFUSED }
  }

  const name = (str(input.name)?.trim() || '') || resolved.email

  // propertyId only drives the exit redirect; keep it only if it is ours.
  let propertyId: string | null = null
  const wantedProperty = str(input.propertyId)
  if (wantedProperty) {
    const { data } = await admin
      .from('hoa_properties')
      .select('id')
      .eq('id', wantedProperty)
      .eq('org_id', org.id)
      .maybeSingle()
    propertyId = data ? wantedProperty : null
  }

  const token = signImpersonationToken(
    {
      orgId: org.id,
      actorUserId: user.id,
      userId: resolved.userId,
      email: resolved.email,
      name,
      propertyId,
    },
    secret,
  )

  const store = await cookies()
  store.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: IMPERSONATION_MAX_AGE,
  })

  await writeImpersonationAudit('resident_portal.enter', org.id, user.id, resolved.userId, {
    email: resolved.email,
    name,
    property_id: propertyId,
  })

  revalidatePath('/resident')
  revalidatePath('/')
  redirect('/resident')
}

// Stop impersonating. Clears the cookie, audits, and returns to the
// property page we came from (or the dashboard). Only a verified cookie's
// contents are trusted for the audit row and the redirect.
export async function exitResidentPortal(): Promise<void> {
  const target = await getImpersonationTarget()
  const store = await cookies()
  store.delete(IMPERSONATION_COOKIE)

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const org = await getCurrentOrg()
  if (user && org) {
    await writeImpersonationAudit('resident_portal.exit', org.id, user.id, target?.userId ?? null, {
      email: target?.email ?? null,
    })
  }

  revalidatePath('/resident')
  revalidatePath('/')
  redirect(target?.propertyId ? propertyHref(asPropertyId(target.propertyId)) : '/')
}
