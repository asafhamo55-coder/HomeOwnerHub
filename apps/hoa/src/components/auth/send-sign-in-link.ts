import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { friendlyAuthError } from './auth-errors-shared'
import { rememberSignInMethod } from './sign-in-memory-shared'

/** Sends a one-time sign-in link. Returns null on success, or a plain-words problem. */
export async function sendSignInLink(email: string, redirectTo?: string): Promise<string | null> {
  const supabase = getSupabaseBrowserClient()
  // Pin the callback to the canonical host: cookies do not cross between
  // Vercel aliases.
  const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
  const callbackUrl = new URL('/auth/callback', origin)
  if (redirectTo) callbackUrl.searchParams.set('next', redirectTo)
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: callbackUrl.toString(), shouldCreateUser: true },
  })
  if (error) return friendlyAuthError(error)
  rememberSignInMethod('link')
  return null
}
