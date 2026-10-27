// BL-168 — the signed link in an invitation to a CPA or attorney who already
// has an account. The link names an invitation row (professional_invites);
// the HMAC proves the board's server issued it, and the row carries the
// state (expiry, accepted, revoked), so a link can be used once and
// cancelled. Pure: node:crypto only.

import { createHmac, timingSafeEqual } from 'node:crypto'

const DOMAIN = 'professional-invite:v1'

/**
 * The signing key for invitation links: PRO_INVITE_SECRET (at least 32
 * characters). In production there is NO fallback, so a missing key stops
 * invitations instead of signing them with a key that does other jobs
 * (the service role). Outside production the usual server-only chain is
 * used so local runs and tests need no setup.
 */
export function inviteSecret(env: Record<string, string | undefined> = process.env): string | null {
  const dedicated = env.PRO_INVITE_SECRET
  if (dedicated && dedicated.length >= 32) return dedicated
  if (env.NODE_ENV === 'production') return null
  return env.PAY_SETTINGS_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || null
}

export function signInvite(inviteId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${DOMAIN}:${inviteId}`).digest('hex')
}

export function verifyInvite(inviteId: string, sig: string | null | undefined, secret: string): boolean {
  if (!sig || !/^[0-9a-f]{64}$/.test(sig)) return false
  const expected = Buffer.from(signInvite(inviteId, secret), 'hex')
  const given = Buffer.from(sig, 'hex')
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** The accept page path, relative to the app origin. */
export function inviteHref(inviteId: string, secret: string): string {
  return `/pro-invite/${inviteId}?sig=${signInvite(inviteId, secret)}`
}

/** Supabase's answer when inviteUserByEmail meets an address that already has an account. */
export function isAlreadyRegistered(err: { code?: string; message?: string; status?: number } | null | undefined): boolean {
  if (!err) return false
  return err.code === 'email_exists' || /already (been )?registered|already exists/i.test(err.message ?? '')
}
