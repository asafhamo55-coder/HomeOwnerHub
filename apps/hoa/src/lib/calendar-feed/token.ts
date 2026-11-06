// The signed link behind "Add to my calendar" (Round 29). Pure: node:crypto only.
//
// A calendar app fetches the feed with no cookies, so the URL itself is the
// credential: `<userId>.<orgId>.<version>.<signature>`. The signature is an
// HMAC-SHA256 over exactly those three values with its own domain prefix and
// its own secret (CALENDAR_FEED_SECRET), so it can never be replayed as any
// other signed value in the app.
//
// Revocation: `version` is the resident's `calendar_feed_v` in user_metadata.
// "Reset my calendar link" bumps it; every older link then fails the route's
// version check. No migration, no token table.
//
// No secret, no link: in production resolveSigningSecret returns null when
// CALENDAR_FEED_SECRET is missing (it never falls back to the database
// service key), and the feed and the button both stay hidden.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { resolveSigningSecret } from '../signing-secret'

const DOMAIN = 'calendar-feed:v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SIG = /^[A-Za-z0-9_-]{43}$/
export const MAX_FEED_VERSION = 1_000_000

export interface FeedTokenClaims {
  userId: string
  orgId: string
  version: number
}

export function calendarFeedSecret(env: Record<string, string | undefined> = process.env): string | null {
  return resolveSigningSecret('CALENDAR_FEED_SECRET', env)
}

/** The resident's current link version from user_metadata. Anything unexpected is 0. */
export function feedVersionOf(metadata: unknown): number {
  const v = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).calendar_feed_v : undefined
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_FEED_VERSION ? v : 0
}

function mac(secret: string, c: FeedTokenClaims): string {
  return createHmac('sha256', secret).update(`${DOMAIN}:${c.userId}:${c.orgId}:${c.version}`).digest('base64url')
}

export function signFeedToken(secret: string, claims: FeedTokenClaims): string {
  return `${claims.userId}.${claims.orgId}.${claims.version}.${mac(secret, claims)}`
}

/** The claims when the token is well formed and signed with `secret`; otherwise null. */
export function verifyFeedToken(secret: string | null, token: string): FeedTokenClaims | null {
  if (!secret || typeof token !== 'string' || token.length > 200) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [userId, orgId, v, sig] = parts as [string, string, string, string]
  if (!UUID.test(userId) || !UUID.test(orgId) || !/^(0|[1-9]\d{0,6})$/.test(v) || !SIG.test(sig)) return null
  const version = Number(v)
  if (version > MAX_FEED_VERSION) return null
  const claims = { userId, orgId, version }
  const expected = Buffer.from(mac(secret, claims))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given) ? claims : null
}

/** https and webcal:// forms of the feed URL. `origin` is the app origin. */
export function feedUrls(origin: string, token: string): { https: string; webcal: string } {
  const base = origin.replace(/\/+$/, '')
  const https = `${base}/calendar/${token}`
  return { https, webcal: https.replace(/^https?:\/\//, 'webcal://') }
}
