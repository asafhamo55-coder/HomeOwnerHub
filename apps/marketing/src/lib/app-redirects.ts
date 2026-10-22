// Old app links on the marketing domain → the app on homeownerledger.online.
//
// Until the domain split (docs/specs/2026-10-19-domain-split.md) the HOA app
// served www.homeownerledger.com, so every email already sitting in a
// resident's inbox links there: magic links (/auth/callback), invites,
// portal links (/resident/…, /communications/…), RFP and vendor links, and
// the email images under /email/v1/. Once www serves this site those paths
// would 404. middleware.ts sends them to the app with path and query intact.
//
// APP_PATH_SEGMENTS is every URL-visible top-level segment of apps/hoa/src/app
// (route groups flattened). app-redirects.test.ts reads that directory and
// fails when a new app route is not listed here, or when a segment here
// collides with one of this site's own routes.

export const APP_PATH_SEGMENTS = [
  // (auth)
  'login',
  'signup',
  'verify',
  'forgot-password',
  'reset-password',
  // (dashboard): the board's app pages
  'accounting',
  'ai',
  'approvals',
  'arc',
  'communications',
  'compliance',
  'documents',
  'dues',
  'events',
  'help',
  'inbox',
  'inspect',
  'insurance',
  'leases',
  'legal',
  'meetings',
  'properties',
  'rfps',
  'settings',
  'tasks',
  'tickets',
  'vendors',
  'violations',
  'whats-new',
  // top level
  'admin',
  'api',
  'auth',
  // BL-143 "Ask to join"
  'join',
  'offline',
  'onboarding',
  'resident',
  'rfp-bid',
  'vendor-onboard',
  // apps/hoa/public and generated icons referenced from already-sent
  // email and from the old service worker's notifications.
  'email',
  'icon',
  'apple-icon',
] as const

const SEGMENTS: ReadonlySet<string> = new Set(APP_PATH_SEGMENTS)

// Supabase SSR session cookie, possibly chunked (sb-<ref>-auth-token.0, .1).
// Host-only, so on www it can only have been set by the app before the split.
const SUPABASE_SESSION_COOKIE = /^sb-[a-z0-9]+-auth-token(\.\d+)?$/

export interface RedirectRequest {
  pathname: string
  /** Query string including the leading "?", or "". */
  search: string
  /** Request host, e.g. "www.homeownerledger.com". */
  host: string
  cookieNames: readonly string[]
}

/**
 * The app URL an old app link should go to, or null to serve the marketing
 * page. Never redirects a request already on the app's host, so a
 * misconfigured origin cannot loop.
 *
 * "/" is the one shared path: it is marketing's home page and the app's
 * dashboard (and the installed PWA's start_url). It goes to the app only for
 * a browser still carrying a session cookie from when the app lived here, so
 * a signed-in board member or a home-screen PWA lands in the app, and
 * everyone else sees the marketing site.
 */
export function appRedirectTarget(req: RedirectRequest, appOrigin: string): string | null {
  const app = new URL(appOrigin)
  if (req.host.toLowerCase() === app.host.toLowerCase()) return null

  const segment = req.pathname.split('/')[1] ?? ''
  const isAppPath = SEGMENTS.has(segment)
  const isReturningAppUser =
    req.pathname === '/' && req.cookieNames.some((name) => SUPABASE_SESSION_COOKIE.test(name))
  if (!isAppPath && !isReturningAppUser) return null

  return `${app.origin}${req.pathname}${req.search}`
}
