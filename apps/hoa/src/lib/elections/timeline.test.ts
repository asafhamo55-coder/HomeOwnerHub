import { describe, expect, it } from 'vitest'
import { ALL_ELECTION_CITATIONS, CA_CANDIDATE_LIST, FL_CHALLENGE, GA_MEMBER_NOTICE, TX_UNCONTESTED } from './law'
import { EMPTY_ELECTION, type Election } from './model'
import { addOneYear, electionTimeline, nextStep, type TimelineStep } from './timeline'
import { contestNote, ledgerRule, ledgerVerdict, tallyNote } from './guidance'

const MEETING = '2027-03-10'
const e = (over: Partial<Election> = {}): Election => ({ ...EMPTY_ELECTION, inspectors: [], candidates: [], ...over })
const byKey = (steps: TimelineStep[], key: string) => {
  const s = steps.find((x) => x.key === key)
  if (!s) throw new Error(`no step ${key}`)
  return s
}
const run = (jurisdiction: 'GA' | 'FL' | 'CA' | 'TX' | 'generic', election = e(), today = '2026-10-21', meetingType = 'annual') =>
  electionTimeline({ jurisdiction, meetingType, meetingDate: MEETING, election, today })

describe('every timeline quote is a checked quote', () => {
  it('GA, FL, CA, TX steps cite only ALL_ELECTION_CITATIONS', () => {
    const checked = new Set(ALL_ELECTION_CITATIONS)
    const full = e({ nominationDeadline: '2026-12-15', ballotsOutOn: '2027-01-20', resultsAnnouncedOn: MEETING, quorumReached: false, reconvenedOn: '2027-04-05' })
    for (const j of ['GA', 'FL', 'CA', 'TX', 'generic'] as const) {
      for (const s of run(j, full)) for (const c of s.citations) expect(checked.has(c)).toBe(true)
    }
  })
})

describe('Georgia (launch state)', () => {
  it('annual meeting notice 21 days before; special 7', () => {
    const notice = byKey(run('GA'), 'meeting_notice')
    expect(notice).toMatchObject({ date: '2027-02-17', when: 'by', state: 'upcoming' })
    expect(notice.citations).toEqual([GA_MEMBER_NOTICE])
    expect(byKey(run('GA', e(), '2026-10-21', 'special'), 'meeting_notice').date).toBe('2027-03-03')
  })

  it('no nomination, results or challenge rule is invented', () => {
    const steps = run('GA')
    expect(byKey(steps, 'nominations_close')).toMatchObject({ state: 'needs_input', citations: [] })
    expect(byKey(steps, 'results')).toMatchObject({ state: 'governing_docs', date: null, citations: [] })
    expect(byKey(steps, 'challenge')).toMatchObject({ state: 'governing_docs', date: null, citations: [] })
  })

  it('states: passed, due soon, upcoming', () => {
    expect(byKey(run('GA', e(), '2027-02-20'), 'meeting_notice').state).toBe('done_or_passed')
    expect(byKey(run('GA', e(), '2027-02-10'), 'meeting_notice').state).toBe('due_soon')
  })
})

describe('Florida', () => {
  it('nominations at the meeting by default; the ledger check on the last day to nominate', () => {
    const steps = run('FL')
    expect(byKey(steps, 'nominations_close')).toMatchObject({ date: MEETING })
    expect(byKey(steps, 'delinquency_check').date).toBe(MEETING)
    expect(byKey(run('FL', e({ nominationDeadline: '2027-02-01' })), 'delinquency_check').date).toBe('2027-02-01')
    expect(byKey(steps, 'meeting_notice').date).toBe('2027-02-24')
  })

  it('60-day challenge window from the announcement', () => {
    expect(byKey(run('FL'), 'challenge')).toMatchObject({ state: 'needs_input', citations: [FL_CHALLENGE] })
    expect(byKey(run('FL', e({ resultsAnnouncedOn: '2027-03-11' })), 'challenge')).toMatchObject({ date: '2027-05-10', when: 'by' })
  })
})

describe('California § 5115 timeline', () => {
  it('works back from the meeting: ballots 30 days before, notice 30 before that', () => {
    const steps = run('CA', e({ nominationDeadline: '2026-12-15' }))
    expect(byKey(steps, 'ballots_out')).toMatchObject({ date: '2027-02-08', when: 'by' })
    expect(byKey(steps, 'election_notice').date).toBe('2027-01-09')
    expect(byKey(steps, 'nomination_notice').date).toBe('2026-11-15')
    expect(byKey(steps, 'acclamation_initial')).toMatchObject({ date: '2026-09-16', optional: true, state: 'done_or_passed' })
    expect(byKey(steps, 'acclamation_reminder').date).toBe('2026-12-08')
    expect(byKey(steps, 'results_notice').date).toBe('2027-03-25')
    expect(byKey(steps, 'nominations_close').state).not.toBe('conflict')
  })

  it('flags nominations closing after the candidate list must go out', () => {
    const s = byKey(run('CA', e({ nominationDeadline: '2027-01-20' })), 'nominations_close')
    expect(s.state).toBe('conflict')
    expect(s.citations).toContain(CA_CANDIDATE_LIST)
  })

  it('flags ballots mailed less than 30 days before voting closes', () => {
    expect(byKey(run('CA', e({ ballotsOutOn: '2027-02-20' })), 'ballots_out').state).toBe('conflict')
    expect(byKey(run('CA', e({ ballotsOutOn: '2027-02-08' })), 'ballots_out').state).not.toBe('conflict')
  })

  it('no quorum: a reconvened meeting at least 20 days later, noticed 15 days ahead; results run from it', () => {
    const asked = run('CA', e({ quorumReached: false }))
    expect(byKey(asked, 'reconvened').state).toBe('needs_input')
    const set = run('CA', e({ quorumReached: false, reconvenedOn: '2027-04-05' }))
    expect(byKey(set, 'reconvene_notice').date).toBe('2027-03-21')
    expect(byKey(set, 'reconvened').state).not.toBe('conflict')
    expect(byKey(set, 'results_notice').date).toBe('2027-04-20')
    expect(byKey(run('CA', e({ quorumReached: false, reconvenedOn: '2027-03-20' })), 'reconvened').state).toBe('conflict')
  })

  it('one-year challenge period from the results notice', () => {
    expect(byKey(run('CA', e({ resultsAnnouncedOn: '2027-03-12' })), 'challenge').date).toBe('2028-03-12')
    expect(addOneYear('2028-02-29')).toBe('2029-02-28')
  })
})

describe('Texas and elsewhere', () => {
  it('TX: the notice rule is not loaded', () => {
    expect(byKey(run('TX'), 'meeting_notice')).toMatchObject({ state: 'governing_docs', citations: [] })
  })

  it('generic: only the meeting day is dated', () => {
    const steps = run('generic')
    expect(steps.filter((s) => s.date !== null).map((s) => s.key)).toEqual(['election'])
    expect(steps.every((s) => s.citations.length === 0)).toBe(true)
  })

  it('nextStep prefers a conflict, then the next dated step', () => {
    expect(nextStep(run('CA', e({ ballotsOutOn: '2027-02-20' })))!.state).toBe('conflict')
    expect(nextStep(run('GA'))!.key).toBe('meeting_notice')
  })
})

describe('guidance', () => {
  const contest = (state: 'contested' | 'uncontested' | 'short', onBallot: number, seats: number) => ({ state, onBallot, seats, openSeats: Math.max(seats - onBallot, 0) })

  it('FL: no contest means no election and seats without quorum', () => {
    expect(contestNote('FL', contest('uncontested', 2, 2)).text).toContain('no election is needed')
    expect(contestNote('FL', contest('short', 1, 3)).text).toContain('2 seats have no candidate')
  })

  it('CA: acclamation only with every § 5103 condition (a warning)', () => {
    expect(contestNote('CA', contest('uncontested', 2, 2))).toMatchObject({ tone: 'warn' })
  })

  it('TX uncontested: written ballots not required; GA: check the bylaws, nothing cited', () => {
    expect(contestNote('TX', contest('uncontested', 1, 1)).citations).toEqual([TX_UNCONTESTED])
    const ga = contestNote('GA', contest('uncontested', 1, 1))
    expect(ga.citations).toEqual([])
    expect(ga.text).toContain('Check your bylaws')
  })

  it('ledger verdicts: FL bars a delinquent candidate; GA and CA only inform', () => {
    const owes = { candidateId: 'x', state: 'past_due' as const, pastDueCents: 25_000, daysPastDue: 31 }
    expect(ledgerVerdict('FL', owes, '2027-02-01')).toMatchObject({ tone: 'warn', label: 'Delinquent' })
    expect(ledgerVerdict('FL', owes, '2027-02-01').text).toContain('$250.00')
    expect(ledgerVerdict('GA', owes, '2027-02-01')).toMatchObject({ tone: 'info' })
    expect(ledgerVerdict('CA', owes, '2027-02-01').text).toContain('never for fines')
    expect(ledgerVerdict('FL', { ...owes, state: 'clear', pastDueCents: 0 }, '2027-02-01').tone).toBe('ok')
    expect(ledgerRule('GA')).toBeNull()
    expect(ledgerRule('FL')!.tone).toBe('warn')
  })

  it('tally: a tie is never broken by the app', () => {
    const tie = { rows: [], complete: true, tieAtCutoff: true, totalVotes: 10 }
    expect(tallyNote('GA', tie).text).toContain('doesn’t pick a winner')
    expect(tallyNote('FL', { ...tie, tieAtCutoff: false }).citations.length).toBe(1)
  })
})
