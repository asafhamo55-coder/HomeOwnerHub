'use server'

import { cookies } from 'next/headers'
import { clearSessionScopedCookies } from '@/lib/session-cookies'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// Called by every sign-out button before the Supabase sign-out. The
// impersonation and role-override cookies are HTTPOnly, so the browser
// client cannot clear them itself; without this they outlived the session
// for whoever signed in next on the same browser. Deleting cookies needs
// no authorization — it only ever removes the caller's own state.
export async function clearSessionCookiesOnSignOut(): Promise<void> {
  clearSessionScopedCookies(await cookies())
}

// Drops the signed-in user's own push registration for this browser. Runs
// while the session is still valid, so it is scoped to the caller. A
// missing session or row is not an error: sign-out must always proceed.
export async function removeMyPushSubscriptionOnSignOut(endpoint: string): Promise<void> {
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 2048) return
  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('push_subscriptions' as never)
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', user.id)
  } catch {
    // Best effort.
  }
}
