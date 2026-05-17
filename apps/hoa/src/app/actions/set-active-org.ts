'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ACTIVE_ORG_COOKIE } from '@/lib/orgs'

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

  // RLS on org_members ensures we only see the current user's rows.
  const { data, error } = await supabase
    .from('org_members')
    .select('org_id, org:orgs(hub_type)')
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, reason: error.message }
  if (!data) return { ok: false, reason: 'not a member of that org' }

  const org = data.org as { hub_type: string } | null
  if (!org || org.hub_type !== 'hoa') {
    return { ok: false, reason: 'org is not an HOA' }
  }

  const cookieStore = await cookies()
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
