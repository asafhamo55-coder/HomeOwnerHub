import { describe, expect, it } from 'vitest'
import {
  complianceDigestItems,
  complianceDigestLine,
  deadlineAppliesToState,
  deadlineByCode,
  deadlinesForState,
  federal1099Deadline,
  federal1120hDeadline,
  federalTaxYear,
  form1120hDueOn,
  isKnownDeadlineCode,
  nec1099DueOn,
  pendingComplianceItems,
  signComplianceAck,
  withComplianceAck,
  type ComplianceAssociationInput,
} from './deadlines'
import { buildComplianceOverview, type ComplianceInput } from './obligations'

// BL-167: the federal Form 1099-NEC and Form 1120-H dates. Sources are
// cited in deadlines.ts (irs.gov/instructions/i1099mec and /i1120h).

const SECRET = 'test-secret'
const ID = '11111111-1111-4111-8111-111111111111'
const assoc = (state: string | null): ComplianceAssociationInput => ({
  id: ID,
  name: 'Oak Hills HOA',
  state,
  governingLawState: null,
  complianceSettings: {},
})
const fedCodes = (state: string | null, today: string, settings: unknown = {}) =>
  pendingComplianceItems([{ ...assoc(state), complianceSettings: settings }], today, SECRET)
    .map((i) => i.deadline.code)
    .filter((c) => c.startsWith('federal-'))

describe('federal due dates', () => {
  it('1099-NEC for 2026 payments is Feb 1, 2027: Jan 31 is a Sunday', () => {
    expect(nec1099DueOn(2026)).toBe('2027-02-01')
  })
  it('keeps Jan 31 on a weekday', () => {
    expect(nec1099DueOn(2027)).toBe('2028-01-31') // Monday
    expect(nec1099DueOn(2028)).toBe('2029-01-31') // Wednesday
  })
  it('1120-H for a calendar 2026 year is Apr 15, 2027 (a Thursday)', () => {
    expect(form1120hDueOn(2026)).toBe('2027-04-15')
  })
  it('1120-H skips a weekend and the D.C. Emancipation Day observance', () => {
    expect(form1120hDueOn(2027)).toBe('2028-04-18') // Apr 15, 2028 is a Saturday; Apr 16 is a Sunday, observed Monday Apr 17
    expect(form1120hDueOn(2021)).toBe('2022-04-18') // Apr 16 fell on a Saturday: observed Friday Apr 15
  })
})

describe('which tax year shows', () => {
  it('2026 until its date is 90 days past, then the next; never before 2026', () => {
    expect(federalTaxYear('2026-10-26', nec1099DueOn)).toBe(2026)
    expect(federalTaxYear('2027-02-01', nec1099DueOn)).toBe(2026)
    expect(federalTaxYear('2027-05-02', nec1099DueOn)).toBe(2026)
    expect(federalTaxYear('2027-05-03', nec1099DueOn)).toBe(2027)
    expect(federalTaxYear('2026-01-15', nec1099DueOn)).toBe(2026)
    expect(federalTaxYear('2027-07-14', form1120hDueOn)).toBe(2026)
    expect(federalTaxYear('2027-07-15', form1120hDueOn)).toBe(2027)
  })
})

describe('the rows', () => {
  it('state the $2,000 threshold for 2026 only; later years say check irs.gov', () => {
    const t = (y: number) => federal1099Deadline(y).whatToDo.join(' ')
    expect(t(2026)).toContain('$2,000')
    expect(t(2027)).toContain('check irs.gov')
    expect(t(2027)).not.toContain('is $2,000')
  })
  it('cite irs.gov, link the year-end package, and say it is not tax advice', () => {
    for (const d of [federal1099Deadline(2026), federal1120hDeadline(2026)]) {
      expect(d.officialUrl).toMatch(/^https:\/\/www\.irs\.gov\/instructions\//)
      expect(d.prepHref).toBe('/accounting/reports/year-end')
      expect(d.consequence).toContain('Not legal or tax advice')
      expect(d.state).toBe('US')
      expect(d.fixture).toBeNull()
    }
  })
  it('have per-year codes that resolve, and nothing before 2026', () => {
    expect(deadlineByCode('federal-1099-nec-2026')?.dueOn).toBe('2027-02-01')
    expect(deadlineByCode('federal-1120-h-2026')?.dueOn).toBe('2027-04-15')
    expect(isKnownDeadlineCode('federal-1099-nec-2025')).toBe(false)
    expect(isKnownDeadlineCode('federal-1120-h-2100')).toBe(false)
    expect(isKnownDeadlineCode('federal-1042-2026')).toBe(false)
  })
})

describe('every state, including none', () => {
  it('applies to GA, FL, CA, TX, another state and an unknown one', () => {
    for (const s of ['GA', 'FL', 'CA', 'TX', 'OH', null]) {
      expect(fedCodes(s, '2026-10-26'), String(s)).toEqual(['federal-1099-nec-2026', 'federal-1120-h-2026'])
    }
    expect(deadlineAppliesToState(null, 'federal-1099-nec-2026')).toBe(true)
    expect(deadlineAppliesToState('TX', 'ga-sos-registration-2027')).toBe(false)
  })
  it('without a day only the fixed state list, as before', () => {
    expect(deadlinesForState('FL')).toEqual([])
    expect(deadlinesForState(null)).toEqual([])
  })
})

describe('done, per tax year', () => {
  it('marking 2026 done hides it, and does not hide 2027', () => {
    const code = 'federal-1099-nec-2026'
    const settings = withComplianceAck(
      {},
      code,
      signComplianceAck(ID, code, { doneAt: '2027-01-20T10:00:00.000Z', doneBy: 'u1' }, SECRET),
    )
    expect(fedCodes('GA', '2027-01-25', settings)).toEqual(['federal-1120-h-2026'])
    expect(fedCodes('GA', '2027-06-01', settings)).toEqual(['federal-1120-h-2026', 'federal-1099-nec-2027'])
  })
})

describe('digest', () => {
  const codes = (today: string) =>
    complianceDigestItems(pendingComplianceItems([assoc('GA')], today, SECRET))
      .map((i) => i.deadline.code)
      .filter((c) => c.startsWith('federal-'))
  it('starts 90 days out and a missed date stays', () => {
    expect(codes('2026-11-02')).toEqual([])
    expect(codes('2026-11-03')).toEqual(['federal-1099-nec-2026'])
    expect(codes('2027-01-15')).toEqual(['federal-1099-nec-2026', 'federal-1120-h-2026'])
    expect(codes('2027-02-10')).toEqual(['federal-1099-nec-2026', 'federal-1120-h-2026'])
  })
  it('the line names the date and the association, and cites irs.gov', () => {
    const item = pendingComplianceItems([assoc('TX')], '2027-01-25', SECRET).find((i) => i.deadline.code === 'federal-1099-nec-2026')!
    const line = complianceDigestLine(item)
    expect(line).toContain('Oak Hills HOA')
    expect(line).toContain('Feb 1, 2027')
    expect(line).toContain('irs.gov/instructions/i1099mec')
  })
})

describe('the /compliance page rows', () => {
  const input = (state: string | null, today: string): ComplianceInput => ({
    today,
    associations: [assoc(state)],
    secret: SECRET,
    done: new Map([[ID, new Map([['federal-1120-h-2026', { doneAt: '2027-03-01T00:00:00Z', documentId: 'doc-1' }]])]]),
    documentNames: new Map([['doc-1', 'Filed 1120-H.pdf']]),
    annualMeetings: { lastHeld: null, next: null, nextNoticeSentOn: null },
    directorCerts: { kind: 'not_applicable' },
    caBudgets: new Map(),
    electionMeetings: new Map(),
  })
  it('shows both rows for an unknown state, markable, linking the year-end package', () => {
    const rows = buildComplianceOverview(input('OH', '2027-01-25')).groups[0]!.obligations.filter((o) => o.key.includes(':federal-'))
    expect(rows.map((r) => r.deadlineCode)).toEqual(['federal-1099-nec-2026', 'federal-1120-h-2026'])
    expect(rows.every((r) => r.link?.href === '/accounting/reports/year-end')).toBe(true)
    expect(rows[0]!.tone).toBe('soon')
    expect(rows[0]!.label).toContain('Feb 1, 2027')
    expect(rows[0]!.official?.href).toBe('https://www.irs.gov/instructions/i1099mec')
    expect(rows[1]!.tone).toBe('done')
    expect(rows[1]!.done?.evidence?.name).toBe('Filed 1120-H.pdf')
  })
  it('goes overdue the day after the 1099-NEC date', () => {
    const rows = buildComplianceOverview(input('GA', '2027-02-02')).groups[0]!.obligations
    expect(rows.find((r) => r.deadlineCode === 'federal-1099-nec-2026')?.tone).toBe('overdue')
  })
})
