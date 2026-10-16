// Shared-secret checks for machine callers: cron, ops probes, ingest
// (RC-7). Authorization: Bearer only — never `?key=` (a query secret lands
// in Vercel and proxy access logs) — and compared in constant time.
// Fails closed: an unset secret is 503 not_configured, never "open".
// One env var per purpose; do not reuse CRON_SECRET for a new caller (R-21).

import { createHash, timingSafeEqual } from 'node:crypto'
import { ApiRouteError } from './errors'

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  const m = header?.match(/^Bearer\s+(.+)$/i)
  return m ? m[1]!.trim() : null
}

/** Constant-time equality. Hashing first makes the lengths equal, so length is not leaked either. */
export function secretMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Throws unless `Authorization: Bearer <process.env[envName]>`. */
export function requireBearerSecret(request: Request, envName: string): void {
  const expected = process.env[envName]
  if (!expected) throw new ApiRouteError('not_configured')
  if (!secretMatches(bearerToken(request), expected)) throw new ApiRouteError('unauthenticated')
}
