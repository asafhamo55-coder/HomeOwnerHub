import { describe, expect, it } from 'vitest'
import type { BudgetSummary } from '@/lib/accounting/queries'
import type { PacketBudget } from '@/lib/board-packet/financials'
import type { InsurancePolicy } from '@/lib/insurance/model'
import { EMPTY_ELECTION, type Election } from '@/lib/elections/model'
import {
  EARLY_YEAR_DAYS,
  ownerAccountLabel,
  ownerCollections,
  ownerElections,
  ownerInsurance,
  ownerMeetings,
  ownerProjection,
  pickProjectionBudgets,
  reportWindow,
  sectionOf,
  withoutNames,
} from './model'
import { ANNUAL_REPORT_DRAFT_KEY, narrativeParagraphs, readAnnualReportDraft, writeAnnualReportDraft } from './message'

const FY26 = { start_date: '2026-01-01', end_date: '2026-12-31' }
const FY25 = { start_date: '2025-01-01', end_date: '2025-12-31' }

describe('reportWindow', () => {
  it('a year in progress is reported to date', () => {
    const w = reportWindow([FY25, FY26], '2026-10-21')
    expect(w).toMatchObject({ start: '2026-01-01', end: '2026-10-21', fiscalYearEnd: '2026-12-31', complete: false })
    expect(w.label).toBe('FY 2026, through Oct 21, 2026')
  })

  it(`within ${EARLY_YEAR_DAYS} days of a new year, the year just closed is reported in full`, () => {
    const w = reportWindow([FY25, FY26], '2026-01-20')
    expect(w).toMatchObject({ start: '2025-01-01', end: '2025-12-31', fiscalYearEnd: '2025-12-31', complete: true, label: 'FY 2025' })
  })

  it('early in the first year on record, there is no earlier year to fall back to', () => {
    expect(reportWindow([FY26], '2026-01-20')).toMatchObject({ start: '2026-01-01', end: '2026-01-20', complete: false })
  })

  it('a non-calendar fiscal year', () => {
    const w = reportWindow([{ start_date: '2026-07-01', end_date: '2027-06-30' }], '2026-11-15')
    expect(w).toMatchObject({ start: '2026-07-01', end: '2026-11-15', fiscalYearEnd: '2027-06-30' })
  })

  it('no fiscal period on record: the calendar year to date', () => {
    expect(reportWindow([], '2026-10-21')).toMatchObject({ start: '2026-01-01', end: '2026-10-21', fiscalYearEnd: '2026-12-31', complete: false })
  })
})

describe('sectionOf', () => {
  it('ok, failed and skipped', () => {
    expect(sectionOf({ ok: true, data: 2, count: null }, (n: number) => n * 2, 'why')).toEqual({ state: 'ok', data: 4 })
    expect(sectionOf<number, number>({ ok: false }, (n) => n, 'why')).toEqual({ state: 'failed' })
    expect(sectionOf<number, number>({ ok: false, skipped: true }, (n) => n, 'why')).toEqual({ state: 'none', why: 'why' })
  })
})

describe('ownerAccountLabel', () => {
  it('masks bank account and routing numbers, keeps years and words', () => {
    expect(ownerAccountLabel('Operating Checking ****4821')).toBe('Operating Checking ••••')
    expect(ownerAccountLabel('Reserve savings x4821')).toBe('Reserve savings ••••')
    expect(ownerAccountLabel('Money market ending in 4821')).toBe('Money market ••••')
    expect(ownerAccountLabel('Truist 021000021')).toBe('Truist ••••')
    expect(ownerAccountLabel('2026 Roof project')).toBe('2026 Roof project')
    expect(ownerAccountLabel('Landscaping')).toBe('Landscaping')
    expect(ownerAccountLabel('  ')).toBe('Account')
  })
})

const budget = (id: string, fund: string, start: string, end: string, status: string): BudgetSummary => ({
  id,
  status,
  approved_at: null,
  fund: { id: fund, code: fund, name: fund === 'op' ? 'Operating' : 'Reserve' },
  fiscalPeriod: { id: `p-${start}`, start_date: start, end_date: end },
  totalAmount: 0,
  lineItemCount: 0,
})

describe('pickProjectionBudgets', () => {
  it('next fiscal year only, one per fund, approved over draft', () => {
    const picked = pickProjectionBudgets(
      [
        budget('this', 'op', '2026-01-01', '2026-12-31', 'approved'),
        budget('draft', 'op', '2027-01-01', '2027-12-31', 'draft'),
        budget('adopted', 'op', '2027-01-01', '2027-12-31', 'approved'),
        budget('res', 'res', '2027-01-01', '2027-12-31', 'draft'),
        budget('later', 'op', '2028-01-01', '2028-12-31', 'approved'),
      ],
      '2026-12-31',
    )
    expect(picked.map((b) => b.id)).toEqual(['adopted', 'res'])
  })

  it('none drafted yet', () => {
    expect(pickProjectionBudgets([budget('this', 'op', '2026-01-01', '2026-12-31', 'approved')], '2026-12-31')).toEqual([])
  })
})

describe('ownerProjection', () => {
  it('totals by type, and this year’s budget for the same fund', () => {
    const current = [
      {
        budget: budget('this', 'op', '2026-01-01', '2026-12-31', 'approved'),
        report: { totals: { budgetedIncome: 100_000, budgetedExpense: 95_000 } },
      },
    ] as unknown as PacketBudget[]
    const [f] = ownerProjection(
      [
        {
          budget: {
            status: 'draft',
            fund: { id: 'op', code: 'op', name: 'Operating' },
            fiscalPeriod: { id: 'p', start_date: '2027-01-01', end_date: '2027-12-31' },
            lineItems: [
              { id: '1', accountId: 'a', accountNumber: '4000', accountName: 'Assessments', accountType: 'income', amount: 110_000, notes: 'vendor routing 021000021' },
              { id: '2', accountId: 'b', accountNumber: '6000', accountName: 'Landscaping', accountType: 'expense', amount: 40_000, notes: null },
              { id: '3', accountId: 'c', accountNumber: '6100', accountName: 'Insurance', accountType: 'expense', amount: 60_000, notes: null },
            ],
          },
        },
      ],
      current,
    )
    expect(f).toMatchObject({ fund: 'Operating', period: 'FY 2027', adopted: false, totalIncome: 110_000, totalExpenses: 100_000, net: 10_000, currentIncome: 100_000, currentExpenses: 95_000 })
    expect(JSON.stringify(f)).not.toContain('021000021')
  })
})

describe('ownerCollections', () => {
  it('keeps totals and counts, drops every home', () => {
    const c = ownerCollections(
      {
        asOf: '2026-10-22',
        totalOverdue: 1500,
        unitCount: 2,
        chargeCount: 3,
        aging: { d1_30: 500, d31_60: 0, d61_90: 0, d90_plus: 1000 },
        units: [{ key: 'u1', label: 'Unit 4B · 12 Demo Way', amount: 1000, charges: 2, oldestDue: '2026-05-01', daysOverdue: 170 }],
      },
      '2026-10-21',
    )
    expect(c).toEqual({ asOf: '2026-10-21', totalOverdue: 1500, homesBehind: 2, charges: 3, aging: { d1_30: 500, d31_60: 0, d61_90: 0, d90_plus: 1000 } })
    expect(Object.keys(c)).not.toContain('units')
  })
})

describe('ownerInsurance', () => {
  const policy = (over: Partial<InsurancePolicy>): InsurancePolicy => ({
    id: 'p1',
    associationId: null,
    kind: 'property',
    carrier: 'Acme Mutual',
    policyNumber: 'POL-998877',
    coverageLimitCents: 500_000_000,
    deductibleCents: 2_500_000,
    premiumCents: 1_234_567,
    effectiveOn: '2026-01-01',
    expiresOn: '2027-01-01',
    documentId: 'doc-1',
    notes: 'agent Jane Roe 555-0100',
    ...over,
  })

  it('in-force policies, owner columns only, in kind order', () => {
    const out = ownerInsurance([policy({ id: 'd', kind: 'directors_officers', carrier: 'Board Co' }), policy({}), policy({ id: 'old', expiresOn: '2026-01-01' })], '2026-10-21')
    expect(out.map((p) => p.kind)).toEqual(['Master / property', 'Directors & officers (D&O)'])
    expect(Object.keys(out[0]!).sort()).toEqual(['deductibleCents', 'inForceUntil', 'insurer', 'kind', 'limitCents'])
    const json = JSON.stringify(out)
    for (const bad of ['POL-998877', '1234567', 'Jane Roe', '555-0100', 'doc-1']) expect(json).not.toContain(bad)
  })
})

describe('ownerMeetings', () => {
  const rows = [
    {
      id: 'm1',
      meeting_date: '2026-03-10',
      meeting_type: 'regular',
      status: 'approved',
      motions: [
        { text: 'Approve the pool contract', result: 'passed', moved_by: 'Carol Mover' },
        { text: 'Raise dues by 20%', result: 'failed' },
      ],
      ai_summary: null,
    },
    { id: 'm2', meeting_date: '2026-05-10', meeting_type: 'regular', status: 'draft', motions: [{ text: 'Fine the owner at 12 Demo Way', result: 'passed' }], ai_summary: null },
    {
      id: 'm3',
      meeting_date: '2026-06-10',
      meeting_type: 'special',
      status: 'approved',
      motions: null,
      ai_summary: 'Decisions:\n- Motion by Carol Mover, seconded by Dan Second, to repave the lot. Passed 5-0.',
    },
    { id: 'm0', meeting_date: '2025-12-01', meeting_type: 'regular', status: 'approved', motions: [{ text: 'Old motion', result: 'passed' }], ai_summary: null },
  ]

  it('meetings in the window; passed motions from approved minutes; no names', () => {
    const out = ownerMeetings(rows, { start: '2026-01-01' }, '2026-10-21')
    expect(out.meetings).toEqual([
      { date: '2026-03-10', type: 'Regular meeting' },
      { date: '2026-05-10', type: 'Regular meeting' },
      { date: '2026-06-10', type: 'Special meeting' },
    ])
    expect(out.motions.map((m) => m.text)).toEqual(['Approve the pool contract', 'Motion by a director, seconded by a director, to repave the lot. Passed 5-0.'])
    const json = JSON.stringify(out)
    for (const bad of ['Carol Mover', 'Dan Second', '12 Demo Way', 'Raise dues', 'Old motion']) expect(json).not.toContain(bad)
  })

  it('withoutNames leaves text alone when no name was found', () => {
    expect(withoutNames('Approve the budget', [null, null])).toBe('Approve the budget')
  })
})

describe('ownerElections', () => {
  const election = (over: Partial<Election>): Election => ({ ...EMPTY_ELECTION, inspectors: [], candidates: [], ...over })
  const cand = (id: string, name: string, votes: number | null) => ({ id, name, propertyId: `prop-${id}`, nominatedOn: null, onBallot: true, votes })

  it('elected names once results are recorded; never the others or their homes', () => {
    const out = ownerElections([
      {
        meetingDate: '2026-11-12',
        election: election({ seats: 1, resultsAnnouncedOn: '2026-11-12', candidates: [cand('a', 'Alice Winner', 40), cand('b', 'Bob Loser', 12)], inspectors: ['Ida Inspector'] }),
      },
    ])
    expect(out).toEqual([{ meetingDate: '2026-11-12', seats: 1, state: 'results', resultsOn: '2026-11-12', elected: ['Alice Winner'] }])
    const json = JSON.stringify(out)
    for (const bad of ['Bob Loser', 'prop-a', 'prop-b', 'Ida Inspector']) expect(json).not.toContain(bad)
  })

  it('a tie at the last seat names no one; no results yet is "planned"', () => {
    const tie = ownerElections([{ meetingDate: '2026-11-12', election: election({ seats: 1, resultsAnnouncedOn: '2026-11-12', candidates: [cand('a', 'A', 10), cand('b', 'B', 10)] }) }])
    expect(tie[0]).toMatchObject({ state: 'tie', elected: [] })
    const planned = ownerElections([{ meetingDate: '2026-11-12', election: election({ seats: 2, candidates: [cand('a', 'A', null)] }) }])
    expect(planned[0]).toMatchObject({ state: 'planned', elected: [], resultsOn: null })
    expect(ownerElections([{ meetingDate: '2026-11-12', election: election({}) }])).toEqual([])
  })
})

describe('message hand-off', () => {
  it('round-trips through storage, and refuses junk', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(writeAnnualReportDraft(storage, { subject: 'S', bodyHtml: '<p>B</p>' })).toBe(true)
    expect(readAnnualReportDraft(storage)).toEqual({ subject: 'S', bodyHtml: '<p>B</p>' })
    store.set(ANNUAL_REPORT_DRAFT_KEY, '{"subject":""}')
    expect(readAnnualReportDraft(storage)).toBeNull()
    expect(writeAnnualReportDraft(null, { subject: 'S', bodyHtml: 'B' })).toBe(false)
    const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readAnnualReportDraft(throwing)).toBeNull()
    expect(writeAnnualReportDraft(throwing, { subject: 'S', bodyHtml: 'B' })).toBe(false)
  })

  it('narrative paragraphs', () => {
    expect(narrativeParagraphs('One\nline.\n\n\nTwo.  ')).toEqual(['One line.', 'Two.'])
    expect(narrativeParagraphs(null)).toEqual([])
  })
})
