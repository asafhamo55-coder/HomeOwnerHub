'use server'

import { cookies } from 'next/headers'
import { clearSessionScopedCookies } from '@/lib/session-cookies'

// Called by every sign-out button before the Supabase sign-out. The
// impersonation and role-override cookies are HTTPOnly, so the browser
// client cannot clear them itself; without this they outlived the session
// for whoever signed in next on the same browser. Deleting cookies needs
// no authorization — it only ever removes the caller's own state.
export async function clearSessionCookiesOnSignOut(): Promise<void> {
  clearSessionScopedCookies(await cookies())
}
