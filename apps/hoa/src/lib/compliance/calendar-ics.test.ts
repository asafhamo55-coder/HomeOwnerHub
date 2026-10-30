import { describe, expect, it } from 'vitest'
import { buildIcsCalendar } from '../ics'
import type { InsurancePolicy } from '../insurance/model'
import { buildComplianceIcs, complianceCalendarEvents } from './calendar-ics'

const NOW = new Date('2026-10-30T12:00:00Z')
const assoc = { id: 'a1', name: 'Oak Hollow', state: 'GA', governingLawState: null }
const policy = (over: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  id: 'p1',
  associationId: 'a1',
  kind: 'liability',
  carrier: 'Acme',
  policyNumber: 'PN-998877',
  coverageLimitCents: null,
  deductibleCents: null,
  premiumCents: null,
  effectiveOn: null,
  expiresOn: '2027-03-15',
  documentId: null,
  notes: null,
  ...over,
})
const base = { orgId: 'org-1', associations: [assoc], policies: [policy()], today: '2026-10-30', now: NOW }

describe('complianceCalendarEvents', () => {
  it('includes state, federal and policy events inside 12 months only', () => {
    const ev = complianceCalendarEvents({ ...base, policies: [policy(), policy({ id: 'p2', expiresOn: '2028-01-01' }), policy({ id: 'p3', expiresOn: '2026-10-01' })] })
    const titles = ev.map((e) => e.summary)
    expect(titles.some((t) => t.includes('Georgia Secretary of State'))).toBe(true)
    expect(titles.some((t) => /1099|1120/.test(t))).toBe(true)
    expect(titles.filter((t) => t.startsWith('Insurance renewal'))).toEqual(['Insurance renewal: General liability'])
    expect(ev.every((e) => e.date >= '2026-10-30' && e.date <= '2027-10-30')).toBe(true)
  })

  it('has stable, unique UIDs on the homeownerledger.com domain', () => {
    const a = complianceCalendarEvents(base).map((e) => e.uid)
    expect(complianceCalendarEvents(base).map((e) => e.uid)).toEqual(a)
    expect(new Set(a).size).toBe(a.length)
    expect(a.every((u) => u.startsWith('org-1-') && u.endsWith('@homeownerledger.com'))).toBe(true)
  })

  it('skips a policy tied to an association outside the org', () => {
    const ev = complianceCalendarEvents({ ...base, policies: [policy({ associationId: 'other' })] })
    expect(ev.some((e) => e.summary.startsWith('Insurance'))).toBe(false)
  })
})

describe('buildComplianceIcs', () => {
  const ics = buildComplianceIcs(base)

  it('writes all-day dates', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20270315')
    expect(ics).toContain('DTEND;VALUE=DATE:20270316')
    expect(ics).toContain('PRODID:-//HomeownerHub//Compliance deadlines//EN')
  })

  it('never carries a policy number or carrier', () => {
    expect(ics).not.toContain('PN-998877')
    expect(ics).not.toContain('Acme')
  })
})

describe('buildIcsCalendar escaping', () => {
  it('escapes commas and semicolons', () => {
    const out = buildIcsCalendar([{ uid: 'u@x', summary: 'Pay, file; done', date: '2026-11-01', now: NOW }])
    expect(out).toContain('SUMMARY:Pay\\, file\\; done')
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  })
})
