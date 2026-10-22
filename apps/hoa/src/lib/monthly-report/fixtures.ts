// Fixtures for the month-end board report's tests and the preview file
// (render.test.ts). Fictional data only.
import type { MonthlyReportData } from './model'

export const SEPT_PERIOD = { start: '2026-09-01', end: '2026-09-30', after: '2026-10-01', label: 'September 2026' }

export function reportFixture(over: Partial<MonthlyReportData> = {}): MonthlyReportData {
  return {
    associationName: 'Maple Creek HOA',
    period: SEPT_PERIOD,
    cash: { ok: true, data: { operating: 48_210.5, reserve: 120_000 } },
    reserves: {
      ok: true,
      data: {
        result: {
          kind: 'ready',
          snapshot: {
            funds: [{ id: 'fund-res', name: 'Reserve Fund' }],
            asOf: '2026-09-30',
            year: { start: '2026-01-01', end: '2026-12-31' },
            balance: 121_480.4,
            contributionsYtd: 13_500,
            interestYtd: 210.4,
            drawsYtd: 6_000,
            budget: { annual: 24_000, ytd: 17_950.68, source: 'reserve_fund' },
            behindBudget: true,
          },
        },
        hint: null,
      },
    },
    income: { ok: true, data: { totalIncome: 31_500, totalExpenses: 27_940.12, netIncome: 3_559.88 } },
    collections: { ok: true, data: { billed: 30_000, collected: 27_450 } },
    delinquency: { ok: true, data: { total: 6_420, units: 7, over90: 2_100 } },
    budget: {
      ok: true,
      data: {
        hasBudget: true,
        top: [
          { accountName: 'Landscaping', accountType: 'expense', budgeted: 12_000, actual: 14_350, variance: -2_350 },
          { accountName: 'Assessment income', accountType: 'income', budgeted: 270_000, actual: 271_200, variance: 1_200 },
          { accountName: 'Insurance', accountType: 'expense', budgeted: 9_000, actual: 8_400, variance: 600 },
        ],
      },
    },
    violations: { ok: true, data: { opened: 4, closed: 3, pastCure: 2 } },
    arc: { ok: true, data: { submitted: 3, approved: 2, denied: 1 } },
    approvals: { ok: true, data: 5 },
    meeting: { ok: true, data: { id: 'mtg-1', meeting_date: '2026-10-14', meeting_type: 'regular' } },
    compliance: {
      ok: true,
      data: {
        open: 2,
        overdue: 0,
        done: 1,
        next: { title: 'Register with the Georgia Secretary of State', label: 'Takes effect in 92 days (Jan 1, 2027)', associationName: 'Maple Creek HOA' },
        nothingTracked: false,
        election: { title: 'Director election at the Jan 15, 2027 annual meeting', label: 'Send the annual meeting notice by Dec 25, 2026' },
      },
    },
    ...over,
  }
}
