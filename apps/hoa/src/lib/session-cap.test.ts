import { describe, expect, it } from 'vitest'
import {
  SESSION_MAX_AGE_MS,
  decodeJwtPayload,
  evaluateSessionCap,
  isExpired,
  sessionStartFromClaims,
  signStamp,
  verifyStamp,
} from './session-cap'

function fakeJwt(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${body}.signature`
}

const SECRET = 'test-secret-not-a-real-key'
const SESSION_ID = '3f8c1e4a-2b6d-4c9f-8a1e-7d0b5c2f9a34'

describe('signStamp / verifyStamp', () => {
  it('round-trips the session id and start time', async () => {
    const startedAt = 1_760_000_000_000
    const stamp = await signStamp(SESSION_ID, startedAt, SECRET)

    await expect(verifyStamp(stamp, SECRET)).resolves.toEqual({
      sessionId: SESSION_ID,
      startedAt,
    })
  })

  it('rejects a stamp whose start time was edited', async () => {
    const startedAt = 1_760_000_000_000
    const stamp = await signStamp(SESSION_ID, startedAt, SECRET)
    const [id, , sig] = stamp.split('.')
    const forged = [id, String(startedAt + SESSION_MAX_AGE_MS), sig].join('.')

    await expect(verifyStamp(forged, SECRET)).resolves.toBeNull()
  })

  it('rejects a stamp signed with a different secret', async () => {
    const stamp = await signStamp(SESSION_ID, 1_760_000_000_000, 'other-secret')

    await expect(verifyStamp(stamp, SECRET)).resolves.toBeNull()
  })

  it('rejects missing or malformed values', async () => {
    await expect(verifyStamp(undefined, SECRET)).resolves.toBeNull()
    await expect(verifyStamp('', SECRET)).resolves.toBeNull()
    await expect(verifyStamp('not-a-stamp', SECRET)).resolves.toBeNull()
    await expect(verifyStamp(`${SESSION_ID}.notanumber.sig`, SECRET)).resolves.toBeNull()
  })
})

describe('isExpired', () => {
  const startedAt = 1_760_000_000_000

  it('is false one minute before the cap', () => {
    expect(isExpired(startedAt, startedAt + SESSION_MAX_AGE_MS - 60_000)).toBe(false)
  })

  it('is true exactly at the cap', () => {
    expect(isExpired(startedAt, startedAt + SESSION_MAX_AGE_MS)).toBe(true)
  })

  it('is true well past the cap', () => {
    expect(isExpired(startedAt, startedAt + SESSION_MAX_AGE_MS * 3)).toBe(true)
  })

  it('treats a start time in the future as not expired', () => {
    expect(isExpired(startedAt, startedAt - 60_000)).toBe(false)
  })
})

describe('sessionStartFromClaims', () => {
  it('reads the amr timestamp and converts seconds to milliseconds', () => {
    const claims = { amr: [{ method: 'password', timestamp: 1_760_000_000 }] }

    expect(sessionStartFromClaims(claims)).toBe(1_760_000_000_000)
  })

  it('uses the earliest amr entry when a session has several', () => {
    // A session that later stepped up to MFA carries both methods; the
    // session began at the first one.
    const claims = {
      amr: [
        { method: 'mfa/totp', timestamp: 1_760_000_600 },
        { method: 'password', timestamp: 1_760_000_000 },
      ],
    }

    expect(sessionStartFromClaims(claims)).toBe(1_760_000_000_000)
  })

  it('returns null for the RFC-8176 string form, which carries no timestamp', () => {
    expect(sessionStartFromClaims({ amr: ['password'] })).toBeNull()
  })

  it('returns null when amr is absent or unusable', () => {
    expect(sessionStartFromClaims({})).toBeNull()
    expect(sessionStartFromClaims(null)).toBeNull()
    expect(sessionStartFromClaims({ amr: [] })).toBeNull()
    expect(sessionStartFromClaims({ amr: [{ method: 'password' }] })).toBeNull()
  })
})

describe('decodeJwtPayload', () => {
  it('reads the claims out of a Supabase access token', () => {
    const token = fakeJwt({ session_id: SESSION_ID, amr: [{ method: 'password', timestamp: 1 }] })

    expect(decodeJwtPayload(token)).toMatchObject({ session_id: SESSION_ID })
  })

  it('decodes base64url payloads containing - and _ bytes', () => {
    // A payload whose base64 encoding needs the URL-safe alphabet; plain
    // atob() on the standard alphabet would throw or mis-decode.
    const token = fakeJwt({ session_id: SESSION_ID, email: 'a+b/c~ÿ@example.com' })

    expect(decodeJwtPayload(token)).toMatchObject({ email: 'a+b/c~ÿ@example.com' })
  })

  it('returns null for tokens it cannot parse', () => {
    expect(decodeJwtPayload(undefined)).toBeNull()
    expect(decodeJwtPayload('')).toBeNull()
    expect(decodeJwtPayload('two.parts')).toBeNull()
    expect(decodeJwtPayload('header.!!!not-base64!!!.sig')).toBeNull()
    expect(decodeJwtPayload(`header.${Buffer.from('not json').toString('base64url')}.sig`)).toBeNull()
  })
})

describe('evaluateSessionCap', () => {
  const NOW = 1_760_000_000_000
  const token = (claims: Record<string, unknown> = {}) =>
    fakeJwt({ session_id: SESSION_ID, ...claims })

  it('skips the cap when no signing secret is configured', async () => {
    await expect(
      evaluateSessionCap({ accessToken: token(), stampCookie: null, secret: '', now: NOW }),
    ).resolves.toEqual({ action: 'skip' })
  })

  it('skips the cap when the token carries no session_id', async () => {
    await expect(
      evaluateSessionCap({
        accessToken: fakeJwt({ sub: 'user-1' }),
        stampCookie: null,
        secret: SECRET,
        now: NOW,
      }),
    ).resolves.toEqual({ action: 'skip' })
  })

  it('skips the cap when the token cannot be decoded', async () => {
    await expect(
      evaluateSessionCap({ accessToken: 'garbage', stampCookie: null, secret: SECRET, now: NOW }),
    ).resolves.toEqual({ action: 'skip' })
  })

  it('starts the clock at now for a session it has not stamped before', async () => {
    const decision = await evaluateSessionCap({
      accessToken: token(),
      stampCookie: null,
      secret: SECRET,
      now: NOW,
    })

    expect(decision.action).toBe('refresh')
    const written = decision.action === 'refresh' ? decision.cookieValue : ''
    await expect(verifyStamp(written, SECRET)).resolves.toEqual({
      sessionId: SESSION_ID,
      startedAt: NOW,
    })
  })

  it('backdates an unstamped session to its real login time from amr', async () => {
    const loginAt = NOW - 60 * 60 * 1000
    const decision = await evaluateSessionCap({
      accessToken: token({ amr: [{ method: 'password', timestamp: loginAt / 1000 }] }),
      stampCookie: null,
      secret: SECRET,
      now: NOW,
    })

    expect(decision.action).toBe('refresh')
    const written = decision.action === 'refresh' ? decision.cookieValue : ''
    await expect(verifyStamp(written, SECRET)).resolves.toEqual({
      sessionId: SESSION_ID,
      startedAt: loginAt,
    })
  })

  it('expires an unstamped session whose amr login is already over a day old', async () => {
    // The rollout case: a session that existed before this shipped must not
    // be granted a fresh 24 hours just because it has no stamp yet.
    await expect(
      evaluateSessionCap({
        accessToken: token({
          amr: [{ method: 'password', timestamp: (NOW - SESSION_MAX_AGE_MS - 1000) / 1000 }],
        }),
        stampCookie: null,
        secret: SECRET,
        now: NOW,
      }),
    ).resolves.toEqual({ action: 'expire' })
  })

  it('allows a stamped session still inside its window', async () => {
    const stamp = await signStamp(SESSION_ID, NOW - 60 * 60 * 1000, SECRET)

    await expect(
      evaluateSessionCap({ accessToken: token(), stampCookie: stamp, secret: SECRET, now: NOW }),
    ).resolves.toEqual({ action: 'allow' })
  })

  it('expires a stamped session past its window', async () => {
    const stamp = await signStamp(SESSION_ID, NOW - SESSION_MAX_AGE_MS - 1, SECRET)

    await expect(
      evaluateSessionCap({ accessToken: token(), stampCookie: stamp, secret: SECRET, now: NOW }),
    ).resolves.toEqual({ action: 'expire' })
  })

  it('restarts the clock when the user signs in again as a new session', async () => {
    const oldStamp = await signStamp('a-previous-session-id', NOW - SESSION_MAX_AGE_MS * 2, SECRET)

    const decision = await evaluateSessionCap({
      accessToken: token(),
      stampCookie: oldStamp,
      secret: SECRET,
      now: NOW,
    })

    expect(decision.action).toBe('refresh')
    const written = decision.action === 'refresh' ? decision.cookieValue : ''
    await expect(verifyStamp(written, SECRET)).resolves.toEqual({
      sessionId: SESSION_ID,
      startedAt: NOW,
    })
  })

  it('ignores a forged stamp rather than honouring its start time', async () => {
    const real = await signStamp(SESSION_ID, NOW - SESSION_MAX_AGE_MS - 1, SECRET)
    const [id, , sig] = real.split('.')
    const forged = [id, String(NOW), sig].join('.')

    const decision = await evaluateSessionCap({
      accessToken: token({ amr: [{ method: 'password', timestamp: (NOW - SESSION_MAX_AGE_MS - 1) / 1000 }] }),
      stampCookie: forged,
      secret: SECRET,
      now: NOW,
    })

    // Falls back to amr, which still says the session is a day old.
    expect(decision).toEqual({ action: 'expire' })
  })
})
