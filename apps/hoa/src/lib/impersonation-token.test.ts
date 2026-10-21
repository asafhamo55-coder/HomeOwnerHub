import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  IMPERSONATION_TOKEN_TTL_MS,
  LEGACY_MAC_ISSUED_BEFORE,
  signImpersonationToken,
  verifyImpersonationToken,
  type ImpersonationClaims,
} from './impersonation-token'

const SECRET = 'test-secret-not-real'
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)

const claims: ImpersonationClaims = {
  orgId: 'org-a',
  actorUserId: 'admin-x',
  userId: 'owner-1',
  email: 'owner@example.test',
  name: 'Owner One',
  propertyId: 'prop-1',
}

const expectFor = { orgId: 'org-a', actorUserId: 'admin-x', now: NOW }

function b64(json: unknown): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url')
}

describe('impersonation cookie token', () => {
  it('round-trips for the same org, the same admin, before expiry', () => {
    const token = signImpersonationToken(claims, SECRET, NOW)
    expect(verifyImpersonationToken(token, SECRET, expectFor)).toEqual(claims)
  })

  it('rejects the legacy unsigned JSON cookie (the forged-cookie P0)', () => {
    const forged = JSON.stringify({ userId: 'victim', email: 'victim@x.test', name: 'V', propertyId: null })
    expect(verifyImpersonationToken(forged, SECRET, expectFor)).toBeNull()
  })

  it('rejects a payload re-signed with a different secret', () => {
    const token = signImpersonationToken({ ...claims, userId: 'victim' }, 'attacker-guess', NOW)
    expect(verifyImpersonationToken(token, SECRET, expectFor)).toBeNull()
  })

  it('rejects a tampered payload carrying the original signature', () => {
    const token = signImpersonationToken(claims, SECRET, NOW)
    const [, sig] = token.split('.')
    const tampered = `${b64({ v: 1, ...claims, userId: 'victim', iat: NOW, exp: NOW + 1000 })}.${sig}`
    expect(verifyImpersonationToken(tampered, SECRET, expectFor)).toBeNull()
  })

  it('rejects a missing or empty signature', () => {
    const token = signImpersonationToken(claims, SECRET, NOW)
    const [payload] = token.split('.')
    expect(verifyImpersonationToken(`${payload}.`, SECRET, expectFor)).toBeNull()
    expect(verifyImpersonationToken(payload!, SECRET, expectFor)).toBeNull()
    expect(verifyImpersonationToken('', SECRET, expectFor)).toBeNull()
  })

  it('rejects a cookie issued in org A while the current org is B', () => {
    const token = signImpersonationToken(claims, SECRET, NOW)
    expect(verifyImpersonationToken(token, SECRET, { ...expectFor, orgId: 'org-b' })).toBeNull()
  })

  it('rejects a cookie issued for admin X presented by user Y', () => {
    const token = signImpersonationToken(claims, SECRET, NOW)
    expect(verifyImpersonationToken(token, SECRET, { ...expectFor, actorUserId: 'user-y' })).toBeNull()
  })

  it('rejects an expired cookie', () => {
    const token = signImpersonationToken(claims, SECRET, NOW)
    expect(
      verifyImpersonationToken(token, SECRET, { ...expectFor, now: NOW + IMPERSONATION_TOKEN_TTL_MS + 1 }),
    ).toBeNull()
  })

  it('rejects a validly signed token whose exp was pushed out past the TTL', () => {
    // Signed with the real secret, so only the iat/exp sanity check stops it.
    const payload = b64({ v: 1, ...claims, iat: NOW, exp: NOW + 10 * IMPERSONATION_TOKEN_TTL_MS })
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
    expect(verifyImpersonationToken(`${payload}.${sig}`, SECRET, expectFor)).toBeNull()
  })

  it('SEC-N7: the MAC is domain-separated (not a bare HMAC of the payload)', () => {
    const token = signImpersonationToken(claims, SECRET, NOW)
    const [payload, sig] = token.split('.')
    expect(sig).not.toBe(createHmac('sha256', SECRET).update(payload!).digest('base64url'))
  })

  it('SEC-N7: a legacy bare-HMAC token verifies only if issued before the cutoff', () => {
    const legacy = (iat: number) => {
      const payload = b64({ v: 1, ...claims, iat, exp: iat + IMPERSONATION_TOKEN_TTL_MS })
      return `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`
    }
    expect(verifyImpersonationToken(legacy(NOW), SECRET, expectFor)).toEqual(claims)
    const after = LEGACY_MAC_ISSUED_BEFORE + 1000
    expect(verifyImpersonationToken(legacy(after), SECRET, { ...expectFor, now: after + 1000 })).toBeNull()
    // …and a new-format token issued after the cutoff is fine.
    expect(verifyImpersonationToken(signImpersonationToken(claims, SECRET, after), SECRET, { ...expectFor, now: after + 1000 })).toEqual(claims)
  })

  it('fails closed with no secret', () => {
    const token = signImpersonationToken(claims, SECRET, NOW)
    expect(verifyImpersonationToken(token, null, expectFor)).toBeNull()
    expect(() => signImpersonationToken(claims, null, NOW)).toThrow()
  })

  it('rejects when the caller has no org or no signed-in user', () => {
    const token = signImpersonationToken(claims, SECRET, NOW)
    expect(verifyImpersonationToken(token, SECRET, { ...expectFor, orgId: null })).toBeNull()
    expect(verifyImpersonationToken(token, SECRET, { ...expectFor, actorUserId: null })).toBeNull()
  })
})
