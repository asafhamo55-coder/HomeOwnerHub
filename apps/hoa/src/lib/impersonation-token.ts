// Signed, bound token for the admin "enter owner portal" cookie.
//
// The cookie used to be bare JSON naming a target owner. Anyone could set
// it, and the read path handed back a service-role client for whatever it
// named — a cross-tenant leak. The token is now:
//
//   base64url(JSON claims) "." base64url(HMAC-SHA256(secret, payload))
//
// and it only verifies for the org it was issued in, for the admin it was
// issued to, before it expires. Pure (no next/headers) so it is unit-tested
// directly; impersonation.ts supplies the current org, user and secret.

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Same 8h window as the cookie's maxAge. */
export const IMPERSONATION_TOKEN_TTL_MS = 8 * 60 * 60 * 1000

export interface ImpersonationClaims {
  /** Org the admin impersonated from. Reads are confined to it. */
  orgId: string
  /** The admin who entered the portal. */
  actorUserId: string
  /** Target owner's auth uid, null for an account-less owner. */
  userId: string | null
  email: string
  name: string
  propertyId: string | null
}

interface Payload extends ImpersonationClaims {
  v: 1
  iat: number
  exp: number
}

/**
 * SEC-N7: the secret is shared with the signed board settings
 * (paySettingsSecret), so the MAC carries its own domain and can never be
 * confused with another signature made with the same key.
 */
const MAC_DOMAIN = 'hoa-impersonation:v2\n'

/**
 * Tokens signed before the domain prefix (bare HMAC of the payload) are
 * accepted only if issued before this instant; with the 8h TTL every such
 * token is expired by LEGACY_MAC_ISSUED_BEFORE + 8h, after which the
 * legacy branch can be deleted.
 */
export const LEGACY_MAC_ISSUED_BEFORE = Date.parse('2026-10-23T00:00:00Z')

function mac(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(MAC_DOMAIN + payload).digest()
}

function legacyMac(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest()
}

export function signImpersonationToken(
  claims: ImpersonationClaims,
  secret: string | null,
  now: number = Date.now(),
): string {
  if (!secret) throw new Error('impersonation: no signing secret configured')
  const body: Payload = { v: 1, ...claims, iat: now, exp: now + IMPERSONATION_TOKEN_TTL_MS }
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${payload}.${mac(payload, secret).toString('base64url')}`
}

/**
 * Claims when the token is authentic AND bound to this org and this
 * signed-in user AND unexpired; null otherwise. Never throws.
 */
export function verifyImpersonationToken(
  raw: string | null | undefined,
  secret: string | null,
  expected: { orgId: string | null; actorUserId: string | null; now?: number },
): ImpersonationClaims | null {
  if (!raw || !secret || !expected.orgId || !expected.actorUserId) return null
  const dot = raw.indexOf('.')
  if (dot <= 0 || dot !== raw.lastIndexOf('.')) return null
  const payload = raw.slice(0, dot)
  const sigText = raw.slice(dot + 1)
  if (!sigText) return null

  const given = Buffer.from(sigText, 'base64url')
  const same = (want: Buffer) => given.length === want.length && timingSafeEqual(given, want)
  const current = same(mac(payload, secret))
  const legacy = !current && same(legacyMac(payload, secret))
  if (!current && !legacy) return null

  let p: Partial<Payload>
  try {
    p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<Payload>
  } catch {
    return null
  }
  if (!p || p.v !== 1) return null
  if (typeof p.orgId !== 'string' || typeof p.actorUserId !== 'string') return null
  if (typeof p.email !== 'string' || typeof p.name !== 'string') return null
  if (typeof p.iat !== 'number' || typeof p.exp !== 'number') return null
  if (legacy && !(p.iat < LEGACY_MAC_ISSUED_BEFORE)) return null

  const now = expected.now ?? Date.now()
  if (p.exp <= now) return null
  if (p.exp - p.iat > IMPERSONATION_TOKEN_TTL_MS || p.iat > now + 60_000) return null
  if (p.orgId !== expected.orgId) return null
  if (p.actorUserId !== expected.actorUserId) return null

  return {
    orgId: p.orgId,
    actorUserId: p.actorUserId,
    userId: typeof p.userId === 'string' ? p.userId : null,
    email: p.email,
    name: p.name,
    propertyId: typeof p.propertyId === 'string' ? p.propertyId : null,
  }
}
