import { describe, expect, it } from 'vitest'
import {
  approvalsWaiting,
  cashPosition,
  summarizeArc,
  summarizeCollections,
  summarizeViolations,
  topVariances,
} from './model'
import type { BalanceSheet, BudgetVsActual } from '@/lib/accounting/queries'
import type { PacketBudget } from '@/lib/board-packet/financials'

const SEPT = { start: '2026-09-01', end: '2026-09-30', after: '2026-10-01', label: 'September 2026' }
const NY = 'America/New_York'
const LA = 'America/Los_Angeles'

describe('cashPosition', () => {
  it('reads the operating and reserve cash accounts from the balance sheet', () => {
    const sheet = {
      assets: [
        { accountNumber: '1010', balance: 48_210.5 },
        { accountNumber: '1020', balance: 120_000 },
        { accountNumber: '1200', balance: 9_000 },
      ],
    } as unknown as BalanceSheet
    expect(cashPosition(sheet)).toEqual({ operating: 48_210.5, reserve: 120_000 })
  })

  it('says "no such account" (null), not zero, when the chart lacks one', () => {
    expect(cashPosition({ assets: [] } as unknown as BalanceSheet)).toEqual({ operating: null, reserve: null })
  })
})

describe('summarizeCollections — on the association\'s days', () => {
  it('bills charges due in the month and collects payments received in it', () => {
    const out = summarizeCollections(
      [
        { amount: 300, due_date: '2026-09-01' },
        { amount: '300', due_date: '2026-09-30' },
        { amount: 300, due_date: '2026-10-01' },
        { amount: 300, due_date: '2026-08-31' },
      ],
      [
        { amount: 250, paid_at: '2026-09-15T15:00:00Z' },
        // 9:30pm Sep 30 in New York is already Oct 1 UTC — still September.
        { amount: 100, paid_at: '2026-10-01T01:30:00Z' },
        // 1am Sep 1 UTC is still Aug 31 in New York.
        { amount: 75, paid_at: '2026-09-01T01:00:00Z' },
      ],
      SEPT,
      NY,
    )
    expect(out).toEqual({ billed: 600, collected: 350 })
  })
})

describe('summarizeViolations', () => {
  const v = (over: Partial<Parameters<typeof summarizeViolations>[0][number]>) => ({
    status: 'open',
    created_at: '2026-08-01T12:00:00Z',
    resolved_at: null,
    notice_sent_at: null,
    cure_period_days: null,
    ...over,
  })

  it('counts opened and closed in the month, and past cure at its close', () => {
    const out = summarizeViolations(
      [
        v({ created_at: '2026-09-03T12:00:00Z' }), // opened
        v({ created_at: '2026-10-02T12:00:00Z' }), // after the month
        v({ status: 'resolved', resolved_at: '2026-09-20T12:00:00Z' }), // closed
        // Past cure: notice Aug 1 + 14 days, still open.
        v({ notice_sent_at: '2026-08-01T12:00:00Z', cure_period_days: 14 }),
        // Cure ends after the month: not past cure at its close.
        v({ notice_sent_at: '2026-09-25T12:00:00Z', cure_period_days: 14 }),
        // Resolved in October, but was past cure and open on Sep 30.
        v({ status: 'cured', resolved_at: '2026-10-05T12:00:00Z', notice_sent_at: '2026-08-01T12:00:00Z', cure_period_days: 10 }),
        // Closed with no date: never counted as open then.
        v({ status: 'waived', notice_sent_at: '2026-08-01T12:00:00Z', cure_period_days: 10 }),
      ],
      SEPT,
      NY,
    )
    expect(out).toEqual({ opened: 1, closed: 1, pastCure: 2 })
  })

  it("places a late-evening violation on the association's day", () => {
    // 10pm Sep 30 in LA = 05:00Z Oct 1.
    expect(summarizeViolations([v({ created_at: '2026-10-01T05:00:00Z' })], SEPT, LA).opened).toBe(1)
    expect(summarizeViolations([v({ created_at: '2026-10-01T05:00:00Z' })], SEPT, NY).opened).toBe(0)
  })
})

describe('summarizeArc', () => {
  it('counts submissions and board decisions made in the month', () => {
    expect(
      summarizeArc(
        [
          { status: 'submitted', submitted_at: '2026-09-02T12:00:00Z', board_response_at: null },
          { status: 'approved', submitted_at: '2026-08-20T12:00:00Z', board_response_at: '2026-09-05T12:00:00Z' },
          { status: 'denied', submitted_at: '2026-09-01T12:00:00Z', board_response_at: '2026-09-28T12:00:00Z' },
          { status: 'approved', submitted_at: '2026-08-01T12:00:00Z', board_response_at: '2026-08-15T12:00:00Z' },
        ],
        SEPT,
        NY,
      ),
    ).toEqual({ submitted: 2, approved: 1, denied: 1 })
  })
})

describe('topVariances', () => {
  const report = (rows: Partial<BudgetVsActual['rows'][number]>[]): PacketBudget =>
    ({ budget: { id: 'b' }, report: { rows } }) as unknown as PacketBudget

  it('returns the lines furthest from budget, either direction, largest first', () => {
    const out = topVariances([
      report([
        { accountName: 'Landscaping', accountType: 'expense', budgeted: 1000, actual: 1800, variance: -800 },
        { accountName: 'Dues', accountType: 'income', budgeted: 10000, actual: 10500, variance: 500 },
        { accountName: 'Water', accountType: 'expense', budgeted: 400, actual: 400, variance: 0 },
        { accountName: 'Insurance', accountType: 'expense', budgeted: 900, actual: 800, variance: 100 },
        { accountName: 'Legal', accountType: 'expense', budgeted: 0, actual: 50, variance: -50 },
      ]),
    ])
    expect(out.hasBudget).toBe(true)
    expect(out.top.map((r) => r.accountName)).toEqual(['Landscaping', 'Dues', 'Insurance'])
  })

  it('says there is no budget rather than "no variances" when none covers the month', () => {
    expect(topVariances([])).toEqual({ hasBudget: false, top: [] })
  })
})

describe('approvalsWaiting', () => {
  it('sums every source', () => {
    expect(approvalsWaiting({ w18: 2, bill: 1, w3: 0, arc: 0, vendor: 3 })).toEqual({ ok: true, data: 6 })
  })

  it('is unknown — not a lower number — when any source failed', () => {
    expect(approvalsWaiting({ w18: 2, bill: null, w3: 0, arc: 0, vendor: 3 })).toEqual({ ok: false })
  })
})
