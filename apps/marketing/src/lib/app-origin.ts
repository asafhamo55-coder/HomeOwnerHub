// Where the HOA app lives, as seen from the marketing site.
//
// Domain split (docs/specs/2026-10-19-domain-split.md): marketing serves
// homeownerledger.com and www.homeownerledger.com; the app serves
// app.homeownerledger.com. Every "Sign in" link and every redirect of an old
// app path goes to this origin.
//
// The fallback is the app's post-split host, not www. Marketing only ever
// serves www after the split, so a www fallback would make the redirects in
// middleware.ts point back at the site that issued them.

export const DEFAULT_APP_ORIGIN = 'https://app.homeownerledger.com'

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
