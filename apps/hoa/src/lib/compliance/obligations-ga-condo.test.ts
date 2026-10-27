import { describe, expect, it } from 'vitest'
import type { ComplianceAssociationInput } from './deadlines'
import {
  GA_ANNUAL_MEETING,
  GA_MISSED_ANNUAL_MEETING,
  GA_POA_ACT_SCOPE,
  GA_RECORDS_MINUTES,
  GA_STATEMENT_DEADLINE,
} from './law'
import {
  GA_CONDO_ANNUAL_MEETING,
  GA_CONDO_ANNUAL_REPORT,
  GA_CONDO_APPLIES,
  GA_CONDO_LIABILITY_INSURANCE,
  GA_CONDO_MEETING_NOTICE,
  GA_CONDO_OWNER_CALL,
  GA_CONDO_PROPERTY_INSURANCE,
  GA_CONDO_RECORDS_FINANCIAL,
  GA_CONDO_RECORDS_KEEP,
  GA_CONDO_RECORDS_MINUTES,
  GA_CONDO_SCOPE,
  GA_CONDO_STATEMENT_DEADLINE,
  GA_CONDO_STATEMENT_RIGHT,
  GA_CONDO_WATER_CERTIFICATE,
} from '@/lib/ga-condo/law'
import {
  buildComplianceOverview as realBuildComplianceOverview,
  complianceSummary,
  type ComplianceInput,
  type ComplianceObligation,
} from './obligations'

// BL-167 added federal rows to every association; strip them here (see federal.test.ts).
const buildComplianceOverview: typeof realBuildComplianceOverview = (input) => {
  const o = realBuildComplianceOverview(input)
  const groups = o.groups.map((g) => ({ ...g, obligations: g.obligations.filter((x) => !x.key.includes(':federal-')) }))
  return { groups, overdue: groups.flatMap((g) => g.obligations.filter((x) => x.tone === 'overdue')) }
}

// BL-155: a Georgia association whose type is 'condo' gets the Condominium
// Act (Art. 3) rows; an HOA, a co-op or an untyped one keeps the POA Act rows.
// Today is 2026-10-21. Fictional ids only.

const SECRET = 'test-secret'
const ID = '11111111-1111-4111-8111-111111111111'

function assoc(type?: string | null, state = 'GA'): ComplianceAssociationInput {
  const a: ComplianceAssociationInput = { id: ID, name: 'Peachtree Lofts', state, governingLawState: null, complianceSettings: {} }
  return type === undefined ? a : { ...a, type }
}

function input(a: ComplianceAssociationInput, over: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    today: '2026-10-21',
    associations: [a],
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

const rows = (a: ComplianceAssociationInput, over: Partial<ComplianceInput> = {}) => buildComplianceOverview(input(a, over)).groups[0]!.obligations
const keys = (os: ComplianceObligation[]) => os.map((x) => x.key.split(':')[1])
const row = (os: ComplianceObligation[], k: string) => {
  const hit = os.find((x) => x.key.endsWith(`:${k}`))
  if (!hit) throw new Error(`no obligation ${k}`)
  return hit
}

const POA_KEYS = [
  'ga-sos-registration-2027',
  'ga-registration-upkeep',
  'ga-annual-meeting',
  'ga-records',
  'ga-statement-of-amounts-due',
  'ga-corp-annual-registration-2027',
  'ga-condominium',
  'director-elections',
]

describe('a Georgia condominium association', () => {
  const os = rows(assoc('condo'))

  it('gets registration, upkeep, annual meeting, records, statement, insurance, elections — no "not loaded" condo row', () => {
    expect(keys(os)).toEqual([
      'ga-sos-registration-2027',
      'ga-registration-upkeep',
      'ga-annual-meeting',
      'ga-records',
      'ga-statement-of-amounts-due',
      'ga-condo-insurance',
      'ga-corp-annual-registration-2027',
      'director-elections',
    ])
    expect(os.some((x) => x.kind === 'not_loaded')).toBe(false)
  })

  it('quotes no Property Owners’ Association Act (Art. 6) text', () => {
    const cites = os.flatMap((x) => x.quotes.map((q) => q.cite))
    expect(cites.some((c) => /44-3-2[2-3]\d/.test(c))).toBe(false)
  })

  it('the annual meeting row quotes § 44-3-102 and the 15% owners’ call, not the 5% POA rule', () => {
    const m = row(os, 'ga-annual-meeting')
    expect(m.quotes).toEqual([GA_CONDO_ANNUAL_MEETING, GA_CONDO_MEETING_NOTICE, GA_CONDO_ANNUAL_REPORT, GA_CONDO_OWNER_CALL, GA_CONDO_SCOPE])
    expect(m.appliesTo).toBe(GA_CONDO_APPLIES)
    expect(m.title).toBe('Hold the annual members’ meeting, with 21 days’ notice')
    expect(m.steps.join(' ')).toContain('15% of the unit owners')
    expect(m.steps.join(' ')).not.toContain('5% of the voting power')
  })

  it('the annual meeting notice is still due 21 days before the meeting', () => {
    const m = row(rows(assoc('condo'), { annualMeetings: { lastHeld: null, next: { id: 'm1', date: '2026-12-01' }, nextNoticeSentOn: null } }), 'ga-annual-meeting')
    expect(m.dueOn).toBe('2026-11-10')
    expect(m.label).toBe('Send the notice by Nov 10, 2026 for the Dec 1, 2026 annual meeting')
  })

  it('records quote § 44-3-106(d); the statement quotes § 44-3-109(d), five business days', () => {
    expect(row(os, 'ga-records').quotes).toEqual([GA_CONDO_RECORDS_KEEP, GA_CONDO_RECORDS_MINUTES, GA_CONDO_RECORDS_FINANCIAL])
    const st = row(os, 'ga-statement-of-amounts-due')
    expect(st.quotes).toEqual([GA_CONDO_STATEMENT_RIGHT, GA_CONDO_STATEMENT_DEADLINE])
    expect(st.title).toContain('five business days')
    expect(st.quotes[1]!.quote).toContain('within five business days from the receipt of such request')
  })

  it('the insurance row quotes § 44-3-107 and links Insurance', () => {
    const ins = row(os, 'ga-condo-insurance')
    expect(ins).toMatchObject({ kind: 'duty', tone: 'standing', link: { href: '/insurance' }, appliesTo: GA_CONDO_APPLIES })
    expect(ins.quotes).toEqual([GA_CONDO_PROPERTY_INSURANCE, GA_CONDO_LIABILITY_INSURANCE, GA_CONDO_WATER_CERTIFICATE])
  })

  it('registration rows are the same as an HOA’s (SB 406 covers condominium associations)', () => {
    const hoa = rows(assoc('hoa'))
    for (const k of ['ga-sos-registration-2027', 'ga-registration-upkeep']) expect(row(os, k)).toEqual(row(hoa, k))
  })

  it('the monthly summary counts it as tracked', () => {
    const s = complianceSummary(buildComplianceOverview(input(assoc('condo'))))
    expect(s.nothingTracked).toBe(false)
    // Nothing in the condo rows is dated: the summary's next item is the HOA's too.
    expect(s.next).toEqual(complianceSummary(buildComplianceOverview(input(assoc('hoa')))).next)
    expect(s.open).toBe(complianceSummary(buildComplianceOverview(input(assoc('hoa')))).open)
  })
})

describe('every other Georgia association keeps the POA Act rows', () => {
  for (const type of ['hoa', 'coop', null, undefined] as const) {
    it(`type ${String(type)}: the same rows, the not-loaded condo row, the § 44-3-230(b) quote`, () => {
      const os = rows(assoc(type))
      expect(keys(os)).toEqual(POA_KEYS)
      expect(row(os, 'ga-condominium').tone).toBe('not_loaded')
      const m = row(os, 'ga-annual-meeting')
      expect(m.quotes).toContain(GA_MISSED_ANNUAL_MEETING)
      expect(m.quotes).toContain(GA_ANNUAL_MEETING)
      expect(m.quotes).toContain(GA_POA_ACT_SCOPE)
      expect(row(os, 'ga-records').quotes).toContain(GA_RECORDS_MINUTES)
      expect(row(os, 'ga-statement-of-amounts-due').quotes).toContain(GA_STATEMENT_DEADLINE)
      expect(os.some((x) => x.quotes.some((q) => q.fixture === 'ga-ocga-44-3-art3-2026.txt'))).toBe(false)
    })
  }

  it('an untyped association is identical to an HOA', () => {
    expect(rows(assoc(undefined))).toEqual(rows(assoc('hoa')))
  })

  it('a condo outside Georgia gets no Georgia Condominium Act text', () => {
    const os = rows(assoc('condo', 'TX'))
    expect(os.some((x) => x.quotes.some((q) => q.fixture === 'ga-ocga-44-3-art3-2026.txt'))).toBe(false)
  })
})
