'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ACTIVE_ORG_COOKIE } from '@/lib/orgs'
import { clearSessionScopedCookies } from '@/lib/session-cookies'

// Sets the active HOA org cookie iff the calling user is actually a
// member of the target org. Anything else is rejected — this is the
// only public way to write the cookie.
export async function setActiveOrg(orgId: string): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'not authenticated' }

  // Filtered on the caller's own id as well as the org: org_members'
  // policies also expose co-members' rows, so the org filter alone would
  // match someone else's membership.
  const { data, error } = await supabase
    .from('org_members')
    .select('org_id, org:orgs(hub_type, suspended_at, archived_at)')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, reason: error.message }
  if (!data) return { ok: false, reason: 'not a member of that org' }

  const org = data.org as { hub_type: string; suspended_at: string | null; archived_at: string | null } | null
  if (!org || org.hub_type !== 'hoa') {
    return { ok: false, reason: 'org is not an HOA' }
  }
  // Suspended and archived communities cannot be switched into.
  if (org.suspended_at || org.archived_at) {
    return { ok: false, reason: 'that community is not active' }
  }

  const cookieStore = await cookies()
  // Impersonation and the role override belong to the org being left.
  clearSessionScopedCookies(cookieStore)
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    httpOnly: false, // readable by client for snappy UI; not a secret
  })

  // Force a fresh render of the whole app so getCurrentOrg picks up
  // the new cookie value on the next request.
  revalidatePath('/', 'layout')
  return { ok: true }
}
