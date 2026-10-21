import { describe, expect, it } from 'vitest'
import {
  EMPTY_ELECTION,
  MAX_CANDIDATES,
  applyElectionChange,
  candidateChecks,
  cleanName,
  contestOf,
  isElectionChange,
  ledgerCheckDay,
  tallyOf,
  type Election,
  type ElectionChange,
} from './model'

const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const HOME = 'd0000000-0000-4000-8000-000000000001'
const MEETING = '2027-01-20'

function apply(e: Election, change: ElectionChange, n = 1): Election {
  const r = applyElectionChange(e, change, { meetingDate: MEETING, newId: id(n) })
  if (!r.ok) throw new Error(r.error)
  return r.election
}

function withCandidates(names: string[], seats: number | null = 2): Election {
  let e: Election = { ...EMPTY_ELECTION, seats }
  names.forEach((name, i) => (e = apply(e, { kind: 'add_candidate', name, propertyId: null, nominatedOn: null }, i + 1)))
  return e
}

describe('isElectionChange (untrusted client input)', () => {
  it('accepts the documented shapes', () => {
    expect(isElectionChange({ kind: 'setup', seats: 3, nominationDeadline: '2026-12-01', ballotsOutOn: null })).toBe(true)
    expect(isElectionChange({ kind: 'add_candidate', name: 'Pat Lee', propertyId: HOME, nominatedOn: '2026-11-02' })).toBe(true)
    expect(isElectionChange({ kind: 'results', votes: { [id(1)]: 12 }, announcedOn: MEETING })).toBe(true)
    expect(isElectionChange({ kind: 'quorum', reached: false, reconvenedOn: '2027-02-15' })).toBe(true)
    expect(isElectionChange({ kind: 'clear_results' })).toBe(true)
  })

  it('rejects bad dates, ids, seats, votes and kinds', () => {
    expect(isElectionChange({ kind: 'setup', seats: 0, nominationDeadline: null, ballotsOutOn: null })).toBe(false)
    expect(isElectionChange({ kind: 'setup', seats: 2, nominationDeadline: '2026-02-30', ballotsOutOn: null })).toBe(false)
    expect(isElectionChange({ kind: 'add_candidate', name: '  ', propertyId: null, nominatedOn: null })).toBe(false)
    expect(isElectionChange({ kind: 'add_candidate', name: 'x'.repeat(81), propertyId: null, nominatedOn: null })).toBe(false)
    expect(isElectionChange({ kind: 'add_candidate', name: 'Pat', propertyId: 'nope', nominatedOn: null })).toBe(false)
    expect(isElectionChange({ kind: 'results', votes: { [id(1)]: -1 }, announcedOn: null })).toBe(false)
    expect(isElectionChange({ kind: 'results', votes: { [id(1)]: 1.5 }, announcedOn: null })).toBe(false)
    expect(isElectionChange({ kind: 'inspectors', names: ['a', 'b', 'c', 'd'] })).toBe(false)
    expect(isElectionChange({ kind: 'drop_table' })).toBe(false)
    expect(isElectionChange(null)).toBe(false)
  })
})

describe('applyElectionChange', () => {
  it('setup: dates must be on or before the meeting', () => {
    const e = apply(EMPTY_ELECTION, { kind: 'setup', seats: 2, nominationDeadline: '2026-12-01', ballotsOutOn: '2026-12-15' })
    expect(e).toMatchObject({ seats: 2, nominationDeadline: '2026-12-01', ballotsOutOn: '2026-12-15' })
    const late = applyElectionChange(EMPTY_ELECTION, { kind: 'setup', seats: 2, nominationDeadline: '2027-01-21', ballotsOutOn: null }, { meetingDate: MEETING, newId: id(1) })
    expect(late).toMatchObject({ ok: false })
  })

  it('candidates: cleaned names, no duplicates, no inspector as candidate, a cap', () => {
    const ctx = { meetingDate: MEETING, newId: id(9) }
    const e = withCandidates(['  Pat   Lee ', 'Sam Ortiz'])
    expect(e.candidates.map((c) => c.name)).toEqual(['Pat Lee', 'Sam Ortiz'])
    expect(e.candidates[0]).toMatchObject({ id: id(1), onBallot: true, votes: null })
    expect(applyElectionChange(e, { kind: 'add_candidate', name: 'pat lee', propertyId: null, nominatedOn: null }, ctx)).toMatchObject({ ok: false })
    const withInspector = apply(e, { kind: 'inspectors', names: ['Jo Notary'] })
    expect(applyElectionChange(withInspector, { kind: 'add_candidate', name: 'Jo Notary', propertyId: null, nominatedOn: null }, ctx)).toMatchObject({ ok: false })
    expect(applyElectionChange(e, { kind: 'inspectors', names: ['Sam Ortiz'] }, ctx)).toMatchObject({ ok: false })
    const full = withCandidates(Array.from({ length: MAX_CANDIDATES }, (_, i) => `Person ${i}`))
    expect(applyElectionChange(full, { kind: 'add_candidate', name: 'One more', propertyId: null, nominatedOn: null }, ctx)).toMatchObject({ ok: false })
  })

  it('a candidate with votes cannot be removed until results are cleared; off the ballot shrinks the contest', () => {
    let e = withCandidates(['A', 'B', 'C'])
    e = apply(e, { kind: 'results', votes: { [id(1)]: 5, [id(2)]: 3, [id(3)]: 1 }, announcedOn: MEETING })
    expect(applyElectionChange(e, { kind: 'remove_candidate', candidateId: id(3) }, { meetingDate: MEETING, newId: id(9) })).toMatchObject({ ok: false })
    e = apply(e, { kind: 'clear_results' })
    expect(e.resultsAnnouncedOn).toBeNull()
    e = apply(e, { kind: 'remove_candidate', candidateId: id(3) })
    expect(e.candidates).toHaveLength(2)
    e = apply(e, { kind: 'candidate_on_ballot', candidateId: id(2), onBallot: false })
    expect(contestOf(e).onBallot).toBe(1)
  })

  it('results: every on-ballot candidate, only them, not announced before the meeting', () => {
    const e = withCandidates(['A', 'B'])
    const ctx = { meetingDate: MEETING, newId: id(9) }
    expect(applyElectionChange(e, { kind: 'results', votes: { [id(1)]: 5 }, announcedOn: null }, ctx)).toMatchObject({ ok: false })
    expect(applyElectionChange(e, { kind: 'results', votes: { [id(1)]: 5, [id(2)]: 1, [id(7)]: 2 }, announcedOn: null }, ctx)).toMatchObject({ ok: false })
    expect(applyElectionChange(e, { kind: 'results', votes: { [id(1)]: 5, [id(2)]: 1 }, announcedOn: '2027-01-19' }, ctx)).toMatchObject({ ok: false })
  })

  it('quorum: a reconvened date only when quorum failed, and after the meeting', () => {
    const ctx = { meetingDate: MEETING, newId: id(9) }
    expect(applyElectionChange(EMPTY_ELECTION, { kind: 'quorum', reached: true, reconvenedOn: '2027-02-15' }, ctx)).toMatchObject({ ok: false })
    expect(applyElectionChange(EMPTY_ELECTION, { kind: 'quorum', reached: false, reconvenedOn: MEETING }, ctx)).toMatchObject({ ok: false })
    expect(apply(EMPTY_ELECTION, { kind: 'quorum', reached: false, reconvenedOn: '2027-02-15' })).toMatchObject({ quorumReached: false, reconvenedOn: '2027-02-15' })
  })

  it('never mutates its input', () => {
    const e = withCandidates(['A'])
    const before = JSON.stringify(e)
    apply(e, { kind: 'candidate_on_ballot', candidateId: id(1), onBallot: false })
    expect(JSON.stringify(e)).toBe(before)
  })
})

describe('contestOf', () => {
  it('needs seats, contested, uncontested, short', () => {
    expect(contestOf(withCandidates(['A'], null)).state).toBe('needs_seats')
    expect(contestOf(withCandidates(['A', 'B', 'C'], 2)).state).toBe('contested')
    expect(contestOf(withCandidates(['A', 'B'], 2)).state).toBe('uncontested')
    expect(contestOf(withCandidates(['A'], 3))).toMatchObject({ state: 'short', openSeats: 2 })
  })
})

describe('tallyOf (plurality, ties flagged never broken)', () => {
  it('ranks by votes and marks the seats', () => {
    let e = withCandidates(['A', 'B', 'C'], 2)
    e = apply(e, { kind: 'results', votes: { [id(1)]: 4, [id(2)]: 9, [id(3)]: 6 }, announcedOn: null })
    const t = tallyOf(e)
    expect(t.complete).toBe(true)
    expect(t.rows.map((r) => [r.candidate.name, r.outcome])).toEqual([
      ['B', 'elected'],
      ['C', 'elected'],
      ['A', 'not_elected'],
    ])
    expect(t.totalVotes).toBe(19)
    expect(t.tieAtCutoff).toBe(false)
  })

  it('a tie across the last seat flags every tied candidate', () => {
    let e = withCandidates(['A', 'B', 'C'], 2)
    e = apply(e, { kind: 'results', votes: { [id(1)]: 10, [id(2)]: 5, [id(3)]: 5 }, announcedOn: null })
    const t = tallyOf(e)
    expect(t.tieAtCutoff).toBe(true)
    expect(t.rows.map((r) => r.outcome)).toEqual(['elected', 'tied', 'tied'])
    expect(t.rows.map((r) => r.rank)).toEqual([1, 2, 2])
  })

  it('incomplete before the count', () => {
    expect(tallyOf(withCandidates(['A', 'B'])).complete).toBe(false)
  })
})

describe('ledger check', () => {
  it('maps each candidate to the home’s facts on the check day', () => {
    let e = withCandidates([], 2)
    e = apply(e, { kind: 'add_candidate', name: 'Owes', propertyId: HOME, nominatedOn: null }, 1)
    e = apply(e, { kind: 'add_candidate', name: 'No home', propertyId: null, nominatedOn: null }, 2)
    e = apply(e, { kind: 'add_candidate', name: 'Gone', propertyId: 'd0000000-0000-4000-8000-000000000002', nominatedOn: null }, 3)
    const checks = candidateChecks(e.candidates, new Map([[HOME, { pastDueCents: 12_500, daysPastDue: 40 }]]))
    expect(checks.map((c) => c.state)).toEqual(['past_due', 'no_home', 'unknown'])
    expect(candidateChecks(e.candidates.slice(0, 1), new Map([[HOME, { pastDueCents: 0, daysPastDue: 0 }]]))[0]!.state).toBe('clear')
  })

  it('checks on the nomination deadline (or the meeting day), never after today', () => {
    expect(ledgerCheckDay({ nominationDeadline: '2026-12-01' }, MEETING, '2026-12-10')).toEqual({ day: '2026-12-01', provisional: false })
    expect(ledgerCheckDay({ nominationDeadline: '2026-12-01' }, MEETING, '2026-11-10')).toEqual({ day: '2026-11-10', provisional: true })
    expect(ledgerCheckDay({ nominationDeadline: null }, MEETING, '2027-02-01')).toEqual({ day: MEETING, provisional: false })
  })
})

describe('cleanName', () => {
  it('strips control characters and collapses spaces', () => {
    expect(cleanName('Pat\u0000 \n Lee')).toBe('Pat Lee')
    expect(cleanName(42)).toBeNull()
  })
})
