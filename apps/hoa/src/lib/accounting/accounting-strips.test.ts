import { describe, expect, it } from 'vitest'
import { bankSummaryTiles, needsReconciliation, type RecAccount } from './bank-summary'
import { cashOnHand, reportsSummaryTiles } from './reports-summary'

const TZ = 'America/New_York'
const TODAY = '2026-10-30'

const income = { totalIncome: 120000, totalExpenses: 90500.5, netIncome: 29499.5 }
const balance = {
  assets: [
    { accountId: 'a', accountNumber: '1010', accountName: 'Operating', accountType: 'asset' as const, balance: 40000.25 },
    { accountId: 'b', accountNumber: '1020', accountName: 'Reserve', accountType: 'asset' as const, balance: 100000 },
    { accountId: 'c', accountNumber: '1100', accountName: 'AR', accountType: 'asset' as const, balance: 5000 },
  ],
}
const period = { status: 'open', start_date: '2026-01-01', end_date: '2026-12-31' }

describe('reportsSummaryTiles', () => {
  it('shows the report functions figures exactly', () => {
    const t = reportsSummaryTiles({ income, balance, period })
    expect(t.map((x) => x.value)).toEqual(['$120,000.00', '$90,500.50', '$29,499.50', '$140,000.25', 'Open'])
    expect(cashOnHand(balance)).toBe(140000.25)
    expect(t[0]?.href).toBe('/accounting/reports/income-statement')
    expect(t[3]?.href).toBe('/accounting/reports/balance-sheet')
  })

  it('says Not available, never 0, when a source failed', () => {
    const t = reportsSummaryTiles({ income: null, balance: null, period })
    expect(t[0]?.value).toBeNull()
    expect(t[1]?.value).toBeNull()
    expect(t[2]?.value).toBeNull()
    expect(t[3]?.value).toBeNull()
    expect(t[4]?.value).toBe('Open')
    expect(t[0]?.unavailableHint).toBeUndefined()
  })

  it('treats a failed context as unknown everywhere', () => {
    const t = reportsSummaryTiles({ income: null, balance: null, period: undefined })
    expect(t.every((x) => x.value === null)).toBe(true)
  })

  it('names the missing period when there is none', () => {
    const t = reportsSummaryTiles({ income: null, balance, period: null })
    expect(t[0]?.value).toBeNull()
    expect(t[0]?.unavailableHint).toBe('No fiscal period yet')
    expect(t[3]?.value).toBe('$140,000.25')
  })
})

const acct = (o: Partial<RecAccount> = {}): RecAccount => ({
  id: 'x',
  is_active: true,
  plaid_item_id: 'item',
  current_balance: 100,
  last_synced_at: '2026-10-29T12:00:00Z',
  ...o,
})

describe('needsReconciliation', () => {
  it('flags an account never reconciled', () => {
    expect(needsReconciliation(acct(), null, TODAY, TZ)).toBe(true)
  })
  it('does not flag a recent reconciliation on a linked account, even after a newer sync', () => {
    expect(needsReconciliation(acct(), '2026-10-20T15:00:00Z', TODAY, TZ)).toBe(false)
  })
  it('flags a reconciliation more than 30 days old', () => {
    expect(needsReconciliation(acct(), '2026-09-29T15:00:00Z', TODAY, TZ)).toBe(true)
  })
  it('allows exactly 30 days', () => {
    expect(needsReconciliation(acct(), '2026-09-30T15:00:00Z', TODAY, TZ)).toBe(false)
  })
  it('flags a manual account reconciled before its latest statement import', () => {
    const manual = acct({ plaid_item_id: null, last_synced_at: '2026-10-25T12:00:00Z' })
    expect(needsReconciliation(manual, '2026-10-20T12:00:00Z', TODAY, TZ)).toBe(true)
    expect(needsReconciliation(manual, '2026-10-26T12:00:00Z', TODAY, TZ)).toBe(false)
  })
  it('never flags an inactive account', () => {
    expect(needsReconciliation(acct({ is_active: false }), null, TODAY, TZ)).toBe(false)
  })
})

describe('bankSummaryTiles', () => {
  const accounts = [
    acct({ id: 'a', current_balance: 1000.5 }),
    acct({ id: 'b', current_balance: '2000' }),
    acct({ id: 'c', current_balance: 999, is_active: false }),
  ]
  it('totals active accounts and counts those needing reconciliation', () => {
    const last = new Map([['a', '2026-10-20T15:00:00Z']])
    const t = bankSummaryTiles({ accounts, lastReconciled: last, unmatched: 4, today: TODAY, timeZone: TZ })
    expect(t.map((x) => x.value)).toEqual(['$3,000.50', '1', '4'])
    expect(t[2]?.href).toBe('/accounting/bank/queue')
  })
  it('shows Not available, never 0, for each failed source', () => {
    const t = bankSummaryTiles({ accounts: null, lastReconciled: null, unmatched: null, today: TODAY, timeZone: TZ })
    expect(t.map((x) => x.value)).toEqual([null, null, null])
  })
  it('keeps the reconcile count unknown when only the reconciliation read failed', () => {
    const t = bankSummaryTiles({ accounts, lastReconciled: null, unmatched: 0, today: TODAY, timeZone: TZ })
    expect(t.map((x) => x.value)).toEqual(['$3,000.50', null, '0'])
  })
})

describe('loadLastReconciled counts approved reconciliations only', async () => {
  const { vi } = await import('vitest')
  const { cappedFakeDb } = await import('@/lib/supabase/capped-fake-db')
  let db: unknown
  vi.doMock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
  const { loadLastReconciled } = await import('./last-reconciled')

  it('an account whose only reconciliation is unapproved still needs reconciling', async () => {
    ;({ db } = cappedFakeDb({
      bank_reconciliations: [
        { id: 'r1', bank_account_id: 'acct-1', reconciled_at: '2026-10-20T15:00:00Z', approved_at: null },
        { id: 'r2', bank_account_id: 'acct-2', reconciled_at: '2026-10-20T15:00:00Z', approved_at: '2026-10-21T15:00:00Z' },
      ],
    }))
    const last = await loadLastReconciled(['acct-1', 'acct-2'])
    expect(last.has('acct-1')).toBe(false)
    expect(needsReconciliation(acct(), last.get('acct-1') ?? null, TODAY, TZ)).toBe(true)
    expect(needsReconciliation(acct(), last.get('acct-2') ?? null, TODAY, TZ)).toBe(false)
  })
})
