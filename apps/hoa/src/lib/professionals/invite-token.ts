// BL-168 — the signed link in an invitation to a CPA or attorney who already
// has an account. The link names an invitation row (professional_invites);
// the HMAC proves the board's server issued it, and the row carries the
// state (expiry, accepted, revoked), so a link can be used once and
// cancelled. Pure: node:crypto only.

import { createHmac, timingSafeEqual } from 'node:crypto'

const DOMAIN = 'professional-invite:v1'

/** Same server-only secret chain as the GA registration record and the pay settings. */
export function inviteSecret(env: Record<string, string | undefined> = process.env): string | null {
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
