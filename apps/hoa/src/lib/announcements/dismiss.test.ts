import { describe, expect, it } from 'vitest'
import { MAX_STORED_DISMISSALS, NUDGE_SETTINGS_KEY, readDismissedKeys, signDismissal, withDismissal } from './dismiss'

const ASSOC = 'assoc-1'
const SECRET = 'test-secret'
const stamp = { at: '2026-10-26T12:00:00.000Z', by: 'user-1' }

describe('signed nudge dismissals', () => {
  it('honours a verified dismissal', () => {
    const settings = withDismissal({}, signDismissal(ASSOC, 'halloween-party:2026', stamp, SECRET))
    expect([...readDismissedKeys(ASSOC, settings, SECRET)]).toEqual(['halloween-party:2026'])
  })

  it('ignores a forged, re-targeted or unreadable value (it can only show a nudge)', () => {
    const good = signDismissal(ASSOC, 'halloween-party:2026', stamp, SECRET)
    expect(readDismissedKeys(ASSOC, withDismissal({}, { ...good, sig: 'ab'.repeat(32) }), SECRET).size).toBe(0)
    expect(readDismissedKeys(ASSOC, withDismissal({}, { ...good, key: 'thanksgiving:2026' }), SECRET).size).toBe(0)
    expect(readDismissedKeys('assoc-2', withDismissal({}, good), SECRET).size).toBe(0)
    expect(readDismissedKeys(ASSOC, withDismissal({}, good), 'other-secret').size).toBe(0)
    expect(readDismissedKeys(ASSOC, withDismissal({}, good), null).size).toBe(0)
    expect(
      readDismissedKeys(
        ASSOC,
        { [NUDGE_SETTINGS_KEY]: { dismissed: [null, 7, { key: 1 }, { key: 'x', at: 'y', sig: 'zz', by: 4 }] } },
        SECRET,
      ).size,
    ).toBe(0)
    expect(readDismissedKeys(ASSOC, 'nope', SECRET).size).toBe(0)
    expect(
      readDismissedKeys(
        ASSOC,
        { [NUDGE_SETTINGS_KEY]: { dismissed: [{ key: 'halloween-party:2026', at: 'a', by: null, sig: 'not hex!' }] } },
        SECRET,
      ).size,
    ).toBe(0)
  })

  it('ignores a validly signed key that is not an occasion', () => {
    const settings = withDismissal({}, signDismissal(ASSOC, 'made-up:2026', stamp, SECRET))
    expect(readDismissedKeys(ASSOC, settings, SECRET).size).toBe(0)
  })

  it('keeps every other compliance_settings key when it writes', () => {
    const before = { pay_by_zelle: { sig: 's' }, resident_notifications: { on: true } }
    const after = withDismissal(before, signDismissal(ASSOC, 'halloween-party:2026', stamp, SECRET))
    expect(after.pay_by_zelle).toEqual(before.pay_by_zelle)
    expect(after.resident_notifications).toEqual(before.resident_notifications)
  })

  it('keeps earlier dismissals, replaces the same key once, and caps the list', () => {
    let s: Record<string, unknown> = {}
    s = withDismissal(s, signDismissal(ASSOC, 'halloween-party:2026', stamp, SECRET))
    s = withDismissal(s, signDismissal(ASSOC, 'thanksgiving:2026', stamp, SECRET))
    s = withDismissal(s, signDismissal(ASSOC, 'halloween-party:2026', { ...stamp, at: '2026-10-27T00:00:00.000Z' }, SECRET))
    expect((s[NUDGE_SETTINGS_KEY] as { dismissed: unknown[] }).dismissed).toHaveLength(2)
    expect(readDismissedKeys(ASSOC, s, SECRET).size).toBe(2)
    for (let y = 2000; y < 2000 + MAX_STORED_DISMISSALS + 5; y++) {
      s = withDismissal(s, signDismissal(ASSOC, `new-year:${y}`, stamp, SECRET))
    }
    expect((s[NUDGE_SETTINGS_KEY] as { dismissed: unknown[] }).dismissed).toHaveLength(MAX_STORED_DISMISSALS)
  })
})
