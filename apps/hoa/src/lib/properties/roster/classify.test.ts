import { describe, expect, it } from 'vitest'
import { classifyRoster, homeKey, planCommit, chunkHomes, summarize } from './classify'
import type { RosterRow } from './rows'
import type { HomeMatch } from '../match-home'

// Synthetic rows only.
const r = (row: number, address: string, extra: Partial<RosterRow> = {}): RosterRow => ({
  row,
  address,
  unit: null,
  city: null,
  state: null,
  zip: null,
  ownerName: null,
  ownerEmail: null,
  ownerPhone: null,
  mailingAddress: null,
  tenure: null,
  balance: null,
  issue: null,
  ...extra,
})
const none: HomeMatch = { kind: 'none' }
const match = (propertyId: string): HomeMatch => ({ kind: 'match', propertyId })

describe('classifyRoster (the dry run)', () => {
  const rows = [
    r(2, '1 Test Way', { ownerEmail: 'one@example.test' }),
    r(3, '2 Test Way'),
    r(4, '', { issue: 'The address is missing.' }),
    r(5, '1 TEST WAY.', { ownerEmail: 'one@example.test' }), // same home, same owner
    r(6, '1 Test Way', { ownerEmail: 'co@example.test' }), // same home, another owner
    r(7, '10 Condo St'),
  ]
  const matches: HomeMatch[] = [none, match('p2'), none, none, none, { kind: 'ambiguous' }]

  it("'skip': new homes, existing ones skipped, in-file repeats skipped, co-owners kept, errors with reasons", () => {
    expect(classifyRoster(rows, matches, 'skip').map((c) => [c.row.row, c.status, c.reason ?? null, c.homeRow])).toEqual([
      [2, 'new', null, 2],
      [3, 'duplicate', 'Already on file.', 3],
      [4, 'error', 'The address is missing.', null],
      [5, 'duplicate', 'Same home and owner as row 2.', 2],
      [6, 'new', 'Adds another owner to the home in row 2.', 2],
      [7, 'error', expect.stringMatching(/unit number/), null],
    ])
  })

  it("'update': an existing home is updated instead", () => {
    const c = classifyRoster(rows, matches, 'update')
    expect(c[1]).toMatchObject({ status: 'update', propertyId: 'p2' })
  })

  it('two rows matching the same existing home are one home', () => {
    const c = classifyRoster([r(2, 'A St', { ownerEmail: 'a@example.test' }), r(3, 'A Street', { ownerEmail: 'a@example.test' })], [match('p1'), match('p1')], 'update')
    expect(c.map((x) => x.status)).toEqual(['update', 'duplicate'])
  })

  it('summarize counts each status', () => {
    expect(summarize(classifyRoster(rows, matches, 'skip'))).toEqual({ total: 6, new: 2, update: 0, duplicate: 2, error: 2 })
  })
})

describe('homeKey', () => {
  it('normalizes address and unit', () => {
    expect(homeKey('1 Test Street', 'Unit 2')).toBe(homeKey('1 test st.', '#2'))
    expect(homeKey('1 Test St', '1')).not.toBe(homeKey('1 Test St', '2'))
  })
})

describe('planCommit + chunkHomes', () => {
  const rows = [r(2, '1 Test Way', { ownerEmail: 'one@example.test' }), r(3, '2 Test Way'), r(4, '1 Test Way', { ownerEmail: 'co@example.test' }), r(5, '')]
  const classified = classifyRoster(rows.map((x, i) => (i === 3 ? { ...x, issue: 'The address is missing.' } : x)), [none, none, none, none], 'skip')

  it('groups each home with its extra owners and drops errors and duplicates', () => {
    expect(planCommit(classified).map((h) => h.rows.map((x) => x.row))).toEqual([[2, 4], [3]])
  })

  it('never sends the balance or the issue to the server (it is informational only)', () => {
    const [home] = planCommit(classifyRoster([r(2, '1 Test Way', { balance: 99 })], [none], 'skip'))
    expect(home.rows[0]).not.toHaveProperty('balance')
    expect(home.rows[0]).not.toHaveProperty('issue')
  })

  it('chunks by rows without splitting a home', () => {
    const homes = [{ rows: [r(2, 'a'), r(3, 'a')] }, { rows: [r(4, 'b')] }, { rows: [r(5, 'c'), r(6, 'c')] }, { rows: [r(7, 'd')] }]
    expect(chunkHomes(homes, 3).map((c) => c.map((h) => h.rows.length))).toEqual([[2, 1], [2, 1]])
    // A home bigger than the chunk size still goes, alone.
    expect(chunkHomes([{ rows: [r(2, 'a'), r(3, 'a'), r(4, 'a')] }], 2).map((c) => c.length)).toEqual([1])
  })
})
