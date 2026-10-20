import { NextResponse, type NextRequest } from 'next/server'
import { APP_ORIGIN } from './lib/app-origin'
import { appRedirectTarget } from './lib/app-redirects'

// Old app links (the app served www until the domain split) → the app
// subdomain, path and query kept. See lib/app-redirects.ts.
//
// 307, not 308: browsers cache a 308 forever, and these paths may one day
// be wanted back for marketing pages.
export function middleware(request: NextRequest) {
  const target = appRedirectTarget(
    {
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      host: request.headers.get('host') ?? request.nextUrl.host,
      cookieNames: request.cookies.getAll().map((c) => c.name),
    },
    APP_ORIGIN,
  )
  if (target) return NextResponse.redirect(target, 307)
  return NextResponse.next()
}

export const config = {
  // Everything except Next's own build assets. /sw.js is deliberately NOT
  // redirected (and not served): a service-worker update fetch that gets a
  // redirect fails, which leaves the app's old www service worker installed
  // and still delivering push. See the runbook's PWA section.
  matcher: ['/((?!_next/static/|_next/image|favicon\\.ico$|sw\\.js$).*)'],
}
