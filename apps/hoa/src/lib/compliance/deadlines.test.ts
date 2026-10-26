import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import {
  COMPLIANCE_ACK_KEY,
  COMPLIANCE_DEADLINES,
  COMPLIANCE_DIGEST_WINDOW_DAYS,
  complianceAckSecret,
  complianceDigestItems,
  complianceDigestLine,
  complianceLabel,
  complianceState,
  complianceTone,
  daysUntil,
  deadlineAppliesToState,
  deadlineByCode,
  deadlineLabel,
  deadlineTone,
  deadlinesForState,
  gaCorpRegistrationDeadline,
  gaCorpRegistrationYear,
  isKnownDeadlineCode,
  pendingComplianceItems,
  readComplianceAcks,
  signComplianceAck,
  withComplianceAck,
  type ComplianceAssociationInput,
} from './deadlines'

// BL-131 stopgap. Today in these tests is 2026-10-20 unless a case says otherwise.

const REPO_ROOT = resolve(__dirname, '../../../../..')
const SECRET = 'test-secret'
const GA_ID = '11111111-1111-4111-8111-111111111111'
const TX_ID = '22222222-2222-4222-8222-222222222222'
const GA_CODE = 'ga-sos-registration-2027'
const TX_CODE = 'tx-management-certificate'
const GA_CORP_2027 = 'ga-corp-annual-registration-2027'

function assoc(over: Partial<ComplianceAssociationInput> = {}): ComplianceAssociationInput {
  return { id: GA_ID, name: 'Peachtree Commons', state: 'GA', governingLawState: null, complianceSettings: {}, ...over }
}

describe('the deadline list cites only text we hold', () => {
  it('every entry names a fixture that exists', () => {
    for (const d of COMPLIANCE_DEADLINES) {
      expect(() => readFileSync(resolve(REPO_ROOT, d.fixture), 'utf8'), d.code).not.toThrow()
    }
  })

  it('GA: the fixture carries the registration bar, the opt-out, the $100 fee, the Dec 31 renewal and the 2027-01-01 effective date', () => {
    const ga = COMPLIANCE_DEADLINES.find((d) => d.code === GA_CODE)!
    const text = readFileSync(resolve(REPO_ROOT, ga.fixture), 'utf8')
    expect(text).toContain('https://www.legis.ga.gov/api/legislation/document/20252026/248665')
    expect(text).toContain(
      'no owners\' association or its agent shall collect fines or fees against any owner, or file or record liens or initiate foreclosure proceedings against any lot unless such owners\' association is registered pursuant to this Code section.',
    )
    expect(text).toContain('No nonregistered owners\' association or its agent shall assess or collect fines or fees or accelerated assessments against any owner.')
    expect(text).toContain('a financial statement of the owners\' association dated no more than one year prior to filing')
    expect(text).toContain('shall expire on December 31 of each year')
    expect(text).toContain('initial registration statement and each annual renewal shall be $100.00.')
    expect(text).toContain('this Act shall become effective on January 1, 2027.')
    expect(ga.dueOn).toBe('2027-01-01')
    expect(ga.citation).toContain('§ 43-17A-2')
    expect(ga.officialUrl).toMatch(/^https:\/\/sos\.ga\.gov\//)
  })

  it('TX: the fixture carries § 209.004 (b), (b-1) and the fee/interest consequence in (e)', () => {
    const tx = COMPLIANCE_DEADLINES.find((d) => d.code === TX_CODE)!
    const text = readFileSync(resolve(REPO_ROOT, tx.fixture), 'utf8')
    expect(text).toContain('not later than the 30th day after the date the association has notice of a change')
    expect(text).toContain('Not later than the seventh day after the date a property owners\' association files a management certificate')
    expect(text).toContain('An owner is not liable for attorney\'s fees incurred by a property owners\' association')
    expect(tx.dueOn).toBeNull()
  })

  it('carries no FL or CA entry (FL milestone/SIRS are condo-only; CA § 5551 text is not in our fixtures)', () => {
    expect(deadlinesForState('FL')).toEqual([])
    expect(deadlinesForState('CA')).toEqual([])
  })
})

describe('state filtering', () => {
  it('reads the governing-law state first, then the address state, by code or name', () => {
    expect(complianceState(null, 'GA')).toBe('GA')
    expect(complianceState(null, ' georgia ')).toBe('GA')
    expect(complianceState('TX', 'GA')).toBe('TX')
    expect(complianceState('', 'Texas')).toBe('TX')
    expect(complianceState(null, 'NC')).toBeNull()
    expect(complianceState(null, null)).toBeNull()
  })

  it('shows the GA registration to GA associations only', () => {
    const items = pendingComplianceItems(
      [
        assoc(),
        assoc({ id: TX_ID, name: 'Lone Star Ranch', state: 'TX' }),
        assoc({ id: 'fl', name: 'Gulf Breeze', state: 'FL' }),
        assoc({ id: 'nc', name: 'Blue Ridge', state: 'NC' }),
        assoc({ id: 'none', name: 'No state', state: null }),
      ],
      '2026-10-20',
      SECRET,
    )
    expect(items.map((i) => [i.associationId, i.deadline.code])).toEqual([
      [GA_ID, GA_CODE],
      [GA_ID, GA_CORP_2027],
      [TX_ID, TX_CODE],
    ])
  })
})

describe('deadline math', () => {
  it('counts calendar days to the date: 73 on 2026-10-20, 0 on the day, negative after', () => {
    expect(daysUntil('2026-10-20', '2027-01-01')).toBe(73)
    expect(daysUntil('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysUntil('2027-01-01', '2027-01-01')).toBe(0)
    expect(daysUntil('2027-01-05', '2027-01-01')).toBe(-4)
  })

  it('crosses DST and year ends without drift', () => {
    expect(daysUntil('2026-11-01', '2026-11-02')).toBe(1)
    expect(daysUntil('2026-03-07', '2026-03-09')).toBe(2)
  })

  it('tones: upcoming, soon within 30 days, overdue from the day itself, standing without a date', () => {
    expect(complianceTone(73)).toBe('upcoming')
    expect(complianceTone(30)).toBe('soon')
    expect(complianceTone(1)).toBe('soon')
    expect(complianceTone(0)).toBe('overdue')
    expect(complianceTone(-1)).toBe('overdue')
    expect(complianceTone(null)).toBe('standing')
  })

  it('labels', () => {
    expect(complianceLabel('2027-01-01', 73)).toBe('Takes effect in 73 days (Jan 1, 2027)')
    expect(complianceLabel('2027-01-01', 1)).toBe('Takes effect in 1 day (Jan 1, 2027)')
    expect(complianceLabel('2027-01-01', 0)).toBe('Takes effect today (Jan 1, 2027)')
    expect(complianceLabel('2027-01-01', -3)).toBe('In effect since Jan 1, 2027')
    expect(complianceLabel(null, null)).toBe('Ongoing — confirm it’s filed')
  })

  it('orders dated deadlines soonest first, standing ones last', () => {
    const items = pendingComplianceItems(
      [assoc({ id: TX_ID, name: 'Lone Star Ranch', state: 'TX' }), assoc()],
      '2026-10-20',
      SECRET,
    )
    expect(items.map((i) => i.deadline.code)).toEqual([GA_CODE, GA_CORP_2027, TX_CODE])
    expect(items[0]).toMatchObject({ daysLeft: 73, tone: 'upcoming', label: 'Takes effect in 73 days (Jan 1, 2027)' })
    expect(items[1]).toMatchObject({ daysLeft: 163, tone: 'upcoming', label: 'Filing opens Jan 1, 2027 · due Apr 1, 2027' })
    expect(items[2]).toMatchObject({ daysLeft: null, tone: 'standing' })
  })
})

describe('acknowledgment signature', () => {
  const stamp = { doneAt: '2026-10-20T15:00:00.000Z', doneBy: 'user-1' }

  it('a signed acknowledgment hides the deadline', () => {
    const settings = withComplianceAck({}, GA_CODE, signComplianceAck(GA_ID, GA_CODE, stamp, SECRET))
    expect(readComplianceAcks(GA_ID, settings, SECRET).get(GA_CODE)).toEqual(stamp)
    expect(pendingComplianceItems([assoc({ complianceSettings: settings })], '2026-10-20', SECRET).map((i) => i.deadline.code)).toEqual([
      GA_CORP_2027,
    ])
  })

  it('a forged, tampered, cross-association or wrong-secret value does not hide it', () => {
    const good = signComplianceAck(GA_ID, GA_CODE, stamp, SECRET)
    const cases: unknown[] = [
      { [COMPLIANCE_ACK_KEY]: { [GA_CODE]: { done_at: stamp.doneAt, done_by: 'user-1', sig: 'deadbeef' } } },
      { [COMPLIANCE_ACK_KEY]: { [GA_CODE]: { ...good, done_by: 'someone-else' } } },
      { [COMPLIANCE_ACK_KEY]: { [GA_CODE]: true } },
      { [COMPLIANCE_ACK_KEY]: 'done' },
      withComplianceAck({}, GA_CODE, signComplianceAck(TX_ID, GA_CODE, stamp, SECRET)),
    ]
    for (const settings of cases) {
      expect(readComplianceAcks(GA_ID, settings, SECRET).size).toBe(0)
      expect(pendingComplianceItems([assoc({ complianceSettings: settings })], '2026-10-20', SECRET)).toHaveLength(2)
    }
    const signed = withComplianceAck({}, GA_CODE, good)
    expect(readComplianceAcks(GA_ID, signed, 'other-secret').size).toBe(0)
    expect(readComplianceAcks(GA_ID, signed, null).size).toBe(0)
  })

  it('an acknowledgment for one code does not hide another', () => {
    const settings = withComplianceAck({}, GA_CODE, signComplianceAck(TX_ID, GA_CODE, stamp, SECRET))
    const items = pendingComplianceItems(
      [assoc({ id: TX_ID, state: 'TX', complianceSettings: settings })],
      '2026-10-20',
      SECRET,
    )
    expect(items.map((i) => i.deadline.code)).toEqual([TX_CODE])
  })

  it('refuses to sign an unknown code', () => {
    expect(() => signComplianceAck(GA_ID, 'made-up', stamp, SECRET)).toThrow(RangeError)
  })

  it('merging keeps every other compliance_settings key and earlier acknowledgments', () => {
    const first = withComplianceAck(
      { arc_decision_clock: { days: 30 }, pay_by_zelle: { x: 1 } },
      TX_CODE,
      signComplianceAck(TX_ID, TX_CODE, stamp, SECRET),
    )
    const both = withComplianceAck(first, GA_CODE, signComplianceAck(TX_ID, GA_CODE, stamp, SECRET))
    expect(both.arc_decision_clock).toEqual({ days: 30 })
    expect(both.pay_by_zelle).toEqual({ x: 1 })
    expect(Object.keys(both[COMPLIANCE_ACK_KEY] as object).sort()).toEqual([GA_CODE, TX_CODE].sort())
  })

  it('uses the same secret chain as the server actions', () => {
    expect(complianceAckSecret({ SUPABASE_SERVICE_ROLE_KEY: 'srk' })).toBe('srk')
    expect(complianceAckSecret({ PAY_SETTINGS_SECRET: 'pss', SUPABASE_SERVICE_ROLE_KEY: 'srk' })).toBe('pss')
    expect(complianceAckSecret({})).toBeNull()
    expect(complianceAckSecret()).toBe(paySettingsSecret())
  })
})

describe('digest items and line', () => {
  it('includes a dated deadline within the window or past it; never a standing one', () => {
    const at = (today: string) =>
      complianceDigestItems(
        pendingComplianceItems([assoc(), assoc({ id: TX_ID, state: 'TX' })], today, SECRET),
      ).map((i) => i.deadline.code)
    expect(daysUntil('2026-10-02', '2027-01-01')).toBe(COMPLIANCE_DIGEST_WINDOW_DAYS + 1)
    expect(at('2026-10-02')).toEqual([])
    expect(at('2026-10-03')).toEqual([GA_CODE])
    expect(at('2026-10-20')).toEqual([GA_CODE])
    expect(at('2027-02-01')).toEqual([GA_CODE, GA_CORP_2027])
  })

  it('reads as one countdown line with the exact citation', () => {
    const [item] = pendingComplianceItems([assoc()], '2026-10-20', SECRET)
    expect(complianceDigestLine(item!)).toBe(
      'Peachtree Commons: Register with the Georgia Secretary of State — takes effect in 73 days (Jan 1, 2027). O.C.G.A. § 43-17A-2 (Ga. L. 2026, SB 406 (Act 715) § 2; effective Jan 1, 2027, § 9(a)).',
    )
  })
})

describe('BL-152: the Georgia corporation’s annual registration (O.C.G.A. § 14-3-1622(c), § 14-3-1420(2))', () => {
  const corp = gaCorpRegistrationDeadline(2027)

  it('one code per filing year, Georgia only, 2027 onward', () => {
    expect(corp).toMatchObject({ code: GA_CORP_2027, state: 'GA', dueOn: '2027-04-01', opensOn: '2027-01-01', dueKind: 'filing', graceDays: 60 })
    expect(deadlineByCode('ga-corp-annual-registration-2031')?.dueOn).toBe('2031-04-01')
    expect(isKnownDeadlineCode(GA_CORP_2027)).toBe(true)
    for (const bad of ['ga-corp-annual-registration-2026', 'ga-corp-annual-registration-27', 'ga-corp-annual-registration-2100', 'GA-corp-annual-registration-2027']) {
      expect(isKnownDeadlineCode(bad), bad).toBe(false)
    }
    expect(deadlineAppliesToState('GA', GA_CORP_2027)).toBe(true)
    expect(deadlineAppliesToState('TX', GA_CORP_2027)).toBe(false)
    expect(deadlineAppliesToState('GA', TX_CODE)).toBe(false)
    expect(deadlineAppliesToState(null, GA_CODE)).toBe(false)
    expect(() => signComplianceAck(GA_ID, GA_CORP_2027, { doneAt: '2027-02-01T00:00:00Z', doneBy: null }, SECRET)).not.toThrow()
  })

  it('the year is today’s, never before 2027; without a day only the fixed list', () => {
    expect(gaCorpRegistrationYear('2026-10-20')).toBe(2027)
    expect(gaCorpRegistrationYear('2027-12-31')).toBe(2027)
    expect(gaCorpRegistrationYear('2028-01-01')).toBe(2028)
    expect(deadlinesForState('GA').map((d) => d.code)).toEqual([GA_CODE])
    expect(deadlinesForState('GA', '2028-03-01').map((d) => d.code)).toEqual([GA_CODE, 'ga-corp-annual-registration-2028'])
    expect(deadlinesForState('TX', '2028-03-01').map((d) => d.code)).toEqual([TX_CODE])
  })

  it('labels and tones through the season: due on April 1 itself, late after, dissolution risk after day 60', () => {
    const at = (today: string) => ({ label: deadlineLabel(corp, today), tone: deadlineTone(corp, daysUntil(today, '2027-04-01')) })
    expect(at('2026-12-31')).toEqual({ label: 'Filing opens Jan 1, 2027 · due Apr 1, 2027', tone: 'upcoming' })
    expect(at('2027-01-01')).toEqual({ label: 'Due Apr 1, 2027 (in 90 days)', tone: 'upcoming' })
    expect(at('2027-03-31')).toEqual({ label: 'Due Apr 1, 2027 (in 1 day)', tone: 'soon' })
    expect(at('2027-04-01')).toEqual({ label: 'Due today (Apr 1, 2027)', tone: 'soon' })
    expect(at('2027-04-02').tone).toBe('overdue')
    expect(at('2027-04-02').label).toBe(
      'Late since Apr 1, 2027 · if it isn’t filed by May 31, 2027, the Secretary of State may start administrative dissolution',
    )
    expect(at('2027-05-31').label).toContain('if it isn’t filed by May 31, 2027')
    expect(at('2027-06-01').label).toBe(
      'Late since Apr 1, 2027 · more than 60 days: the Secretary of State may start administrative dissolution. File now',
    )
  })

  it('marking 2027 done never hides 2028', () => {
    const stamp = { doneAt: '2027-02-01T15:00:00.000Z', doneBy: 'user-1' }
    const settings = withComplianceAck({}, GA_CORP_2027, signComplianceAck(GA_ID, GA_CORP_2027, stamp, SECRET))
    const codes = (today: string) =>
      pendingComplianceItems([assoc({ complianceSettings: settings })], today, SECRET).map((i) => i.deadline.code)
    expect(codes('2027-03-01')).toEqual([GA_CODE])
    expect(codes('2028-01-02')).toEqual([GA_CODE, 'ga-corp-annual-registration-2028'])
  })

  it('names the Title 14 fixture, which holds both sections it cites', () => {
    const text = readFileSync(resolve(REPO_ROOT, corp.fixture), 'utf8')
    expect(text).toContain('=== O.C.G.A. Section 14-3-1622 | Annual registration of corporation')
    expect(text).toContain('=== O.C.G.A. Section 14-3-1420 | Grounds for administrative dissolution')
    expect(text).toContain('Subsequent annual registrations must be delivered to the Secretary of State between January 1 and April 1')
    expect(text).toContain('within 60 days after it is due;')
  })
})
