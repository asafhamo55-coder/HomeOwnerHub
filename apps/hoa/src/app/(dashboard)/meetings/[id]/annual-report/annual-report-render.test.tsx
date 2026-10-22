import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BalanceSheet, IncomeStatement, ReportLineRow } from '@/lib/accounting/queries'
import type { PacketBudget } from '@/lib/board-packet/financials'
import type { ComplianceOverview } from '@/lib/compliance/obligations'
import { EMPTY_ELECTION } from '@/lib/elections/model'
import { annualReportJurisdiction } from '@/lib/annual-report/law'
import { annualReportMessage } from '@/lib/annual-report/message'
import {
  ownerBalance,
  ownerBudgets,
  ownerCollections,
  ownerCompliance,
  ownerElections,
  ownerIncome,
  ownerInsurance,
  ownerMeetings,
  ownerProjection,
  ownerReserves,
  reportWindow,
  type AnnualReport,
} from '@/lib/annual-report/model'
import { AnnualReportView } from './AnnualReportView'

;(globalThis as { React?: typeof React }).React = React

/**
 * BL-153: the owner report must never carry per-home data or PII. Every
 * source below is seeded with what the board packet and the kits hold —
 * homes, addresses, owner names and emails, per-home balances, the losing
 * candidates and their homes, who moved a motion, the insurance premium,
 * policy number and notes, bank and routing numbers in account names and
 * budget notes, evidence file names — and the rendered page and the owner
 * message are searched for every one of them.
 */

const POISON = [
  // homes and owners (delinquency, violations, election candidates)
  'Unit 4B',
  '12 Demo Way',
  '77 Peach St',
  'Olivia Owner',
  'olivia@example.com',
  '404-555-0199',
  'prop-11111111',
  'prop-22222222',
  // a per-home balance only the packet shows
  '$1,234.56',
  '1234.56',
  // election
  'Bob Loser',
  'Ida Inspector',
  // motions
  'Carol Mover',
  'Dan Second',
  'Fine the owner',
  // insurance (BL-142 board-only columns)
  'POL-998877',
  '$12,345.67',
  'Jane Roe',
  '555-0100',
  'doc-secret',
  // bank / vendor details
  '4821',
  '021000021',
  '987654321',
  'Lawn Pros LLC',
  // compliance evidence
  'evidence-scan.pdf',
]

const line = (accountName: string, balance: number, accountNumber = '1000'): ReportLineRow => ({
  accountId: `acct-${accountName}`,
  accountNumber,
  accountName,
  accountType: 'asset',
  balance,
})

function buildReport(state: string): AnnualReport {
  const window = reportWindow([{ start_date: '2026-01-01', end_date: '2026-12-31' }], '2026-10-21')
  const income: IncomeStatement = {
    periodId: 'p',
    startDate: '2026-01-01',
    endDate: '2026-10-21',
    basis: 'accrual',
    income: [line('Assessments', 120_000, '4000')],
    expenses: [line('Landscaping (vendor ACH 987654321)', 30_000, '6000'), line('Insurance', 20_000, '6100')],
    totalIncome: 120_000,
    totalExpenses: 50_000,
    netIncome: 70_000,
  }
  const balance: BalanceSheet = {
    asOfDate: '2026-10-21',
    assets: [line('Operating Checking ****4821', 80_000), line('Reserve savings routing 021000021', 150_000), line('Accounts receivable', 3_000)],
    liabilities: [line('Prepaid assessments', 5_000, '2000')],
    equity: [line('Fund balance', 158_000, '3000')],
    netIncomePtd: 70_000,
    totalAssets: 233_000,
    totalLiabilities: 5_000,
    totalEquity: 228_000,
    isBalanced: true,
  }
  const budgets = [
    {
      budget: { id: 'b26', status: 'approved', approved_at: null, fund: { id: 'op', code: 'OP', name: 'Operating' }, fiscalPeriod: { id: 'p', start_date: '2026-01-01', end_date: '2026-12-31' }, totalAmount: 0, lineItemCount: 0 },
      report: {
        budgetId: 'b26',
        fundCode: 'OP',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        actualsThrough: '2026-10-21',
        rows: [
          { accountId: 'a', accountNumber: '4000', accountName: 'Assessments', accountType: 'income', budgeted: 144_000, actual: 120_000, variance: -24_000 },
          { accountId: 'b', accountNumber: '6000', accountName: 'Landscaping', accountType: 'expense', budgeted: 36_000, actual: 30_000, variance: 6_000 },
        ],
        totals: { budgetedIncome: 144_000, actualIncome: 120_000, budgetedExpense: 36_000, actualExpense: 30_000, budgetedNet: 108_000, actualNet: 90_000, varianceNet: -18_000 },
      },
    },
  ] as PacketBudget[]

  const compliance = {
    groups: [
      {
        associationId: 'assoc',
        associationName: 'Peachtree Commons HOA',
        state: 'GA',
        obligations: [
          {
            key: 'k',
            associationId: 'assoc',
            associationName: 'Peachtree Commons HOA',
            kind: 'annual_meeting',
            title: 'Hold the annual meeting',
            tone: 'done',
            label: 'Held Nov 12, 2025',
            dueOn: null,
            steps: ['Call Olivia Owner at 404-555-0199'],
            quotes: [],
            appliesTo: null,
            link: null,
            official: null,
            deadlineCode: null,
            done: { doneAt: '2025-11-12', evidence: { documentId: 'doc-secret', name: 'evidence-scan.pdf' } },
          },
        ],
      },
    ],
    overdue: [],
  } as unknown as ComplianceOverview

  const cand = (id: string, name: string, propertyId: string, votes: number) => ({ id, name, propertyId, nominatedOn: '2026-10-01', onBallot: true, votes })

  return {
    associationName: 'Peachtree Commons HOA',
    jurisdiction: annualReportJurisdiction(state),
    meeting: { date: '2026-11-12', type: 'Annual meeting', annual: true },
    preparedOn: '2026-10-21',
    window,
    income: { state: 'ok', data: ownerIncome(income) },
    budget: { state: 'ok', data: ownerBudgets(budgets) },
    balance: { state: 'ok', data: ownerBalance(balance) },
    reserves: {
      state: 'ok',
      data: ownerReserves({
        kind: 'ready',
        snapshot: {
          funds: [{ id: 'r', name: 'Reserve' }],
          asOf: '2026-10-21',
          year: { start: '2026-01-01', end: '2026-12-31' },
          balance: 150_000,
          contributionsYtd: 20_000,
          interestYtd: 900,
          drawsYtd: 5_000,
          budget: { annual: 24_000, ytd: 19_500, source: 'reserve_fund' },
          behindBudget: false,
        },
      }),
    },
    projection: {
      state: 'ok',
      data: ownerProjection(
        [
          {
            budget: {
              status: 'draft',
              fund: { id: 'op', code: 'OP', name: 'Operating' },
              fiscalPeriod: { id: 'p27', start_date: '2027-01-01', end_date: '2027-12-31' },
              lineItems: [
                { id: '1', accountId: 'a', accountNumber: '4000', accountName: 'Assessments', accountType: 'income', amount: 150_000, notes: 'Pay Lawn Pros LLC to 021000021' },
                { id: '2', accountId: 'b', accountNumber: '6000', accountName: 'Landscaping', accountType: 'expense', amount: 38_000, notes: null },
              ],
            },
          },
        ],
        budgets,
      ),
    },
    collections: {
      state: 'ok',
      data: ownerCollections(
        {
          asOf: '2026-10-22',
          totalOverdue: 4_000,
          unitCount: 2,
          chargeCount: 5,
          aging: { d1_30: 1_000, d31_60: 500, d61_90: 500, d90_plus: 2_000 },
          units: [
            { key: 'u1', label: 'Unit 4B · 12 Demo Way', amount: 1234.56, charges: 3, oldestDue: '2026-04-01', daysOverdue: 200 },
            { key: 'u2', label: '77 Peach St', amount: 2765.44, charges: 2, oldestDue: '2026-08-01', daysOverdue: 80 },
          ],
        },
        '2026-10-21',
      ),
    },
    insurance: {
      state: 'ok',
      data: ownerInsurance(
        [
          {
            id: 'p1',
            associationId: 'assoc',
            kind: 'property',
            carrier: 'Acme Mutual',
            policyNumber: 'POL-998877',
            coverageLimitCents: 500_000_000,
            deductibleCents: 2_500_000,
            premiumCents: 1_234_567,
            effectiveOn: '2026-01-01',
            expiresOn: '2027-01-01',
            documentId: 'doc-secret',
            notes: 'agent Jane Roe 555-0100',
          },
        ],
        '2026-10-21',
      ),
    },
    compliance: { state: 'ok', data: ownerCompliance(compliance, 'assoc') },
    meetings: {
      state: 'ok',
      data: ownerMeetings(
        [
          {
            id: 'm1',
            meeting_date: '2026-03-10',
            meeting_type: 'regular',
            status: 'approved',
            motions: [{ text: 'Approve the pool contract', result: 'passed', moved_by: 'Carol Mover', seconded_by: 'Dan Second' }],
            ai_summary: null,
          },
          {
            id: 'm2',
            meeting_date: '2026-04-10',
            meeting_type: 'regular',
            status: 'approved',
            motions: null,
            ai_summary: 'Decisions:\n- Motion by Carol Mover, seconded by Dan Second, to repave the lot. Passed 5-0.',
          },
          { id: 'm3', meeting_date: '2026-05-10', meeting_type: 'regular', status: 'draft', motions: [{ text: 'Fine the owner at 12 Demo Way', result: 'passed' }], ai_summary: null },
        ],
        window,
        '2026-10-21',
      ),
    },
    elections: {
      state: 'ok',
      data: ownerElections([
        {
          meetingDate: '2026-11-12',
          election: {
            ...EMPTY_ELECTION,
            seats: 1,
            resultsAnnouncedOn: '2026-11-12',
            inspectors: ['Ida Inspector'],
            candidates: [cand('a', 'Alice Winner', 'prop-11111111', 40), cand('b', 'Bob Loser', 'prop-22222222', 12)],
          },
        },
      ]),
    },
  }
}

const NARRATIVE = 'We repaved the lot and kept dues flat.\n\nThank you to every volunteer.'

function renderAll(state: string): { page: string; message: string; model: string } {
  const report = buildReport(state)
  const page = renderToStaticMarkup(<AnnualReportView report={report} boardMessage={<p>{NARRATIVE}</p>} />)
  const message = annualReportMessage(report, NARRATIVE).bodyHtml
  return { page, message, model: JSON.stringify(report) }
}

describe('owner annual report: no per-home data or PII in the rendered output', () => {
  for (const state of ['GA', 'FL']) {
    const out = renderAll(state)
    for (const [where, text] of Object.entries(out)) {
      it(`${state} ${where}: none of the board-only values appear`, () => {
        const found = POISON.filter((p) => text.includes(p))
        expect(found).toEqual([])
      })
    }
  }

  it('the model carries no per-home or board-only field names', () => {
    const keys = new Set<string>()
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk)
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (keys.add(k), walk(x))
    }
    walk(buildReport('GA'))
    for (const bad of [
      'units',
      'unit',
      'unitId',
      'propertyId',
      'address',
      'owner',
      'owners',
      'email',
      'phone',
      'premiumCents',
      'policyNumber',
      'notes',
      'documentId',
      'evidence',
      'candidates',
      'inspectors',
      'movedBy',
      'secondedBy',
      'votes',
      'steps',
      'accountNumber',
      'accountId',
    ]) {
      expect(keys.has(bad), bad).toBe(false)
    }
  })

  it('shows what owners should see', () => {
    const { page, message } = renderAll('GA')
    for (const text of [page, message]) {
      expect(text).toContain('Alice Winner')
      expect(text).toContain('Approve the pool contract')
      expect(text).toContain('Acme Mutual')
      expect(text).toContain('$4,000') // overdue, in total
      expect(text).toContain('Operating')
    }
    expect(page).toContain('Operating Checking ••••')
    expect(page).toContain('Motion by a director, seconded by a director, to repave the lot. Passed 5-0.')
    expect(page).toContain('We repaved the lot')
    expect(message).toContain('We repaved the lot')
  })
})

describe('statute wording', () => {
  const quote = 'comprehensive reports of the affairs, finances, and budget projections of the association shall be made to the lot owners'

  it('Georgia: § 44-3-230(a) quoted on the page and in the message', () => {
    const { page, message } = renderAll('GA')
    expect(page).toContain(quote)
    expect(page).toContain('O.C.G.A. § 44-3-230(a)')
    expect(message).toContain(quote)
  })

  it('other states: the same report, no Georgia wording', () => {
    for (const state of ['FL', 'CA', 'TX']) {
      const { page, message } = renderAll(state)
      for (const text of [page, message]) {
        expect(text).not.toContain(quote)
        expect(text).not.toMatch(/Georgia|O\.C\.G\.A\.|44-3-/)
        expect(text).toContain('Acme Mutual')
      }
      expect(page).toContain('Budget projection for next year')
    }
  })
})
