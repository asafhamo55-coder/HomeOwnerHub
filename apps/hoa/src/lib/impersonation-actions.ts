'use server'

// Server actions for admin "enter owner portal" impersonation. Both refuse
// non-admins (via requireAdmin) and write an audit_log row. The read-side
// resolver lives in impersonation.ts.

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
  type ImpersonationTarget,
} from '@/lib/impersonation'

interface EnterInput {
  email: string
  name: string
  propertyId?: string | null
  /** Unit whose current owner we're viewing — used to resolve the auth uid. */
  unitId?: string | null
  /** Explicit owner auth uid when the caller already knows it. */
  ownerUserId?: string | null
}

async function writeImpersonationAudit(
  action: 'resident_portal.enter' | 'resident_portal.exit',
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

// Start impersonating an owner. Admin-gated; resolves the owner's auth uid
// (best-effort), sets the cookie, audits, and lands on the resident portal.
export async function enterResidentPortal(input: EnterInput): Promise<void> {
  const { org } = await requireAdmin()

  const email = input.email.trim().toLowerCase()
  const name = input.name.trim() || email

  // Resolve the target auth user id. Prefer an explicit id, then the
  // unit's current ownership, then a profiles lookup by email. May stay
  // null for an email-only owner — the resident reads then fall back to
  // matching by email, exactly as that owner's own login would.
  const admin = createAdminClient()
  let userId = input.ownerUserId ?? null

  if (!userId && input.unitId) {
    const { data } = await admin
      .from('ownerships')
      .select('owner_user_id')
      .eq('unit_id', input.unitId)
      .is('valid_to', null)
      .not('owner_user_id', 'is', null)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle<{ owner_user_id: string | null }>()
    userId = data?.owner_user_id ?? null
  }

  if (!userId && email) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle<{ id: string }>()
    userId = data?.id ?? null
  }

  const target: ImpersonationTarget = {
    userId,
    email,
    name,
    propertyId: input.propertyId ?? null,
  }

  const store = await cookies()
  store.set(IMPERSONATION_COOKIE, JSON.stringify(target), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: IMPERSONATION_MAX_AGE,
  })

  const {
    data: { user },
  } = await (await getSupabaseServerClient()).auth.getUser()
  if (user) {
    await writeImpersonationAudit('resident_portal.enter', org.id, user.id, userId, {
      email,
      name,
      property_id: target.propertyId,
    })
  }

  revalidatePath('/resident')
  revalidatePath('/')
  redirect('/resident')
}

// Stop impersonating. Clears the cookie, audits, and returns to the
// property page we came from (or the dashboard).
export async function exitResidentPortal(): Promise<void> {
  const store = await cookies()
  const raw = store.get(IMPERSONATION_COOKIE)?.value
  let target: ImpersonationTarget | null = null
  if (raw) {
    try {
      target = JSON.parse(raw) as ImpersonationTarget
    } catch {
      target = null
    }
  }
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
  redirect(target?.propertyId ? `/properties/${target.propertyId}` : '/')
}
