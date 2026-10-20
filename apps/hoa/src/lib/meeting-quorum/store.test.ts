import { describe, expect, it } from 'vitest'
import { EMPTY_KIT, type QuorumKit } from './quorum'
import { MAX_STORED_KITS, QUORUM_KITS_KEY, readKit, signKit, storedKits, withKit } from './store'

// BL-122 storage: the kit is signed into associations.compliance_settings,
// keyed by meeting id; anything not signed by the board's save reads empty.

const SECRET = 'test-secret'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const M1 = 'b0000000-0000-4000-8000-000000000001'
const M2 = 'c0000000-0000-4000-8000-000000000002'
const H1 = 'd0000000-0000-4000-8000-000000000001'
const H2 = 'd0000000-0000-4000-8000-000000000002'
const STAMP = { updatedAt: '2026-10-20T15:00:00.000Z', updatedBy: 'user-1' }

const k: QuorumKit = {
  memberMeeting: false,
  quorumPct: 25,
  homes: {
    [H2]: { proxy: { kind: 'limited', at: '2026-10-19T12:00:00.000Z' }, presentAt: null },
    [H1]: { proxy: null, presentAt: '2026-10-20T15:00:00.000Z' },
  },
}

describe('signKit / readKit', () => {
  it('round-trips a signed kit', () => {
    const stored = signKit(ASSOC, M1, k, STAMP, SECRET)
    const settings = withKit({}, M1, stored)
    const read = readKit(ASSOC, M1, settings, SECRET)
    expect(read).toEqual({ state: 'saved', ...k, ...STAMP })
  })

  it('stores ids, kinds and times only — no names, emails or phones', () => {
    const stored = signKit(ASSOC, M1, k, STAMP, SECRET)
    expect(stored.homes).toEqual([
      [H1, null, null, '2026-10-20T15:00:00.000Z'],
      [H2, 'limited', '2026-10-19T12:00:00.000Z', null],
    ])
    expect(Object.keys(stored).sort()).toEqual(['homes', 'member_meeting', 'quorum_pct', 'sig', 'updated_at', 'updated_by', 'v'])
  })

  it('nothing saved reads as an empty kit', () => {
    expect(readKit(ASSOC, M1, { pay_by_zelle: {} }, SECRET)).toEqual({ state: 'none', ...EMPTY_KIT, homes: {} })
    expect(readKit(ASSOC, M1, null, SECRET).state).toBe('none')
  })

  it('a hand-edited kit (any member could PATCH it before 0063) reads as unverified and empty', () => {
    const stored = signKit(ASSOC, M1, k, STAMP, SECRET)
    const tampered = { ...stored, quorum_pct: 5 }
    const read = readKit(ASSOC, M1, withKit({}, M1, tampered), SECRET)
    expect(read).toEqual({ state: 'unverified', ...EMPTY_KIT, homes: {} })
    const extraHome = { ...stored, homes: [...stored.homes, [H1, null, null, STAMP.updatedAt]] }
    expect(readKit(ASSOC, M1, withKit({}, M1, extraHome as never), SECRET).state).toBe('unverified')
  })

  it('a kit copied to another meeting or association does not verify', () => {
    const settings = withKit({}, M1, signKit(ASSOC, M1, k, STAMP, SECRET))
    const moved = { [QUORUM_KITS_KEY]: { [M2]: storedKits(settings)[M1] } }
    expect(readKit(ASSOC, M2, moved, SECRET).state).toBe('unverified')
    expect(readKit('a0000000-0000-4000-8000-000000000009', M1, settings, SECRET).state).toBe('unverified')
  })

  it('no secret on the server: unverified', () => {
    const settings = withKit({}, M1, signKit(ASSOC, M1, k, STAMP, SECRET))
    expect(readKit(ASSOC, M1, settings, null).state).toBe('unverified')
    expect(readKit(ASSOC, M1, settings, 'other-secret').state).toBe('unverified')
  })

  it('refuses to sign bad input', () => {
    expect(() => signKit(ASSOC, M1, { ...k, quorumPct: 0 }, STAMP, SECRET)).toThrow(RangeError)
    expect(() => signKit(ASSOC, M1, { ...k, homes: { 'not-a-uuid': { proxy: null, presentAt: STAMP.updatedAt } } }, STAMP, SECRET)).toThrow(RangeError)
  })
})

describe('withKit', () => {
  it('keeps every other compliance_settings key and every other meeting’s kit', () => {
    const other = signKit(ASSOC, M2, k, STAMP, SECRET)
    const base = { arc_decision_clock: { days: 30 }, pay_by_zelle: { x: 1 }, [QUORUM_KITS_KEY]: { [M2]: other } }
    const out = withKit(base, M1, signKit(ASSOC, M1, k, STAMP, SECRET))
    expect(out.arc_decision_clock).toEqual({ days: 30 })
    expect(out.pay_by_zelle).toEqual({ x: 1 })
    expect(Object.keys(storedKits(out)).sort()).toEqual([M1, M2].sort())
  })

  it(`keeps at most ${MAX_STORED_KITS} kits, dropping the least recently updated (never the one being saved)`, () => {
    let settings: Record<string, unknown> = {}
    const ids: string[] = []
    for (let i = 0; i < MAX_STORED_KITS + 2; i++) {
      const mid = `e0000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      ids.push(mid)
      settings = withKit(settings, mid, signKit(ASSOC, mid, k, { ...STAMP, updatedAt: `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00.000Z` }, SECRET))
    }
    const kept = Object.keys(storedKits(settings))
    expect(kept).toHaveLength(MAX_STORED_KITS)
    expect(kept).not.toContain(ids[0])
    expect(kept).not.toContain(ids[1])
    // Re-saving the oldest kept one with an older stamp still keeps it.
    const oldest = ids[2]!
    settings = withKit(settings, oldest, signKit(ASSOC, oldest, k, { ...STAMP, updatedAt: '2026-01-01T00:00:00.000Z' }, SECRET))
    expect(Object.keys(storedKits(settings))).toContain(oldest)
  })
})
