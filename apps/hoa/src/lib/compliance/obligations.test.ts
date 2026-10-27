import { describe, expect, it } from 'vitest'
import { signComplianceAck, withComplianceAck, type ComplianceAssociationInput } from './deadlines'
import { directorCertRows } from './director-certs'
import { EMPTY_ELECTION, type Election } from '../elections/model'
import { signElection, withElection } from '../elections/store'
import { ALL_COMPLIANCE_QUOTES } from './law'
import {
  GA_SOS_URL,
  buildComplianceOverview as realBuildComplianceOverview,
  complianceSummary,
  nextGaRenewal,
  type ComplianceInput,
  type ComplianceObligation,
  type DoneWithEvidence,
} from './obligations'


// BL-167 added federal rows to every association; this file covers the state rows, so strip them
// here. The federal rows are tested in federal.test.ts.
const buildComplianceOverview: typeof realBuildComplianceOverview = (input) => {
  const o = realBuildComplianceOverview(input)
  const groups = o.groups.map((g) => ({ ...g, obligations: g.obligations.filter((x) => !x.key.includes(':federal-')) }))
  return { groups, overdue: groups.flatMap((g) => g.obligations.filter((x) => x.tone === 'overdue')) }
}

// BL-145. Today is 2026-10-21 unless a case says otherwise. Fictional ids only.

const SECRET = 'test-secret'
const GA = '11111111-1111-4111-8111-111111111111'
const TX = '22222222-2222-4222-8222-222222222222'
const FL = '33333333-3333-4333-8333-333333333333'
const CA = '44444444-4444-4444-8444-444444444444'
const OH = '55555555-5555-4555-8555-555555555555'
const DOC = '66666666-6666-4666-8666-666666666666'

function assoc(id: string, state: string | null, name = `HOA ${id.slice(0, 4)}`): ComplianceAssociationInput {
  return { id, name, state, governingLawState: null, complianceSettings: {} }
}

function input(over: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    today: '2026-10-21',
    associations: [assoc(GA, 'GA')],
    secret: SECRET,
    done: new Map(),
    documentNames: new Map(),
    annualMeetings: { lastHeld: null, next: null, nextNoticeSentOn: null },
    directorCerts: { kind: 'not_applicable' },
    caBudgets: new Map(),
    electionMeetings: new Map(),
    ...over,
  }
}

const done = (assocId: string, code: string, documentId: string | null = null, doneAt = '2026-10-02T15:00:00Z'): DoneWithEvidence =>
  new Map([[assocId, new Map([[code, { doneAt, documentId }]])]])

function find(o: ReturnType<typeof buildComplianceOverview>, keySuffix: string): ComplianceObligation {
  const hit = o.groups.flatMap((g) => g.obligations).find((x) => x.key.endsWith(keySuffix))
  if (!hit) throw new Error(`no obligation ${keySuffix}`)
  return hit
}

describe('Georgia comes first and gets the fullest list', () => {
  it('orders Georgia associations before every other state, then by name', () => {
    const o = buildComplianceOverview(
      input({ associations: [assoc(TX, 'TX', 'Alamo'), assoc(OH, 'OH', 'Buckeye'), assoc(GA, 'Georgia', 'Zelkova'), assoc(FL, 'FL', 'Sunny')] }),
    )
    expect(o.groups.map((g) => g.state)).toEqual(['GA', 'FL', 'TX', null])
  })

  it('a Georgia association: registration, upkeep, annual meeting, records, statement, condo note, elections — in that order', () => {
    const o = buildComplianceOverview(input())
    expect(o.groups[0]!.obligations.map((x) => x.key.split(':')[1])).toEqual([
      'ga-sos-registration-2027',
      'ga-registration-upkeep',
      'ga-annual-meeting',
      'ga-records',
      'ga-statement-of-amounts-due',
      'ga-corp-annual-registration-2027',
      'ga-condominium',
      'director-elections',
    ])
  })

  it('BL-152: the corporation’s annual registration — markable per year, Jan 1 – Apr 1, then the dissolution risk', () => {
    const at = (today: string, over: Partial<ComplianceInput> = {}) => buildComplianceOverview(input({ today, ...over }))
    const before = find(at('2026-10-21'), 'ga-corp-annual-registration-2027')
    expect(before).toMatchObject({
      kind: 'deadline',
      deadlineCode: 'ga-corp-annual-registration-2027',
      tone: 'upcoming',
      dueOn: '2027-04-01',
      label: 'Filing opens Jan 1, 2027 · due Apr 1, 2027',
      link: null,
    })
    expect(before.official?.href).toBe('https://sos.ga.gov/how-to-guide/how-file-annual-registration')
    expect(before.quotes.map((q) => q.cite)).toEqual([
      'O.C.G.A. § 14-3-1622(a)',
      'O.C.G.A. § 14-3-1622(c)',
      'O.C.G.A. § 14-3-1622(c)',
      'O.C.G.A. § 14-3-1622(d)',
      'O.C.G.A. § 14-3-1420',
      'O.C.G.A. § 14-3-1420(2)',
    ])
    expect(before.quotes.every((q) => q.fixture === 'ga-ocga-14-3-2026.txt')).toBe(true)
    expect(before.appliesTo).toContain('nonprofit corporations')
    expect(find(at('2027-03-15'), 'ga-corp-annual-registration-2027').tone).toBe('soon')
    expect(find(at('2027-04-01'), 'ga-corp-annual-registration-2027').tone).toBe('soon')
    const late = at('2027-06-01')
    const r = find(late, 'ga-corp-annual-registration-2027')
    expect(r.tone).toBe('overdue')
    expect(r.label).toContain('administrative dissolution')
    expect(late.overdue.map((x) => x.key)).toContain(r.key)
    // Done for 2027 (a row, with evidence): done all year; 2028 is its own code.
    const doneIn = at('2027-06-01', { done: done(GA, 'ga-corp-annual-registration-2027', DOC) })
    expect(find(doneIn, 'ga-corp-annual-registration-2027').tone).toBe('done')
    const next = at('2028-01-05', { done: done(GA, 'ga-corp-annual-registration-2027', DOC) })
    expect(find(next, 'ga-corp-annual-registration-2028')).toMatchObject({ tone: 'upcoming', label: 'Due Apr 1, 2028 (in 87 days)' })
  })

  it('the registration is markable, dated Jan 1, 2027, and upcoming before then', () => {
    const r = find(buildComplianceOverview(input()), 'ga-sos-registration-2027')
    expect(r).toMatchObject({ kind: 'deadline', deadlineCode: 'ga-sos-registration-2027', tone: 'upcoming', dueOn: '2027-01-01', done: null })
    expect(r.label).toBe('Takes effect in 72 days (Jan 1, 2027)')
    expect(r.official?.href).toContain('sos.ga.gov')
  })

  it('within 30 days it turns amber; once in effect and not done it is overdue and in the banner', () => {
    expect(find(buildComplianceOverview(input({ today: '2026-12-15' })), 'ga-sos-registration-2027').tone).toBe('soon')
    const o = buildComplianceOverview(input({ today: '2027-01-02' }))
    const r = find(o, 'ga-sos-registration-2027')
    expect(r.tone).toBe('overdue')
    expect(r.label).toBe('In effect since Jan 1, 2027')
    expect(o.overdue.map((x) => x.key)).toContain(r.key)
  })

  it('done by a row: "Done <day>", with the evidence document and its name', () => {
    const o = buildComplianceOverview(
      input({ today: '2027-02-01', done: done(GA, 'ga-sos-registration-2027', DOC), documentNames: new Map([[DOC, 'SoS filing receipt']]) }),
    )
    const r = find(o, 'ga-sos-registration-2027')
    expect(r.tone).toBe('done')
    expect(r.label).toBe('Done Oct 2, 2026')
    expect(r.done).toEqual({ doneAt: '2026-10-02T15:00:00Z', evidence: { documentId: DOC, name: 'SoS filing receipt' } })
    expect(o.overdue).toEqual([])
  })

  it('an evidence document whose name did not load still links', () => {
    const r = find(buildComplianceOverview(input({ done: done(GA, 'ga-sos-registration-2027', DOC) })), 'ga-sos-registration-2027')
    expect(r.done?.evidence).toEqual({ documentId: DOC, name: 'Attached document' })
  })

  it('done by a verified legacy acknowledgment counts too (no evidence); a forged one does not', () => {
    const signed = withComplianceAck(
      {},
      'ga-sos-registration-2027',
      signComplianceAck(GA, 'ga-sos-registration-2027', { doneAt: '2026-10-01T12:00:00Z', doneBy: null }, SECRET),
    )
    const ok = find(buildComplianceOverview(input({ associations: [{ ...assoc(GA, 'GA'), complianceSettings: signed }], done: null })), 'ga-sos-registration-2027')
    expect(ok.done).toEqual({ doneAt: '2026-10-01T12:00:00Z', evidence: null })
    const forged = find(
      buildComplianceOverview(input({ associations: [{ ...assoc(GA, 'GA'), complianceSettings: signed }], secret: 'other-secret' })),
      'ga-sos-registration-2027',
    )
    expect(forged.done).toBeNull()
  })

  it('another association’s row does not mark this one done', () => {
    const r = find(buildComplianceOverview(input({ done: done(TX, 'ga-sos-registration-2027') })), 'ga-sos-registration-2027')
    expect(r.done).toBeNull()
  })

  it('upkeep: first renewal Dec 31, 2027 before the law starts; then each Dec 31, amber in December', () => {
    expect(nextGaRenewal('2026-10-21')).toBe('2027-12-31')
    expect(nextGaRenewal('2028-03-01')).toBe('2028-12-31')
    expect(find(buildComplianceOverview(input()), 'ga-registration-upkeep')).toMatchObject({ tone: 'standing', label: 'First renewal due Dec 31, 2027' })
    expect(find(buildComplianceOverview(input({ today: '2027-12-10' })), 'ga-registration-upkeep')).toMatchObject({
      tone: 'soon',
      label: 'Renewal due Dec 31, 2027 (in 21 days)',
    })
  })
})

describe('Georgia annual meeting (§ 44-3-230(a))', () => {
  const meeting = (m: ComplianceInput['annualMeetings']) => find(buildComplianceOverview(input({ annualMeetings: m })), 'ga-annual-meeting')

  it('none recorded: unknown, with a link to schedule one', () => {
    expect(meeting({ lastHeld: null, next: null, nextNoticeSentOn: null })).toMatchObject({
      tone: 'unknown',
      label: 'No annual meeting recorded in HomeownerHub',
      link: { href: '/meetings/schedule' },
    })
  })

  it('held within the year: upcoming; amber within 60 days of the anniversary; overdue past it', () => {
    expect(meeting({ lastHeld: '2026-03-03', next: null, nextNoticeSentOn: null })).toMatchObject({
      tone: 'upcoming',
      label: 'Last held Mar 3, 2026 · a year on is Mar 3, 2027',
      dueOn: '2027-03-03',
    })
    expect(meeting({ lastHeld: '2025-12-01', next: null, nextNoticeSentOn: null }).tone).toBe('soon')
    expect(meeting({ lastHeld: '2025-03-03', next: null, nextNoticeSentOn: null })).toMatchObject({
      tone: 'overdue',
      label: 'No annual meeting since Mar 3, 2025',
    })
  })

  it('scheduled: the notice is due 21 days before; amber within 14 days of that; overdue once past and not sent', () => {
    const next = { id: 'mtg-1', date: '2026-12-15' }
    expect(meeting({ lastHeld: null, next, nextNoticeSentOn: null })).toMatchObject({
      tone: 'upcoming',
      dueOn: '2026-11-24',
      label: 'Send the notice by Nov 24, 2026 for the Dec 15, 2026 annual meeting',
      link: { href: '/meetings/mtg-1' },
    })
    expect(meeting({ lastHeld: null, next: { id: 'mtg-1', date: '2026-11-20' }, nextNoticeSentOn: null }).tone).toBe('soon')
    expect(meeting({ lastHeld: null, next: { id: 'mtg-1', date: '2026-11-05' }, nextNoticeSentOn: null })).toMatchObject({
      tone: 'overdue',
      label: 'Notice was due Oct 15, 2026 for the Nov 5, 2026 annual meeting',
    })
  })

  it('notice sent in time: upcoming; sent late: amber and says so; unreadable: says it couldn’t check', () => {
    const next = { id: 'mtg-1', date: '2026-12-15' }
    expect(meeting({ lastHeld: null, next, nextNoticeSentOn: '2026-11-01' })).toMatchObject({
      tone: 'upcoming',
      label: 'Annual meeting Dec 15, 2026 · notice sent Nov 1, 2026',
    })
    expect(meeting({ lastHeld: null, next, nextNoticeSentOn: '2026-12-01' })).toMatchObject({
      tone: 'soon',
      label: 'Annual meeting Dec 15, 2026 · notice sent Dec 1, 2026, after Nov 24, 2026',
    })
    expect(meeting({ lastHeld: null, next, nextNoticeSentOn: 'failed' }).label).toContain('couldn’t check whether it went out')
  })

  it('a failed meetings read says so; it never reads as fine', () => {
    expect(meeting(null)).toMatchObject({ tone: 'failed', label: 'Couldn’t load your meetings' })
  })

  it('carries the scope caveat: only property submitted to the Act', () => {
    const m = meeting({ lastHeld: null, next: null, nextNoticeSentOn: null })
    expect(m.appliesTo).toContain('submitted to the Georgia Property Owners’ Association Act')
    expect(m.quotes.map((q) => q.cite)).toContain('O.C.G.A. § 44-3-235(a)')
  })
})

describe('other states', () => {
  it('Texas: the management certificate is markable and standing until done, plus the elections row', () => {
    const o = buildComplianceOverview(input({ associations: [assoc(TX, 'TX')] }))
    const t = find(o, 'tx-management-certificate')
    expect(t).toMatchObject({ tone: 'unknown', label: 'Not marked as filed yet', deadlineCode: 'tx-management-certificate', dueOn: null })
    expect(o.groups[0]!.obligations.map((x) => x.kind)).toEqual(['deadline', 'election'])
  })

  it('Florida: the director tracker summarised on its association only', () => {
    const rows = directorCertRows(
      [
        { userId: 'u1', name: null },
        { userId: 'u2', name: null },
      ],
      new Map([['u1', { electedOn: '2026-05-01', certifiedOn: null, documentUrl: null, updatedAt: '2026-05-02T00:00:00Z', updatedBy: null }]]),
      '2026-10-21',
    )
    const o = buildComplianceOverview(
      input({ associations: [assoc(FL, 'FL'), assoc(OH, 'FL', 'Second FL')], directorCerts: { kind: 'ok', associationId: FL, rows } }),
    )
    expect(find(o, `${FL}:fl-director-certificates`)).toMatchObject({ tone: 'overdue', label: '1 director overdue or expired' })
    expect(o.groups.find((g) => g.associationId === OH)!.obligations.map((x) => x.kind)).toEqual(['election'])
    const failed = buildComplianceOverview(input({ associations: [assoc(FL, 'FL')], directorCerts: { kind: 'failed' } }))
    expect(find(failed, 'fl-director-certificates').tone).toBe('failed')
  })

  it('California: the § 5300(a) window from the budget checklist', () => {
    const at = (today: string, sent = false) =>
      find(
        buildComplianceOverview(
          input({
            today,
            associations: [assoc(CA, 'CA')],
            caBudgets: new Map([[CA, { kind: 'ok', budgetId: 'b-1', earliest: '2026-10-02', latest: '2026-12-01', sent }]]),
          }),
        ),
        'ca-annual-budget-report',
      )
    expect(at('2026-09-01')).toMatchObject({ tone: 'upcoming', label: 'Window opens Oct 2, 2026 · closes Dec 1, 2026' })
    expect(at('2026-10-21')).toMatchObject({ tone: 'soon', label: 'Send by Dec 1, 2026 (41 days left)', link: { href: '/accounting/budget/b-1' } })
    expect(at('2026-12-02')).toMatchObject({ tone: 'overdue' })
    expect(at('2026-12-02', true)).toMatchObject({ tone: 'done', label: 'Budget report sent' })
    const notLoaded = find(buildComplianceOverview(input({ associations: [assoc(CA, 'CA')] })), 'ca-annual-budget-report')
    expect(notLoaded).toMatchObject({ tone: 'standing', label: 'See the budget’s adoption checklist' })
  })

  it('any other state: one "check your governing documents" row and nothing quoted', () => {
    const o = buildComplianceOverview(input({ associations: [assoc(OH, 'OH')] }))
    expect(o.groups[0]!.obligations).toHaveLength(1)
    expect(o.groups[0]!.obligations[0]).toMatchObject({ kind: 'not_loaded', quotes: [] })
    expect(o.groups[0]!.obligations[0]!.steps[0]).toContain('Check your governing documents')
  })
})

describe('only checked statute text is ever shown', () => {
  it('every quote on every obligation is one of law.ts’s checked quotes', () => {
    const o = buildComplianceOverview(
      input({
        associations: [assoc(GA, 'GA'), assoc(TX, 'TX'), assoc(FL, 'FL'), assoc(CA, 'CA'), assoc(OH, 'OH')],
        directorCerts: { kind: 'ok', associationId: FL, rows: [] },
      }),
    )
    const checked = new Set(ALL_COMPLIANCE_QUOTES)
    for (const ob of o.groups.flatMap((g) => g.obligations)) for (const q of ob.quotes) expect(checked.has(q), `${ob.key} ${q.cite}`).toBe(true)
  })
})

describe('complianceSummary (monthly report, board packet)', () => {
  it('counts open and overdue and picks overdue first, then the soonest date', () => {
    const o = buildComplianceOverview(
      input({ today: '2027-01-02', annualMeetings: { lastHeld: '2026-03-03', next: null, nextNoticeSentOn: null } }),
    )
    expect(complianceSummary(o)).toEqual({
      // SB 406 registration (overdue), the annual meeting, and (BL-152) the 2027 corporate registration.
      open: 3,
      overdue: 1,
      done: 0,
      next: { title: 'Register with the Georgia Secretary of State', label: 'In effect since Jan 1, 2027', associationName: 'HOA 1111' },
      nothingTracked: false,
      election: { title: 'Director elections', label: 'No election planned in HomeownerHub' },
    })
  })

  it('nothing loaded for any state', () => {
    expect(complianceSummary(buildComplianceOverview(input({ associations: [assoc(OH, 'OH')] })))).toMatchObject({
      open: 0,
      overdue: 0,
      next: null,
      nothingTracked: true,
    })
  })
})

// ─── BL-151: director elections from the BL-141 planner ──────────────

describe('director elections (BL-151)', () => {
  const M1 = 'a1111111-1111-4111-8111-111111111111'
  const C1 = 'c1111111-1111-4111-8111-111111111111'
  const C2 = 'c2222222-2222-4222-8222-222222222222'
  const stamp = { updatedAt: '2026-10-01T00:00:00Z', updatedBy: null }

  function settingsWith(assocId: string, e: Partial<Election>, secret = SECRET): Record<string, unknown> {
    const full: Election = { ...EMPTY_ELECTION, inspectors: [], candidates: [], ...e }
    return withElection({}, M1, signElection(assocId, M1, full, stamp, secret))
  }
  const candidates = (votes: number | null) => [
    { id: C1, name: 'Candidate One', propertyId: null, nominatedOn: null, onBallot: true, votes },
    { id: C2, name: 'Candidate Two', propertyId: null, nominatedOn: null, onBallot: true, votes: votes === null ? null : votes + 3 },
  ]
  function overview(
    state: string,
    e: Partial<Election> | null,
    over: Partial<ComplianceInput> & { meetingDate?: string; meetingType?: string } = {},
  ) {
    const id = state === 'CA' ? CA : state === 'FL' ? FL : state === 'TX' ? TX : GA
    const { meetingDate = '2027-01-15', meetingType = 'annual', ...rest } = over
    return buildComplianceOverview(
      input({
        associations: [{ ...assoc(id, state), complianceSettings: e ? settingsWith(id, e) : {} }],
        electionMeetings: new Map([[M1, { id: M1, date: meetingDate, type: meetingType }]]),
        ...rest,
      }),
    )
  }
  const election = (o: ReturnType<typeof buildComplianceOverview>) => find(o, `director-election:${M1}`)

  it('replaces "Not tracked yet": with nothing planned, the row says so and links to Meetings', () => {
    for (const s of ['GA', 'FL', 'CA', 'TX']) {
      const r = find(overview(s, null), 'director-elections')
      expect(r).toMatchObject({ kind: 'election', tone: 'unknown', label: 'No election planned in HomeownerHub', link: { href: '/meetings' } })
    }
    const all = JSON.stringify(buildComplianceOverview(input({ associations: [assoc(GA, 'GA'), assoc(TX, 'TX'), assoc(FL, 'FL'), assoc(CA, 'CA')] })))
    expect(all).not.toContain('Not tracked yet')
  })

  it('a planned Georgia election: the next date on its timeline, linked to the planner', () => {
    const r = election(overview('GA', { seats: 3 }))
    expect(r).toMatchObject({
      kind: 'election',
      title: 'Director election at the Jan 15, 2027 annual meeting',
      tone: 'upcoming',
      label: 'Send the annual meeting notice by Dec 25, 2026',
      dueOn: '2026-12-25',
      link: { href: `/meetings/${M1}/election`, label: 'Open the election planner' },
    })
  })

  it('a passed date is flagged to check; the next one leads', () => {
    const r = election(overview('GA', { seats: 3 }, { today: '2026-12-28' }))
    expect(r.label).toBe('Meeting: vote and count on Jan 15, 2027 · 1 earlier date has passed: check it was done')
    expect(r.tone).toBe('upcoming')
  })

  it('held with no results recorded: unknown, never "done"', () => {
    const r = election(overview('GA', { seats: 2, candidates: candidates(null) }, { today: '2027-01-20' }))
    expect(r).toMatchObject({ tone: 'unknown', label: 'Held Jan 15, 2027 · results not recorded yet' })
  })

  it('Georgia: results recorded → done, then the 30-day amended registration if the officers changed', () => {
    const o = overview('GA', { seats: 2, candidates: candidates(10), resultsAnnouncedOn: '2027-01-16' }, { today: '2027-01-20' })
    expect(election(o)).toMatchObject({ tone: 'done', label: 'Results recorded · announced Jan 16, 2027' })
    const a = find(o, `ga-registration-amendment:${M1}`)
    expect(a).toMatchObject({
      kind: 'registration_amendment',
      tone: 'soon',
      label: 'If the officers changed, file by Feb 15, 2027 (26 days left)',
      dueOn: '2027-02-15',
      official: { href: GA_SOS_URL },
    })
    expect(a.quotes.map((q) => q.cite)).toContain('O.C.G.A. § 43-17A-2(d)')
    expect(a.steps.join(' ')).toContain('Secretary of State’s guidance')
    // The amendment row sits right after its election.
    const keys = o.groups[0]!.obligations.map((x) => x.key.split(':').slice(1).join(':'))
    expect(keys.indexOf(`ga-registration-amendment:${M1}`)).toBe(keys.indexOf(`director-election:${M1}`) + 1)
    // Past the 30 days HomeownerHub can't know whether the officers changed or it was filed.
    const late = find(
      overview('GA', { seats: 2, candidates: candidates(10), resultsAnnouncedOn: '2027-01-16' }, { today: '2027-03-01' }),
      `ga-registration-amendment:${M1}`,
    )
    expect(late).toMatchObject({ tone: 'unknown', label: 'Was due Feb 15, 2027 if the officers changed' })
  })

  it('Georgia: no announcement day counts from the meeting; before Jan 1, 2027 it goes into the first registration', () => {
    const fromMeeting = find(overview('GA', { seats: 2, candidates: candidates(4) }, { today: '2027-01-20' }), `ga-registration-amendment:${M1}`)
    expect(fromMeeting.dueOn).toBe('2027-02-14')
    const early = find(
      overview('GA', { seats: 2, candidates: candidates(4), resultsAnnouncedOn: '2026-10-02' }, { today: '2026-10-21', meetingDate: '2026-10-01' }),
      `ga-registration-amendment:${M1}`,
    )
    expect(early).toMatchObject({ tone: 'standing', label: 'Registration starts Jan 1, 2027: list the new officers in your first filing', dueOn: null })
  })

  it('only Georgia gets the amendment row', () => {
    for (const s of ['FL', 'TX', 'CA']) {
      const o = overview(s, { seats: 2, candidates: candidates(10), resultsAnnouncedOn: '2027-01-16' }, { today: '2027-01-20' })
      expect(o.groups[0]!.obligations.some((x) => x.kind === 'registration_amendment')).toBe(false)
    }
  })

  it('California: the results notice within 15 days: soon, then overdue, then done once announced', () => {
    const held = { seats: 2, candidates: candidates(10) }
    const soon = election(overview('CA', held, { today: '2026-10-10', meetingDate: '2026-10-01' }))
    expect(soon).toMatchObject({ tone: 'soon', label: 'Send the results notice by Oct 16, 2026 (6 days left)', dueOn: '2026-10-16' })
    expect(soon.quotes.map((q) => q.cite)).toEqual(['Cal. Civ. Code § 5120(b)'])
    const late = overview('CA', held, { today: '2026-10-21', meetingDate: '2026-10-01' })
    expect(election(late)).toMatchObject({ tone: 'overdue', label: 'Results notice was due Oct 16, 2026 · not recorded as sent' })
    expect(late.overdue.map((x) => x.key)).toContain(election(late).key)
    const announced = election(overview('CA', { ...held, resultsAnnouncedOn: '2026-10-05' }, { today: '2026-10-21', meetingDate: '2026-10-01' }))
    expect(announced.tone).toBe('done')
  })

  it('California: quorum not reached and no reconvened date asks for one', () => {
    const r = election(overview('CA', { seats: 2, quorumReached: false }, { today: '2026-10-05', meetingDate: '2026-10-01' }))
    expect(r).toMatchObject({ tone: 'soon', label: 'Quorum not reached · set the reconvened meeting in the planner' })
  })

  it('dates that break the rule are overdue: "check the dates"', () => {
    const r = election(overview('CA', { seats: 2, ballotsOutOn: '2027-01-01' }))
    expect(r.tone).toBe('overdue')
    expect(r.label).toBe('Check the dates: mail ballots with two envelopes')
  })

  it('a forged election, or one whose meeting is gone, is ignored; an unreadable meetings list says so', () => {
    const forged = buildComplianceOverview(
      input({
        associations: [{ ...assoc(GA, 'GA'), complianceSettings: settingsWith(GA, { seats: 3 }, 'other-secret') }],
        electionMeetings: new Map([[M1, { id: M1, date: '2027-01-15', type: 'annual' }]]),
      }),
    )
    expect(find(forged, 'director-elections').label).toBe('No election planned in HomeownerHub')
    const gone = buildComplianceOverview(input({ associations: [{ ...assoc(GA, 'GA'), complianceSettings: settingsWith(GA, { seats: 3 }) }] }))
    expect(find(gone, 'director-elections').label).toBe('No election planned in HomeownerHub')
    const failed = buildComplianceOverview(input({ electionMeetings: null }))
    expect(find(failed, 'director-elections')).toMatchObject({ tone: 'failed', label: 'Couldn’t load your elections' })
  })

  it('another association’s signed election never shows on this one', () => {
    const o = buildComplianceOverview(
      input({
        associations: [{ ...assoc(GA, 'GA'), complianceSettings: settingsWith(TX, { seats: 3 }) }],
        electionMeetings: new Map([[M1, { id: M1, date: '2027-01-15', type: 'annual' }]]),
      }),
    )
    expect(find(o, 'director-elections').label).toBe('No election planned in HomeownerHub')
  })

  it('a special meeting reads as one', () => {
    expect(election(overview('GA', { seats: 1 }, { meetingType: 'special' })).title).toBe('Director election at the Jan 15, 2027 special meeting')
  })

  it('the monthly report line: the most pressing election row', () => {
    const s = complianceSummary(overview('GA', { seats: 2, candidates: candidates(10), resultsAnnouncedOn: '2027-01-16' }, { today: '2027-01-20' }))
    expect(s.election).toEqual({
      title: 'Amend the Secretary of State registration after the Jan 15, 2027 election',
      label: 'If the officers changed, file by Feb 15, 2027 (26 days left)',
    })
    expect(complianceSummary(buildComplianceOverview(input({ associations: [assoc(OH, 'OH')] }))).election).toBeNull()
  })
})

describe('Georgia annual meeting: a missed meeting may be called by 5% (BL-150)', () => {
  it('says so in a step and quotes § 44-3-230(b)', () => {
    const m = find(buildComplianceOverview(input()), 'ga-annual-meeting')
    expect(m.steps.join(' ')).toContain('5% of the voting power')
    expect(m.quotes.map((q) => q.cite)).toContain('O.C.G.A. § 44-3-230(b)')
  })
})
