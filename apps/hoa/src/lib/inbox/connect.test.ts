import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_RETURN_TO, sanitizeReturnTo, signState, verifyState } from './connect'

/**
 * The same base the real redirect resolves against
 * (`new URL(sanitizeReturnTo(returnTo) + '?...', request.url)` in both
 * `apps/hoa/src/app/api/oauth/google/start/route.ts` and
 * `.../callback/route.ts`). Tests below reproduce that exact call shape
 * rather than asserting on what `sanitizeReturnTo` returns in isolation —
 * a value can look path-shaped as a string and still resolve off-origin
 * once parsed, which is exactly how the control-character bypass slipped
 * past the previous version of this function.
 */
const REDIRECT_BASE = 'https://app.example.com/api/oauth/google/callback'

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

  // NOTE on what this test does and doesn't prove: it asserts that a MAC
  // with one flipped byte is rejected — i.e. the comparison correctly
  // returns "not equal" for unequal inputs. A naive `mac === expected`
  // would reject this exact input too, so this assertion by itself does
  // NOT distinguish `verifyState`'s `timingSafeEqual` from a plain `===`.
  // Nothing a black-box `expect(...).toThrow()` assertion can observe
  // proves constant-time behaviour — that requires measuring execution
  // time across many inputs (or reading the implementation), not
  // asserting on a return value. The guarantee that this comparison
  // runs in constant time is enforced by code review of `verifyState`
  // (see the module-level comment in connect.ts), not by this test.
  it('rejects a state with a tampered MAC (does not prove constant-time comparison — see note above)', () => {
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

  /**
   * The property that actually matters: does the value `sanitizeReturnTo`
   * hands back stay on this origin once it goes through the *exact* call
   * the real routes make — `new URL(sanitized + '?x=1', base)`? A string
   * can look path-shaped (single leading slash, no literal "//", no
   * literal "://") and still resolve to a different origin once the same
   * WHATWG parser Node's `URL`/`NextResponse.redirect` uses gets hold of
   * it — that gap is exactly how `/\t/evil.com` bypassed the previous
   * version of this function. Asserting on the parsed `origin`, not on
   * the shape of the returned string, is what would have caught that.
   */
  function resolvedOrigin(candidate: string | null | undefined): string {
    const sanitized = sanitizeReturnTo(candidate)
    return new URL(`${sanitized}?x=1`, REDIRECT_BASE).origin
  }

  const baseOrigin = new URL(REDIRECT_BASE).origin

  describe('accepted — origin is preserved end to end', () => {
    it.each([
      '/inbox',
      '/settings/mailbox',
      '/inbox?filter=open',
      '/a/b/c',
    ])('%s', (candidate) => {
      expect(sanitizeReturnTo(candidate)).toBe(candidate)
      expect(resolvedOrigin(candidate)).toBe(baseOrigin)
    })
  })

  describe('rejected — falls back to DEFAULT_RETURN_TO and origin never leaves this host', () => {
    it.each([
      // Absolute / protocol-relative / backslash forms.
      ['https://evil.com', 'absolute URL to another host'],
      ['HTTPS://evil.com', 'absolute URL, uppercase scheme'],
      ['//evil.com', 'protocol-relative'],
      ['/\\evil.com', 'backslash-prefixed'],
      ['\\\\evil.com', 'double-backslash-prefixed'],
      ['///evil.com', 'triple slash'],
      ['/\\/evil.com', 'slash-backslash-slash'],
      // Non-http(s) schemes.
      ['javascript:alert(1)', 'javascript: scheme'],
      ['java\tscript:alert(1)', 'javascript: scheme with an embedded tab'],
      // The confirmed control-character bypass, in all three stripped
      // characters, and in combination.
      ['/\t/evil.com', 'embedded tab — the confirmed bypass'],
      ['/\n/evil.com', 'embedded LF'],
      ['/\r/evil.com', 'embedded CR'],
      ['/\t\t//evil.com', 'double tab plus protocol-relative'],
      ['/\r\n/evil.com', 'CRLF combination'],
      // Query-string smuggling and non-slash-leading input.
      ['/redirect?next=https://evil.com', 'scheme smuggled into a query param'],
      [' /foo', 'leading whitespace before an otherwise-valid path'],
      ['\t//evil.com', 'leading tab before a protocol-relative form'],
      ['evil.com', 'no leading slash at all'],
    ])('%s (%s)', (candidate) => {
      expect(sanitizeReturnTo(candidate)).toBe(DEFAULT_RETURN_TO)
      expect(resolvedOrigin(candidate)).toBe(baseOrigin)
    })

    it('null', () => {
      expect(sanitizeReturnTo(null)).toBe(DEFAULT_RETURN_TO)
      expect(resolvedOrigin(null)).toBe(baseOrigin)
    })

    it('undefined', () => {
      expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_RETURN_TO)
      expect(resolvedOrigin(undefined)).toBe(baseOrigin)
    })

    it('empty string', () => {
      expect(sanitizeReturnTo('')).toBe(DEFAULT_RETURN_TO)
      expect(resolvedOrigin('')).toBe(baseOrigin)
    })
  })
})
