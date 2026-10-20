// The HOA app's public origin, e.g. "https://app.homeownerledger.com".
//
// One place for it (docs/specs/2026-10-19-domain-split.md). Every absolute
// link the app builds (invites, magic links, Stripe return URLs, email and
// SMS portal links, the hub switcher) goes through here, so moving the app
// to a new host is one env var (NEXT_PUBLIC_APP_URL) plus a redeploy.
//
// The fallback keeps the pre-split behaviour until the env var changes:
// production falls back to the host the app has always served on, dev and
// tests to localhost. No 'server-only' and no imports: client components
// (the hub switcher) read it too, and Next inlines the literal
// process.env.NEXT_PUBLIC_APP_URL access at build time.
//
// Not for email IMAGE urls: those use EMAIL_ASSET_BASE_URL (email/asset-url.ts).

/** Where the app lived before the domain split. Fallback only. */
export const LEGACY_APP_ORIGIN = 'https://www.homeownerledger.com'

const DEV_APP_ORIGIN = 'http://localhost:3000'

export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/+$/, '')
  return process.env.NODE_ENV === 'production' ? LEGACY_APP_ORIGIN : DEV_APP_ORIGIN
}

/** Absolute URL for an app path, e.g. appUrl('/resident/dues'). */
export function appUrl(path: string): string {
  return `${appOrigin()}${path.startsWith('/') ? path : `/${path}`}`
}
