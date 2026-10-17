// Where a signed-out request should return after signing in. Pure, so the
// middleware and the dev auto-login share it and vitest can pin it.

/**
 * The `redirect` value for a bounced request: path AND query. The query
 * used to be dropped, so `/properties?filter=attention` came back as
 * `/properties` — which is also why `pnpm ui:shots` could not shoot any
 * `?tab=` / `?filter=` / `?q=` view (its first hit goes through the
 * dev auto-login). Null when there is nothing beyond the root.
 */
export function returnToParam(pathname: string, search: string): string | null {
  if (pathname === '/' && !search) return null
  return `${pathname}${search}`
}

/** A same-origin path, or `/`. Never a scheme, host or protocol-relative URL. */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  return raw
}
