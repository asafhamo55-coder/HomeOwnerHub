// Where the HOA app lives, as seen from the marketing site.
//
// Domain split (docs/specs/2026-10-19-domain-split.md): marketing serves
// homeownerledger.com and www.homeownerledger.com; the app serves the apex
// of its own domain, homeownerledger.online (owner decision 2026-10-21; it is
// not a subdomain of homeownerledger.com). Every "Sign in" link and every
// redirect of an old app path goes to this origin.
//
// The fallback is the app's post-split host, never a www host. Marketing
// serves www.homeownerledger.com, so a www.homeownerledger.com fallback would
// make the redirects in middleware.ts point back at the site that issued
// them; www.homeownerledger.online only 308s to the apex, so it would add a
// hop and change the host Supabase and OAuth redirect allow-lists see.

export const DEFAULT_APP_ORIGIN = 'https://homeownerledger.online'

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
export const SIGN_IN_URL = `${APP_ORIGIN}/login`
