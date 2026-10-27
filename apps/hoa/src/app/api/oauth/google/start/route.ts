import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/handler'
import { logRouteFailure } from '@/lib/api/log'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  newOAuthNonce,
  OAUTH_NONCE_COOKIE,
  OAUTH_NONCE_MAX_AGE_SECONDS,
  sanitizeReturnTo,
  startConnect,
} from '@/lib/inbox/connect'
import { connectErrorRedirect } from '@/lib/inbox/connect-errors'

// A browser-navigation route (the "Connect Gmail" link), not a fetch
// endpoint, so every expected outcome is a redirect rather than the JSON
// envelope: signed out → /login, no org → /onboarding, refused or failed →
// back to `returnTo` with `?error=<code>` (RC-1's redirect-route rule; the
// page maps the code to words via lib/inbox/connect-errors). Middleware
// excludes /api/oauth/*, so this route does its own auth. Only a genuinely
// unexpected throw (e.g. the org lookup failing) falls through to
// withRoute's generic JSON 500.

/** Env startConnect needs. Checked up front so a missing one is `not_configured`, not `internal`. */
const REQUIRED_ENV = ['MAILBOX_TOKEN_KEY', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_REDIRECT_URI'] as const

export const GET = withRoute('oauth.google.start', async (request: Request) => {
  // Auth first (RC-3).
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const org = await getCurrentOrg()
  if (!org) return NextResponse.redirect(new URL('/onboarding', request.url))

  // `returnTo` is attacker-controllable query input (a board member can
  // be sent a crafted link and will complete a genuine Google consent
  // screen). Validate it here, before it is ever signed into `state` —
  // signing does not "launder" a hostile value, it just certifies one.
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get('returnTo'))

  // This route is the actual security boundary for connecting a mailbox:
  // completeConnect writes mailbox_accounts via the admin (service-role)
  // client, which bypasses the board_access RLS policy that would
  // otherwise stop a resident. Gate here rather than trusting the calling
  // page alone.
  //
  // Admin-only, deliberately narrower than the board-or-admin bar RLS sets
  // on the inbox tables. Two reasons. First, consenting to this grant hands
  // Google standing access to the HOA's entire mailbox, and the surfaces
  // that manage it afterwards (settings/mailbox, updateScope,
  // disconnectMailbox) are all admin-only — a board member who could
  // *start* a connect could never see, rescope, or revoke it. Second, it
  // closes a silent dead end: every failure path here and in the callback
  // redirects to settings/mailbox, which requireAdmin() would bounce to '/'
  // with no message, so a board member's refusal was invisible to them.
  //
  // Not requireRouteBoardOrAdmin: that gate is board-or-admin and throws a
  // JSON 403, and this route needs admin-only and a redirect.
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin') {
    return NextResponse.redirect(connectErrorRedirect(returnTo, 'forbidden', request.url))
  }

  const missing = REQUIRED_ENV.filter((name) => !process.env[name])
  if (missing.length > 0) {
    logRouteFailure('oauth.google.start', null, { stage: 'config', orgId: org.id, missingCount: missing.length })
    return NextResponse.redirect(connectErrorRedirect(returnTo, 'not_configured', request.url))
  }

  // Bound into the signed state AND set as an httpOnly cookie, so only this
  // browser can complete the flow, once.
  const nonce = newOAuthNonce()
  let consentUrl: string
  try {
    consentUrl = startConnect(org.id, user.id, returnTo, nonce)
  } catch (error) {
    // Ids and codes only (RC-2) — the thrown text never reaches the URL or the log.
    logRouteFailure('oauth.google.start', error, { stage: 'start_connect', orgId: org.id })
    return NextResponse.redirect(connectErrorRedirect(returnTo, 'internal', request.url))
  }
  const response = NextResponse.redirect(consentUrl)
  response.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/oauth/google',
    maxAge: OAUTH_NONCE_MAX_AGE_SECONDS,
  })
  return response
})
