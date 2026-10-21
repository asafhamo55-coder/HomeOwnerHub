import { describe, expect, it } from 'vitest'
import { EMPTY_RECORD } from './model'
import { BUDGET_ADOPTIONS_KEY, MAX_STORED_ADOPTIONS, isValidDay, readAdoption, signAdoption, withAdoption } from './store'

const ASSOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BUDGET = '11111111-1111-4111-8111-111111111111'
const MEETING = '22222222-2222-4222-8222-222222222222'
const SECRET = 'test-secret'
const stamp = { updatedAt: '2026-10-21T12:00:00.000Z', updatedBy: 'user-1' }
const record = { meetingId: MEETING, special: true, adoptedOn: '2026-11-18', ownerNoticeOn: null }

describe('budget adoption record storage', () => {
  it('round-trips a signed record', () => {
    const stored = signAdoption(ASSOC, BUDGET, record, stamp, SECRET)
    const settings = withAdoption({ other: 1 }, BUDGET, stored)
    expect(settings.other).toBe(1)
    expect(readAdoption(ASSOC, BUDGET, settings, SECRET)).toEqual({ state: 'saved', record, updatedAt: stamp.updatedAt })
  })

  it('nothing stored reads as none', () => {
    expect(readAdoption(ASSOC, BUDGET, {}, SECRET)).toEqual({ state: 'none', record: EMPTY_RECORD })
    expect(readAdoption(ASSOC, BUDGET, null, SECRET).state).toBe('none')
  })

  it('a record edited outside the board action reads as empty (unverified)', () => {
    const stored = signAdoption(ASSOC, BUDGET, record, stamp, SECRET)
    const tampered = withAdoption({}, BUDGET, { ...stored, adopted_on: '2026-01-01' })
    expect(readAdoption(ASSOC, BUDGET, tampered, SECRET)).toEqual({ state: 'unverified', record: EMPTY_RECORD })
  })

  it('a record is bound to its association and budget', () => {
    const stored = signAdoption(ASSOC, BUDGET, record, stamp, SECRET)
    const other = '33333333-3333-4333-8333-333333333333'
    const moved = { [BUDGET_ADOPTIONS_KEY]: { [other]: stored } }
    expect(readAdoption(ASSOC, other, moved, SECRET).state).toBe('unverified')
    expect(readAdoption(other, BUDGET, withAdoption({}, BUDGET, stored), SECRET).state).toBe('unverified')
  })

  it('no secret: unverified', () => {
    const stored = signAdoption(ASSOC, BUDGET, record, stamp, SECRET)
    expect(readAdoption(ASSOC, BUDGET, withAdoption({}, BUDGET, stored), null).state).toBe('unverified')
  })

  it('refuses bad ids and dates', () => {
    expect(() => signAdoption(ASSOC, BUDGET, { ...record, meetingId: 'nope' }, stamp, SECRET)).toThrow(RangeError)
    expect(() => signAdoption(ASSOC, BUDGET, { ...record, adoptedOn: '2026-02-30' }, stamp, SECRET)).toThrow(RangeError)
    expect(isValidDay('2028-02-29')).toBe(true)
    expect(isValidDay('2027-02-29')).toBe(false)
    expect(isValidDay('20261118')).toBe(false)
  })

  it('keeps at most MAX_STORED_ADOPTIONS records, oldest out, the one written always kept', () => {
    let settings: Record<string, unknown> = {}
    const ids = Array.from({ length: MAX_STORED_ADOPTIONS + 2 }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`)
    ids.forEach((id, i) => {
      settings = withAdoption(settings, id, signAdoption(ASSOC, id, EMPTY_RECORD, { ...stamp, updatedAt: `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00Z` }, SECRET))
    })
    const kept = Object.keys(settings[BUDGET_ADOPTIONS_KEY] as object)
    expect(kept).toHaveLength(MAX_STORED_ADOPTIONS)
    expect(kept).not.toContain(ids[0])
    expect(kept).toContain(ids[ids.length - 1])
  })
})
