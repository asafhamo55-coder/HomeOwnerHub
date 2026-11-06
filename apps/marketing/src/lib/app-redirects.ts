// App links that land on the marketing site → the app (lib/app-origin.ts).
//
// BL-157: this site serves www.homeownerledger.online and the app stays on
// www.homeownerledger.com. Until 2026-10-22 www.homeownerledger.online was
// attached to the app project, and someone may type or bookmark an app path
// on it (/login, /resident, a magic link pasted into the wrong tab). Those
// paths would 404 here, so middleware.ts sends them to the app with path and
// query intact. It is also what keeps the app reachable from here if the
// app ever moves (OA-5).
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
  'amenities',
  'ai',
  'approvals',
  'arc',
  'ballots',
  'communications',
  'community-board',
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
  'polls',
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
  // How-to-join notice for owners without email
  'people',
  // Public resident onboarding video page
  'welcome',
  // Subscribable calendar feed (signed link, Round 29)
  'calendar',
  // BL-168 professional access (CPA, attorney)
  'pro',
  'pro-invite',
  'resident',
  'rfp-bid',
  // public share links
  's',
  'vendor-onboard',
  // apps/hoa/public and generated icons referenced from already-sent
  // email and from the old service worker's notifications.
  'email',
  'icon',
  'apple-icon',
] as const

const SEGMENTS: ReadonlySet<string> = new Set(APP_PATH_SEGMENTS)

// The one /api route this site serves itself (the Help chat, app/api/chat).
// Every other /api path is still the app's and goes there.
const MARKETING_API_PATHS: ReadonlySet<string> = new Set(['/api/chat'])

// Supabase SSR session cookie, possibly chunked (sb-<ref>-auth-token.0, .1).
// Host-only, so on this site's host it can only have been set by the app
// while the app served that host.
const SUPABASE_SESSION_COOKIE = /^sb-[a-z0-9]+-auth-token(\.\d+)?$/

export interface RedirectRequest {
  pathname: string
  /** Query string including the leading "?", or "". */
  search: string
  /** Request host, e.g. "www.homeownerledger.online". */
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
 * a browser still carrying a session cookie from when the app served this
 * host, so a signed-in board member lands in the app, and everyone else sees
 * the marketing site.
 */
export function appRedirectTarget(req: RedirectRequest, appOrigin: string): string | null {
  const app = new URL(appOrigin)
  if (req.host.toLowerCase() === app.host.toLowerCase()) return null

  if (MARKETING_API_PATHS.has(req.pathname)) return null

  const segment = req.pathname.split('/')[1] ?? ''
  const isAppPath = SEGMENTS.has(segment)
  const isReturningAppUser =
    req.pathname === '/' && req.cookieNames.some((name) => SUPABASE_SESSION_COOKIE.test(name))
  if (!isAppPath && !isReturningAppUser) return null

  return `${app.origin}${req.pathname}${req.search}`
}
