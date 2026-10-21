import { describe, expect, it } from 'vitest'
import { EMPTY_ELECTION, type Election } from './model'
import { ELECTIONS_KEY, MAX_STORED_ELECTIONS, electionOf, readElection, signElection, storedElections, withElection } from './store'

const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const MEETING = 'b0000000-0000-4000-8000-000000000001'
const SECRET = 'test-secret'
const stamp = { updatedAt: '2026-10-21T12:00:00.000Z', updatedBy: 'user-1' }

const election: Election = {
  ...EMPTY_ELECTION,
  seats: 2,
  nominationDeadline: '2026-12-15',
  ballotsOutOn: null,
  inspectors: ['Jo Notary'],
  candidates: [
    { id: 'c0000000-0000-4000-8000-000000000001', name: 'Pat Lee', propertyId: 'd0000000-0000-4000-8000-000000000001', nominatedOn: '2026-11-02', onBallot: true, votes: 12 },
    { id: 'c0000000-0000-4000-8000-000000000002', name: 'Sam Ortiz', propertyId: null, nominatedOn: null, onBallot: false, votes: null },
  ],
  resultsAnnouncedOn: null,
}

describe('sign and read', () => {
  it('round-trips a board save', () => {
    const stored = signElection(ASSOC, MEETING, election, stamp, SECRET)
    const r = readElection(ASSOC, MEETING, { [ELECTIONS_KEY]: { [MEETING]: stored } }, SECRET)
    expect(r.state).toBe('saved')
    expect(electionOf(r)).toEqual(election)
  })

  it('stores names, ids, dates and counts only — no balance, email or reason', () => {
    const stored = signElection(ASSOC, MEETING, election, stamp, SECRET)
    const text = JSON.stringify(stored)
    expect(text).not.toMatch(/cents|email|phone|reason|delinquen/i)
  })

  it('a tampered, moved or unsigned election reads as empty and unverified', () => {
    const stored = signElection(ASSOC, MEETING, election, stamp, SECRET)
    const tampered = { ...stored, candidates: stored.candidates.map((c) => [...c.slice(0, 5), 999]) }
    expect(readElection(ASSOC, MEETING, { [ELECTIONS_KEY]: { [MEETING]: tampered } }, SECRET).state).toBe('unverified')
    const other = 'b0000000-0000-4000-8000-000000000002'
    expect(readElection(ASSOC, other, { [ELECTIONS_KEY]: { [other]: stored } }, SECRET).state).toBe('unverified')
    expect(readElection(ASSOC, MEETING, { [ELECTIONS_KEY]: { [MEETING]: stored } }, 'other-secret').state).toBe('unverified')
    expect(readElection(ASSOC, MEETING, { [ELECTIONS_KEY]: { [MEETING]: stored } }, null).state).toBe('unverified')
    expect(readElection(ASSOC, MEETING, { [ELECTIONS_KEY]: { [MEETING]: { v: 1, seats: 'lots' } } }, SECRET)).toMatchObject({ state: 'unverified', candidates: [] })
    expect(readElection(ASSOC, MEETING, null, SECRET).state).toBe('none')
  })

  it('refuses to sign what a read would reject', () => {
    expect(() => signElection(ASSOC, MEETING, { ...election, seats: 0 }, stamp, SECRET)).toThrow()
    expect(() => signElection(ASSOC, MEETING, { ...election, nominationDeadline: '2026-13-01' }, stamp, SECRET)).toThrow()
  })
})

describe('withElection', () => {
  it('keeps every other settings key, including the quorum kits', () => {
    const stored = signElection(ASSOC, MEETING, election, stamp, SECRET)
    const next = withElection({ arc_decision_clock: { days: 30 }, meeting_quorum_kits: { x: 1 } }, MEETING, stored)
    expect(next.arc_decision_clock).toEqual({ days: 30 })
    expect(next.meeting_quorum_kits).toEqual({ x: 1 })
    expect(storedElections(next)[MEETING]).toEqual(stored)
  })

  it(`keeps at most ${MAX_STORED_ELECTIONS}: the oldest-updated go first, this one always stays`, () => {
    let settings: Record<string, unknown> = {}
    for (let i = 0; i < MAX_STORED_ELECTIONS + 2; i++) {
      const m = `b0000000-0000-4000-8000-00000000000${i}`
      settings = withElection(settings, m, signElection(ASSOC, m, election, { ...stamp, updatedAt: `2026-10-2${i}T00:00:00.000Z` }, SECRET))
    }
    const kept = Object.keys(storedElections(settings))
    expect(kept).toHaveLength(MAX_STORED_ELECTIONS)
    expect(kept).toContain(`b0000000-0000-4000-8000-00000000000${MAX_STORED_ELECTIONS + 1}`)
    expect(kept).not.toContain('b0000000-0000-4000-8000-000000000000')
  })
})
