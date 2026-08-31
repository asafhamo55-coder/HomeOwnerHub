import { describe, it, expect } from 'vitest'
import {
  applicationServerKey,
  isValidVapidPublicKey,
  urlBase64ToUint8Array,
} from './push-key'

// The real production key. It is a PUBLIC key — the whole point is that
// browsers see it — so committing it here (and in .env.example) is safe,
// and pinning the real one is what catches a bad decode of the exact
// string the app ships with.
const VAPID_PUBLIC =
  'BBxQzCh2cgeCfaUS7UCgsGBETkhJI-idy9bo7MyJk6Pb_4wp08jRZZtcRSeUtwq_X0cKSzoGqRnjYb5X1bLV7wk'

describe('urlBase64ToUint8Array', () => {
  it('decodes the production VAPID key to a 65-byte uncompressed P-256 point', () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(0x04)
  })

  it('translates the base64url alphabet — "-" to "+" and "_" to "/"', () => {
    // 'a-_w' as base64url is 'a+/w' as base64 → 0x6b 0xef 0xf0. Without
    // the alphabet swap atob() rejects '-' and '_' outright.
    expect(Array.from(urlBase64ToUint8Array('a-_w'))).toEqual([0x6b, 0xef, 0xf0])
  })

  it('re-adds the stripped padding for lengths that need it', () => {
    // 'AAA' (3 chars) needs one '='; 'AA' needs two. Both decode without
    // throwing only if the padding maths is right.
    expect(Array.from(urlBase64ToUint8Array('AAA'))).toEqual([0, 0])
    expect(Array.from(urlBase64ToUint8Array('AA'))).toEqual([0])
  })

  it('does not over-pad an already-aligned length', () => {
    // 4 chars is already a whole base64 group; adding four '=' here would
    // throw. This is the case the inner `% 4` exists for.
    expect(Array.from(urlBase64ToUint8Array('AAAA'))).toEqual([0, 0, 0])
  })

  it('round-trips every byte value, including the high half', () => {
    const original = Uint8Array.from({ length: 256 }, (_, i) => i)
    const b64url = Buffer.from(original)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(Array.from(urlBase64ToUint8Array(b64url))).toEqual(Array.from(original))
  })

  it('throws on input that is not decodable at all', () => {
    expect(() => urlBase64ToUint8Array('!!!!')).toThrow()
  })
})

describe('isValidVapidPublicKey', () => {
  it('accepts a 65-byte 0x04-prefixed point', () => {
    expect(isValidVapidPublicKey(urlBase64ToUint8Array(VAPID_PUBLIC))).toBe(true)
  })

  it('rejects a 32-byte key — the shape of a PRIVATE key pasted by mistake', () => {
    expect(isValidVapidPublicKey(new Uint8Array(32))).toBe(false)
  })

  it('rejects 65 bytes without the uncompressed-point prefix', () => {
    const wrongPrefix = new Uint8Array(65)
    wrongPrefix[0] = 0x02
    expect(isValidVapidPublicKey(wrongPrefix)).toBe(false)
  })
})

describe('applicationServerKey', () => {
  it('returns bytes for the production key', () => {
    expect(applicationServerKey(VAPID_PUBLIC)?.length).toBe(65)
  })

  it('tolerates surrounding whitespace, which env files collect', () => {
    expect(applicationServerKey(`  ${VAPID_PUBLIC}\n`)?.length).toBe(65)
  })

  it('returns null when the env var is unset — the pre-VAPID ship state', () => {
    expect(applicationServerKey(undefined)).toBeNull()
    expect(applicationServerKey(null)).toBeNull()
    expect(applicationServerKey('')).toBeNull()
  })

  it('returns null for the .env.example placeholder rather than decoding it', () => {
    expect(applicationServerKey('REPLACE_ME')).toBeNull()
  })

  it('returns null — never throws — for a truncated or malformed key', () => {
    expect(applicationServerKey(VAPID_PUBLIC.slice(0, 40))).toBeNull()
    expect(applicationServerKey('!!!!')).toBeNull()
  })
})
