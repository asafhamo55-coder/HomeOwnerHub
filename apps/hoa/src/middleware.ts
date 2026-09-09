import { NextResponse, type NextRequest } from 'next/server'
import { clearAuthCookies, updateSession } from '@/lib/supabase/middleware'

// Routes a signed-out user is allowed to hit. The /onboarding page handles
// its own "already onboarded? bounce home" check, so we don't gate on
// org-membership here — that would require an extra DB hit on every request.
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/verify',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/vendor-onboard',
  '/api/vendor-onboard',
  '/rfp-bid',
  '/api/rfp-bid',
]

// Dev-only escape hatch: set DEV_AUTOLOGIN=1 in .env.local to skip the
// /login screen entirely. Unauth requests get bounced through
// /auth/dev-login, which signs in DEV_AUTOLOGIN_EMAIL via service-role
// and continues to the original destination. NEVER enable in prod.
const DEV_AUTOLOGIN = process.env.DEV_AUTOLOGIN === '1'

export async function middleware(request: NextRequest) {
  // Short-circuit Vercel's internal favicon scraper. It hits `/` on
  // every preview deployment to extract the <link rel="icon"> from the
  // page. Our auth gate redirects it to /login, generating one log
  // line per preview build. Returning 204 directly skips the redirect
  // (and the Supabase session update below) — purely log-noise
  // reduction, no user-visible behavior change.
  const ua = request.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-favicon')) {
    return new NextResponse(null, { status: 204 })
  }

  const { user, response, sessionExpired } = await updateSession(request)

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))

  // Sessions are capped at 24h from sign-in (lib/session-cap.ts). Past that
  // the user is treated as signed out and has to enter their credentials
  // again. Clearing the auth cookies here is mandatory: leave them and the
  // "already signed in" branch below bounces the user straight back into the
  // app, which expires again — an infinite redirect.
  if (sessionExpired) {
    if (isPublic) return clearAuthCookies(request, NextResponse.next({ request }))

    const target = DEV_AUTOLOGIN ? '/auth/dev-login' : '/login'
    const expiredUrl = new URL(target, request.url)
    if (!DEV_AUTOLOGIN) expiredUrl.searchParams.set('reason', 'session-expired')
    if (path !== '/') expiredUrl.searchParams.set('redirect', path)
    return clearAuthCookies(request, NextResponse.redirect(expiredUrl))
  }

  if (!user && !isPublic) {
    const target = DEV_AUTOLOGIN ? '/auth/dev-login' : '/login'
    const loginUrl = new URL(target, request.url)
    if (path !== '/') loginUrl.searchParams.set('redirect', path)
    return NextResponse.redirect(loginUrl)
  }

  // Already signed in? Don't show the auth pages again.
  if (user && (path === '/login' || path === '/signup')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Run on every page except:
    //   - static assets, image optimization
    //   - api/webhooks, api/inngest, api/health, api/cron (have their own auth)
    //   - api/admin/setup-stripe-pricing (bearer-token-authed, called via curl
    //     so we don't want middleware redirecting to /login)
    //   - api/oauth (Google's redirect back to /api/oauth/google/callback is a
    //     cross-site top-level navigation; if the session cookie ever fails to
    //     ride along, middleware would silently swallow the one-time-use code
    //     by bouncing to /login instead of letting the route redirect to
    //     /settings/mailbox with a readable error. The route verifies its own
    //     signed OAuth `state` — it doesn't need middleware's auth gate.)
    //   - public/ assets. Next runs middleware over files served from public/
    //     unless they are excluded here, and everything below was 307-ing to
    //     /login in production:
    //       email/  — pictograms embedded in outgoing community emails. Mail
    //                 clients fetch images unauthenticated, so a redirect means
    //                 the image never loads for any recipient. Decorative only;
    //                 no resident data. Trailing slash so a future /email page
    //                 is not accidentally un-gated, and unversioned so email/v2
    //                 keeps working.
    //       sw.js, manifest.webmanifest, icon, apple-icon — the PWA. The service
    //                 worker registration was failing silently, which is why
    //                 nobody noticed. icon/apple-icon are anchored so they
    //                 cannot match a future /icons-admin style route.
    //       robots.txt — crawlers do not log in.
    //     Deliberately NOT a catch-all like (?!.*\..*): that would be safe today
    //     but would silently un-gate any future authenticated route whose
    //     parameter can contain a dot.
    '/((?!_next/static|_next/image|favicon.ico|email/|sw\\.js$|manifest\\.webmanifest$|icon$|apple-icon$|robots\\.txt$|api/webhooks|api/inngest|api/health|api/cron|api/admin/setup-stripe-pricing|api/oauth).*)',
  ],
}
