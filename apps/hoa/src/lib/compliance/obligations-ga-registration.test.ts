import { describe, expect, it } from 'vitest'
import type { ComplianceAssociationInput } from './deadlines'
import { EMPTY_ELECTION, type Election } from '../elections/model'
import { signElection, withElection } from '../elections/store'
import { EMPTY_GA_REGISTRATION, type GaFiling, type GaRegistrationRecord } from '../ga-registration/model'
import { signGaRegistration, withGaRegistration } from '../ga-registration/store'
import { buildComplianceOverview, type ComplianceInput, type ComplianceObligation } from './obligations'

// BL-149: /compliance's Georgia rows read the registration kit's signed
// record — registered, lapsed, opted out — and BL-151's post-election
// amendment row is done once the kit records the filing (or that the
// officers didn't change). Fictional ids only.

const SECRET = 'test-secret'
const GA = '11111111-1111-4111-8111-111111111111'
const M1 = 'a1111111-1111-4111-8111-111111111111'
const C1 = 'c1111111-1111-4111-8111-111111111111'
const stamp = { updatedAt: '2027-01-01T00:00:00Z', updatedBy: null }

const filing = (over: Partial<GaFiling>): GaFiling => ({
  id: 'd0000000-0000-4000-8000-000000000001',
  kind: 'registration',
  filedOn: '2027-01-05',
  confirmation: null,
  coversYear: 2027,
  reason: null,
  meetingId: null,
  ...over,
})

function settings(record: Partial<GaRegistrationRecord> | null, withElectionResults = false): Record<string, unknown> {
  let s: Record<string, unknown> = {}
  if (withElectionResults) {
    const e: Election = {
      ...EMPTY_ELECTION,
      seats: 1,
      inspectors: [],
      candidates: [{ id: C1, name: 'Candidate One', propertyId: null, nominatedOn: null, onBallot: true, votes: 12 }],
      resultsAnnouncedOn: '2027-01-16',
    }
    s = withElection(s, M1, signElection(GA, M1, e, stamp, SECRET))
  }
  if (record) {
    const full: GaRegistrationRecord = { ...EMPTY_GA_REGISTRATION, filings: [], noChange: [], ...record }
    s = withGaRegistration(s, signGaRegistration(GA, full, stamp, SECRET))
  }
  return s
}

function overview(complianceSettings: Record<string, unknown>, today: string) {
  const a: ComplianceAssociationInput = { id: GA, name: 'Peach HOA', state: 'GA', governingLawState: null, complianceSettings }
  const input: ComplianceInput = {
    today,
    associations: [a],
    secret: SECRET,
    done: new Map(),
    documentNames: new Map(),
    annualMeetings: { lastHeld: null, next: null, nextNoticeSentOn: null },
    directorCerts: { kind: 'not_applicable' },
    caBudgets: new Map(),
    electionMeetings: new Map([[M1, { id: M1, date: '2027-01-15', type: 'annual' }]]),
  }
  return buildComplianceOverview(input)
}

function find(o: ReturnType<typeof buildComplianceOverview>, suffix: string): ComplianceObligation {
  const hit = o.groups.flatMap((g) => g.obligations).find((x) => x.key.endsWith(suffix))
  if (!hit) throw new Error(`no obligation ${suffix}`)
  return hit
}

describe('the registration row reads the kit', () => {
  it('nothing recorded: overdue from Jan 1, 2027, linked to the kit', () => {
    const r = find(overview(settings(null), '2027-01-10'), 'ga-sos-registration-2027')
    expect(r.tone).toBe('overdue')
    expect(r.link).toEqual({ href: '/compliance/ga-registration', label: 'Open the registration kit' })
  })

  it('registered in the kit: done, with the day and the year it covers', () => {
    const r = find(overview(settings({ decision: 'register', filings: [filing({})] }), '2027-01-10'), 'ga-sos-registration-2027')
    expect(r).toMatchObject({ tone: 'done', label: 'Registered Jan 5, 2027 · current through Dec 31, 2027' })
    // No compliance_deadlines_done row yet: "Mark as done" (with evidence) stays offered.
    expect(r.done).toBeNull()
    expect(r.deadlineCode).toBe('ga-sos-registration-2027')
  })

  it('lapsed after Dec 31 without a renewal: the registration and upkeep rows are overdue', () => {
    const o = overview(settings({ decision: 'register', filings: [filing({})] }), '2028-01-02')
    expect(find(o, 'ga-sos-registration-2027').tone).toBe('overdue')
    expect(find(o, 'ga-registration-upkeep')).toMatchObject({ tone: 'overdue', label: 'Registration lapsed after Dec 31, 2027 · record the renewal' })
  })

  it('a renewal for next year shows as done on the upkeep row', () => {
    const renewal = filing({ id: 'd0000000-0000-4000-8000-000000000002', kind: 'renewal', filedOn: '2027-11-20', coversYear: 2028 })
    const up = find(overview(settings({ decision: 'register', filings: [filing({}), renewal] }), '2027-12-01'), 'ga-registration-upkeep')
    expect(up).toMatchObject({ tone: 'done', label: 'Renewed · current through Dec 31, 2028' })
  })

  it('opted out: standing, and says what it can’t collect', () => {
    const r = find(overview(settings({ decision: 'opt_out', decidedOn: '2026-12-01' }), '2027-01-10'), 'ga-sos-registration-2027')
    expect(r.tone).toBe('standing')
    expect(r.label).toContain('no fines, fees or accelerated assessments')
  })

  it('a forged record changes nothing', () => {
    const forged = { ga_registration: { v: 1, record: { ...EMPTY_GA_REGISTRATION, filings: [filing({})] }, updated_at: 'x', updated_by: null, sig: 'f00d' } }
    expect(find(overview(forged, '2027-01-10'), 'ga-sos-registration-2027').tone).toBe('overdue')
  })
})

describe('BL-151’s amended registration is markable from the kit', () => {
  it('open: soon, linked to the kit’s amendments, carrying the meeting', () => {
    const a = find(overview(settings(null, true), '2027-01-20'), `ga-registration-amendment:${M1}`)
    expect(a).toMatchObject({ tone: 'soon', meetingId: M1, link: { href: '/compliance/ga-registration#amendments' } })
  })

  it('the amended filing recorded: done, with its day', () => {
    const amended = filing({ id: 'd0000000-0000-4000-8000-000000000003', kind: 'amendment', filedOn: '2027-02-01', coversYear: null, reason: 'officers', meetingId: M1 })
    const a = find(overview(settings({ filings: [amended] }, true), '2027-02-02'), `ga-registration-amendment:${M1}`)
    expect(a).toMatchObject({ tone: 'done', label: 'Amended registration filed Feb 1, 2027', dueOn: null })
  })

  it('"officers didn’t change": done, no amendment needed', () => {
    const a = find(overview(settings({ noChange: [M1] }, true), '2027-03-01'), `ga-registration-amendment:${M1}`)
    expect(a).toMatchObject({ tone: 'done', label: 'Officers didn’t change · no amendment needed' })
  })
})

describe('BL-159: a board role change starts the same 30-day row', () => {
  const CH = 'e1111111-1111-4111-8111-111111111111'
  const change = { id: CH, on: '2027-03-10' }

  it('open: counts 30 days from the day the role changed, markable in the kit', () => {
    const a = find(overview(settings({ officerChanges: [change] }), '2027-03-15'), `ga-registration-amendment:${CH}`)
    expect(a).toMatchObject({
      kind: 'registration_amendment',
      tone: 'soon',
      dueOn: '2027-04-09',
      meetingId: CH,
      link: { href: '/compliance/ga-registration#amendments' },
      title: 'Amend the Secretary of State registration after the Mar 10, 2027 board change',
    })
    expect(a.label).toBe('If the officers changed, file by Apr 9, 2027 (25 days left)')
  })

  it('past day 30: unknown, not overdue', () => {
    expect(find(overview(settings({ officerChanges: [change] }), '2027-04-20'), `ga-registration-amendment:${CH}`).tone).toBe('unknown')
  })

  it('answered in the kit: by its own filing, by "officers didn’t change", or by any amendment filed since', () => {
    const own = filing({ id: 'd0000000-0000-4000-8000-000000000004', kind: 'amendment', filedOn: '2027-03-20', coversYear: null, reason: 'officers', meetingId: CH })
    expect(find(overview(settings({ officerChanges: [change], filings: [own] }), '2027-03-21'), CH).tone).toBe('done')
    expect(find(overview(settings({ officerChanges: [change], noChange: [CH] }), '2027-03-21'), CH).tone).toBe('done')
    const later = filing({ id: 'd0000000-0000-4000-8000-000000000005', kind: 'amendment', filedOn: '2027-03-12', coversYear: null, reason: 'other', meetingId: null })
    expect(find(overview(settings({ officerChanges: [change], filings: [later] }), '2027-03-21'), CH).label).toBe('Amended registration filed Mar 12, 2027')
    // An amendment filed BEFORE the change can't list the new officers.
    const earlier = { ...later, filedOn: '2027-03-01' }
    expect(find(overview(settings({ officerChanges: [change], filings: [earlier] }), '2027-03-21'), CH).tone).toBe('soon')
  })

  it('before 2027: list the new officers in the first filing', () => {
    const a = find(overview(settings({ officerChanges: [{ id: CH, on: '2026-11-01' }] }), '2026-11-02'), CH)
    expect(a.tone).toBe('standing')
    expect(a.label).toContain('list the new officers in your first filing')
  })

  it('an unverified record shows no role-change row', () => {
    const s = settings({ officerChanges: [change] })
    const tampered = { ga_registration: { ...(s.ga_registration as object), sig: 'f00d' } }
    const rows = overview(tampered, '2027-03-15').groups.flatMap((g) => g.obligations)
    expect(rows.some((x) => x.key.endsWith(CH))).toBe(false)
  })
})
