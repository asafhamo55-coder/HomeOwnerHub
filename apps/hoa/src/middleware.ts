import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Routes a signed-out user is allowed to hit. The /onboarding page handles
// its own "already onboarded? bounce home" check, so we don't gate on
// org-membership here — that would require an extra DB hit on every request.
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/verify',
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
  const { user, response } = await updateSession(request)

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))

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
    // Run on every page except static assets, API routes that need their own
    // handling (webhooks), and image optimization.
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/inngest|api/health).*)',
  ],
}
