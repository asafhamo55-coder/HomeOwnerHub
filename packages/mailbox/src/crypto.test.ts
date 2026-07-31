import { beforeEach, describe, expect, it } from 'vitest'
import { currentKeyVersion, decryptToken, encryptToken } from './crypto'

// 32 bytes, base64 — the format MAILBOX_TOKEN_KEY must use.
const KEY_A = Buffer.alloc(32, 1).toString('base64')
const KEY_B = Buffer.alloc(32, 2).toString('base64')

describe('token crypto', () => {
  beforeEach(() => {
    process.env.MAILBOX_TOKEN_KEY = KEY_A
    process.env.MAILBOX_TOKEN_KEY_VERSION = '1'
    delete process.env.MAILBOX_TOKEN_KEY_V1
    delete process.env.MAILBOX_TOKEN_KEY_V2
  })

  it('round-trips a token', () => {
    const secret = '1//0gRefreshTokenExample_with-symbols.and~stuff'
    expect(decryptToken(encryptToken(secret))).toBe(secret)
  })

  it('produces a versioned, non-plaintext envelope', () => {
    const out = encryptToken('hello')
    expect(out.startsWith('v1:')).toBe(true)
    expect(out).not.toContain('hello')
    expect(out.split(':')).toHaveLength(4)
  })

  it('is non-deterministic — a fresh IV each call', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    const [v, iv, tag, ct] = encryptToken('sensitive').split(':')
    const flipped = Buffer.from(ct, 'base64')
    flipped[0] ^= 0xff
    expect(() =>
      decryptToken(`${v}:${iv}:${tag}:${flipped.toString('base64')}`),
    ).toThrow()
  })

  it('decrypts an older key version after rotation', () => {
    const old = encryptToken('rotate-me')          // sealed under v1
    process.env.MAILBOX_TOKEN_KEY_V1 = KEY_A       // v1 retained
    process.env.MAILBOX_TOKEN_KEY = KEY_B          // v2 is now current
    process.env.MAILBOX_TOKEN_KEY_VERSION = '2'

    expect(currentKeyVersion()).toBe(2)
    expect(decryptToken(old)).toBe('rotate-me')      // old envelope still opens
    expect(encryptToken('new').startsWith('v2:')).toBe(true)
  })

  it('throws a clear error when the key is missing', () => {
    delete process.env.MAILBOX_TOKEN_KEY
    expect(() => encryptToken('x')).toThrow(/MAILBOX_TOKEN_KEY/)
  })

  it('throws when the key is not 32 bytes', () => {
    process.env.MAILBOX_TOKEN_KEY = Buffer.alloc(16, 9).toString('base64')
    expect(() => encryptToken('x')).toThrow(/32 bytes/)
  })

  describe('currentKeyVersion validation', () => {
    beforeEach(() => {
      process.env.MAILBOX_TOKEN_KEY = KEY_A
      process.env.MAILBOX_TOKEN_KEY_VERSION = '1'
      delete process.env.MAILBOX_TOKEN_KEY_V1
      delete process.env.MAILBOX_TOKEN_KEY_V2
    })

    it('returns 1 when MAILBOX_TOKEN_KEY_VERSION is unset', () => {
      delete process.env.MAILBOX_TOKEN_KEY_VERSION
      expect(currentKeyVersion()).toBe(1)
    })

    it('returns 1 when MAILBOX_TOKEN_KEY_VERSION is empty string', () => {
      process.env.MAILBOX_TOKEN_KEY_VERSION = ''
      expect(currentKeyVersion()).toBe(1)
    })

    it('returns the parsed version for a valid numeric string', () => {
      process.env.MAILBOX_TOKEN_KEY_VERSION = '2'
      expect(currentKeyVersion()).toBe(2)
    })

    it('trims whitespace and returns parsed version', () => {
      process.env.MAILBOX_TOKEN_KEY_VERSION = '  3  '
      expect(currentKeyVersion()).toBe(3)
    })

    it('throws a clear error when version has "v" prefix like "v2"', () => {
      process.env.MAILBOX_TOKEN_KEY_VERSION = 'v2'
      expect(() => currentKeyVersion()).toThrow(/MAILBOX_TOKEN_KEY_VERSION.*must be.*positive integer/)
    })

    it('throws a clear error when version is 0', () => {
      process.env.MAILBOX_TOKEN_KEY_VERSION = '0'
      expect(() => currentKeyVersion()).toThrow()
    })

    it('throws a clear error when version is negative', () => {
      process.env.MAILBOX_TOKEN_KEY_VERSION = '-1'
      expect(() => currentKeyVersion()).toThrow()
    })

    it('throws a clear error for non-numeric string like "abc"', () => {
      process.env.MAILBOX_TOKEN_KEY_VERSION = 'abc'
      expect(() => currentKeyVersion()).toThrow(/MAILBOX_TOKEN_KEY_VERSION.*must be.*positive integer/)
    })

    it('throws a clear error for decimal version like "2.5"', () => {
      process.env.MAILBOX_TOKEN_KEY_VERSION = '2.5'
      expect(() => currentKeyVersion()).toThrow(/MAILBOX_TOKEN_KEY_VERSION.*must be.*positive integer/)
    })
  })
})
