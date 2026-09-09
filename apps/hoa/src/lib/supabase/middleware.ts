import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@homeowner-portal/db/types'
import { SESSION_STAMP_COOKIE, evaluateSessionCap } from '@/lib/session-cap'

type CookieToSet = { name: string; value: string; options: CookieOptions }

// The stamp cookie must outlive the window it describes. If the browser
// dropped it at the 24h mark, the next request would look like a brand-new
// session and be handed a fresh day — the cap would never fire.
const STAMP_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60

// Reuses the service-role key when a dedicated secret isn't set, so the cap
// works on deploy without a new Vercel env var. Both are server-only and
// never reach the browser.
function sessionCapSecret(): string | undefined {
  return process.env.SESSION_CAP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
}

// Pulled into a helper so the same flow can be reused by the eviction and pm
// hubs without copy-paste. Returns the user (or null) plus the response that
// has any refreshed auth cookies attached.
//
// Also enforces the absolute session cap (see lib/session-cap.ts): Supabase
// rotates refresh tokens forever, so without this a session never ends.
// `sessionExpired` tells the caller to bounce the user to /login — the
// caller owns that redirect, so it must clear the auth cookies itself.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user, response: supabaseResponse, sessionExpired: false }

  const secret = sessionCapSecret()
  if (!secret) {
    console.error(
      '[session-cap] Neither SESSION_CAP_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set — ' +
        'sessions are NOT being capped at 24h.',
    )
  }

  // getUser() above already authenticated this token against Supabase, so
  // reading session_id straight out of it is both safe and free — getClaims()
  // would cost another round-trip on every request.
  const { data: sessionData } = await supabase.auth.getSession()

  const decision = await evaluateSessionCap({
    accessToken: sessionData.session?.access_token,
    stampCookie: request.cookies.get(SESSION_STAMP_COOKIE)?.value,
    secret,
    now: Date.now(),
  })

  if (decision.action === 'expire') {
    // scope: 'local' revokes this one session's refresh token server-side
    // without touching the user's other devices. Without it, an exfiltrated
    // refresh token would outlive the cap we just enforced.
    //
    // Best-effort on purpose: if Supabase is unreachable, throwing here would
    // 500 every request for this user instead of logging them out. The
    // caller clears the auth cookies regardless, so the browser session ends
    // either way — we'd just fail to revoke the token server-side.
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch (error) {
      console.error('[session-cap] failed to revoke expired session', error)
    }
    return { user, response: supabaseResponse, sessionExpired: true }
  }

  if (decision.action === 'refresh') {
    supabaseResponse.cookies.set(SESSION_STAMP_COOKIE, decision.cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: STAMP_COOKIE_MAX_AGE_S,
    })
  }

  return { user, response: supabaseResponse, sessionExpired: false }
}

/**
 * Strip every auth cookie off a response, so an expired session cannot
 * survive the redirect to /login.
 *
 * This is load-bearing, not tidiness: leave the Supabase cookies in place
 * and middleware's "already signed in? go home" branch bounces the user back
 * to `/`, which expires again, which bounces to /login — a redirect loop.
 */
export function clearAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    // Supabase chunks large tokens across sb-<ref>-auth-token.0, .1, … so
    // match on the prefix rather than an exact name.
    if (cookie.name.startsWith('sb-')) response.cookies.delete(cookie.name)
  }
  response.cookies.delete(SESSION_STAMP_COOKIE)
  return response
}
