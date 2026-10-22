// Where the HOA app lives, as seen from the marketing site.
//
// BL-157 (owner decision 2026-10-22): the app stays at
// www.homeownerledger.com, and this site moves to www.homeownerledger.online
// (lib/site.ts). Moving the app to homeownerledger.online (OA-5) is paused.
// Every "Sign in" / "Create account" link and every redirect of an old app
// path goes to this origin, from NEXT_PUBLIC_APP_URL when set.
//
// The fallback is never this site's own host: middleware.ts redirects app
// paths here, so pointing it at www.homeownerledger.online would send them
// back to the site that issued them (appRedirectTarget refuses to redirect a
// request already on the app host, so it can't loop, but the links would 404).

export const DEFAULT_APP_ORIGIN = 'https://www.homeownerledger.com'

export function appOrigin(configured: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  const value = configured?.trim()
  if (!value) return DEFAULT_APP_ORIGIN
  try {
    return new URL(value).origin
  } catch {
    return DEFAULT_APP_ORIGIN
  }
}

export const APP_ORIGIN = appOrigin()
/** The app's host, for display (e.g. the address bar in a product mock-up). */
export const APP_HOST = new URL(APP_ORIGIN).host
export const SIGN_IN_URL = `${APP_ORIGIN}/login`
export const SIGN_UP_URL = `${APP_ORIGIN}/signup`
