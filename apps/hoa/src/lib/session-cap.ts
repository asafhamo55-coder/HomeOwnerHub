// Absolute 24-hour cap on how long a signed-in session may live.
//
// Supabase rotates refresh tokens indefinitely, so without this a session
// stays valid forever as long as the browser keeps visiting. Middleware
// stamps a cookie the first time it sees a given Supabase `session_id` and
// forces a re-login once that stamp is a day old.
//
// The stamp is HMAC-signed because the whole point is bounding a session
// that has fallen into the wrong hands — an unsigned cookie could simply be
// edited to extend it. Everything here is pure and Edge-runtime safe (Web
// Crypto only, no `node:crypto`), so middleware can use it directly.

export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000

export const SESSION_STAMP_COOKIE = 'hh_session_start'

export type SessionStamp = {
  /** Supabase `session_id` claim this stamp belongs to. */
  sessionId: string
  /** Epoch milliseconds when the session began. */
  startedAt: number
}

const encoder = new TextEncoder()

function importKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string) {
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  // Backed by an explicit ArrayBuffer (not ArrayBufferLike) so this satisfies
  // BufferSource for crypto.subtle without a cast.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Read the claims out of a Supabase access token without verifying it.
 *
 * Safe here, and deliberately cheap: middleware has already called
 * `supabase.auth.getUser()`, which authenticates this very token against
 * Supabase. We only need the `session_id` and `amr` out of the token it
 * already vouched for — decoding locally avoids a second round-trip on
 * every single request. Never use this to establish identity.
 */
export function decodeJwtPayload(token: string | undefined | null): Record<string, unknown> | null {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const claims: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])))
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Produce the cookie value recording when `sessionId` started. */
export async function signStamp(
  sessionId: string,
  startedAt: number,
  secret: string,
): Promise<string> {
  const payload = `${sessionId}.${startedAt}`
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importKey(secret),
    encoder.encode(payload),
  )
  return `${payload}.${toBase64Url(signature)}`
}

/**
 * Decode a stamp cookie, returning null unless the signature checks out.
 * Verification goes through `crypto.subtle.verify` rather than a string
 * compare so it stays constant-time.
 */
export async function verifyStamp(
  value: string | undefined | null,
  secret: string,
): Promise<SessionStamp | null> {
  if (!value) return null

  const parts = value.split('.')
  if (parts.length !== 3) return null

  const [sessionId, startedAtRaw, signature] = parts
  if (!sessionId || !/^\d+$/.test(startedAtRaw)) return null

  let valid: boolean
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await importKey(secret),
      fromBase64Url(signature),
      encoder.encode(`${sessionId}.${startedAtRaw}`),
    )
  } catch {
    // Malformed base64url in the signature segment.
    return null
  }
  if (!valid) return null

  return { sessionId, startedAt: Number(startedAtRaw) }
}

/**
 * Recover the real login time from the access token's `amr` claim, so
 * sessions that already existed when this shipped expire on their true
 * schedule instead of being granted a fresh day.
 *
 * Supabase emits `amr` either as objects carrying a timestamp or as bare
 * RFC-8176 method strings; only the former tells us anything.
 */
export function sessionStartFromClaims(claims: unknown): number | null {
  if (!claims || typeof claims !== 'object') return null

  const amr = (claims as { amr?: unknown }).amr
  if (!Array.isArray(amr)) return null

  const timestamps = amr
    .map((entry) =>
      entry && typeof entry === 'object' ? (entry as { timestamp?: unknown }).timestamp : undefined,
    )
    .filter((ts): ts is number => typeof ts === 'number' && Number.isFinite(ts))

  if (timestamps.length === 0) return null

  // A session that later stepped up to MFA carries several methods; it began
  // at the first of them.
  return Math.min(...timestamps) * 1000
}

export function isExpired(startedAt: number, now: number): boolean {
  return now - startedAt >= SESSION_MAX_AGE_MS
}

export type SessionCapDecision =
  /** Cap not enforceable (no secret, or no session_id in the token). Let the request through. */
  | { action: 'skip' }
  /** Inside the window, stamp already correct. */
  | { action: 'allow' }
  /** Inside the window, but the stamp needs writing — new session or missing cookie. */
  | { action: 'refresh'; cookieValue: string }
  /** Past the window. Sign the user out. */
  | { action: 'expire' }

/**
 * Decide what to do with an authenticated request. Pure apart from the
 * clock, which the caller passes in, so middleware stays a thin applier of
 * the result.
 */
export async function evaluateSessionCap(opts: {
  accessToken: string | undefined | null
  stampCookie: string | undefined | null
  secret: string | undefined | null
  now: number
}): Promise<SessionCapDecision> {
  const { accessToken, stampCookie, secret, now } = opts

  // No secret means a misconfigured deploy. Fail open: an env slip should
  // never lock every resident out of the portal. The caller logs it.
  if (!secret) return { action: 'skip' }

  const claims = decodeJwtPayload(accessToken)
  const sessionId = claims?.session_id
  if (typeof sessionId !== 'string' || !sessionId) return { action: 'skip' }

  const existing = await verifyStamp(stampCookie, secret)
  if (existing && existing.sessionId === sessionId) {
    return isExpired(existing.startedAt, now) ? { action: 'expire' } : { action: 'allow' }
  }

  // No usable stamp: either a fresh sign-in, a session predating this
  // feature, or a cleared/forged cookie. `amr` gives us the true login time
  // when Supabase includes it; otherwise the clock starts now. A user who
  // clears their cookies can therefore buy themselves a new window — that is
  // not fixable without server-side session state, and it costs them their
  // login either way.
  const startedAt = sessionStartFromClaims(claims) ?? now
  if (isExpired(startedAt, now)) return { action: 'expire' }

  return { action: 'refresh', cookieValue: await signStamp(sessionId, startedAt, secret) }
}
