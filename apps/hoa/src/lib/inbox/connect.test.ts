import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { sanitizeReturnTo, signState, verifyState } from './connect'

// signState/verifyState only use MAILBOX_TOKEN_KEY as an HMAC key via
// node:crypto's createHmac, which accepts any string — unlike
// packages/mailbox/src/crypto.ts it does not require 32 raw bytes. A
// plain test string is enough to exercise the signing contract. This is
// never a real secret — it exists only in-process for the duration of
// this test file.
const TEST_KEY = 'unit-test-mailbox-token-key-do-not-use-in-prod'

function payload(over: Partial<{ orgId: string; userId: string; returnTo: string; issuedAt: number }> = {}) {
  return {
    orgId: 'org-1',
    userId: 'user-1',
    returnTo: '/settings/mailbox',
    issuedAt: Date.now(),
    ...over,
  }
}

describe('signState / verifyState', () => {
  beforeEach(() => {
    process.env.MAILBOX_TOKEN_KEY = TEST_KEY
  })

  it('round-trips: sign then verify returns the original payload', () => {
    const p = payload()
    const state = signState(p)
    expect(verifyState(state)).toEqual(p)
  })

  it('rejects a state with a tampered payload (flipped byte in the encoded body)', () => {
    const state = signState(payload())
    const [body, mac] = state.split('.')
    const bytes = Buffer.from(body, 'base64url')
    bytes[0] ^= 0xff
    const tampered = `${bytes.toString('base64url')}.${mac}`
    expect(() => verifyState(tampered)).toThrow(/signature mismatch/)
  })

  it('rejects a state with a tampered MAC', () => {
    const state = signState(payload())
    const [body, mac] = state.split('.')
    const macBytes = Buffer.from(mac, 'base64url')
    macBytes[0] ^= 0xff
    const tampered = `${body}.${macBytes.toString('base64url')}`
    expect(() => verifyState(tampered)).toThrow(/signature mismatch/)
  })

  it('rejects an expired state, with an error telling the user to start again', () => {
    const TEN_MINUTES_MS = 10 * 60 * 1000
    const stale = signState(payload({ issuedAt: Date.now() - TEN_MINUTES_MS - 1 }))
    expect(() => verifyState(stale)).toThrow(/start the connection again/)
  })

  it('accepts a state right at the edge of the TTL', () => {
    const p = payload({ issuedAt: Date.now() - 1000 })
    expect(verifyState(signState(p))).toEqual(p)
  })

  describe('malformed state — rejected cleanly, never an opaque crash', () => {
    it('rejects a state with no "." separator', () => {
      expect(() => verifyState('not-a-valid-state-at-all')).toThrow(/Malformed OAuth state/)
    })

    it('rejects a state with the wrong segment count', () => {
      expect(() => verifyState('one.two.three')).toThrow(/Malformed OAuth state/)
    })

    it('rejects an empty string', () => {
      expect(() => verifyState('')).toThrow(/Malformed OAuth state/)
    })

    it('rejects a state whose body is not valid base64url JSON', () => {
      // "not-json!!!" base64url-decodes to bytes that are not valid JSON.
      const body = Buffer.from('not-json!!!').toString('base64url')
      const mac = createHmac('sha256', TEST_KEY).update(body).digest('base64url')
      expect(() => verifyState(`${body}.${mac}`)).toThrow()
    })

    it('rejects a state missing the MAC segment', () => {
      expect(() => verifyState('somebody.')).toThrow(/Malformed OAuth state/)
    })
  })
})

describe('sanitizeReturnTo', () => {
  it('accepts a plain path', () => {
    expect(sanitizeReturnTo('/inbox')).toBe('/inbox')
  })

  it('accepts a nested path', () => {
    expect(sanitizeReturnTo('/settings/mailbox')).toBe('/settings/mailbox')
  })

  it('rejects an absolute URL to another host and falls back to the default', () => {
    expect(sanitizeReturnTo('https://evil.com')).toBe('/settings/mailbox')
  })

  it('rejects a protocol-relative URL and falls back to the default', () => {
    expect(sanitizeReturnTo('//evil.com')).toBe('/settings/mailbox')
  })

  it('rejects a backslash-prefixed form and falls back to the default', () => {
    expect(sanitizeReturnTo('/\\evil.com')).toBe('/settings/mailbox')
  })

  it('rejects a javascript: URL and falls back to the default', () => {
    expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/settings/mailbox')
  })

  it('rejects a value containing "://" anywhere, not just at the start', () => {
    expect(sanitizeReturnTo('/redirect?next=https://evil.com')).toBe('/settings/mailbox')
  })

  it('falls back to the default for null/undefined/empty', () => {
    expect(sanitizeReturnTo(null)).toBe('/settings/mailbox')
    expect(sanitizeReturnTo(undefined)).toBe('/settings/mailbox')
    expect(sanitizeReturnTo('')).toBe('/settings/mailbox')
  })

  it('rejects a value that does not start with a slash', () => {
    expect(sanitizeReturnTo('evil.com')).toBe('/settings/mailbox')
  })
})
