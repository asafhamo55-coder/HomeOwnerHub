import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb, type FakeCall } from '@/lib/supabase/capped-fake-db'

/**
 * BL-047 for the two server actions that WRITE a number computed from the
 * ledger: closing a period posts closing JEs sized from every income and
 * expense line, and a bank reconciliation stores the ledger cash balance.
 * A read capped at PostgREST's 1000 rows would post or store a wrong
 * amount; a failed page must refuse, not write a partial figure.
 */
let db: SupabaseClient
const postJournalEntry = vi.fn(async (_db: unknown, _je: { lines: { debit: number; credit: number }[] }) => ({
  ok: true as const,
  journalEntryId: 'je-closing',
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/accounting/guard', () => ({ requireBoardOrAdminForAction: async () => ({ ok: true }) }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1', name: 'Test' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ postJournalEntry }))

const { closePeriod } = await import('./periods')
const { reconcileBankAccount } = await import('./bank-reconciliation')

const A = 'assoc-1'
const PERIOD = '33333333-3333-4333-8333-333333333333'
const BANK = '44444444-4444-4444-8444-444444444444'
const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`

// 1300 posted JEs: Dr Cash 10 / Cr Dues income 10, all in the period.
const jes = Array.from({ length: 1300 }, (_, i) => ({
  id: id('je', i),
  association_id: A,
  status: 'posted',
  fiscal_period_id: PERIOD,
  entry_date: '2026-09-15',
}))
const lines = jes.flatMap((je, i) => [
  {
    id: id('la', i),
    journal_entry_id: je.id,
    account_id: 'cash',
    fund_id: 'fund-op',
    debit_amount: 10,
    credit_amount: 0,
    account: { account_number: '1010', account_name: 'Cash', account_type: 'asset' },
  },
  {
    id: id('lb', i),
    journal_entry_id: je.id,
    account_id: 'income',
    fund_id: 'fund-op',
    debit_amount: 0,
    credit_amount: 10,
    account: { account_number: '4000', account_name: 'Dues', account_type: 'income' },
  },
])
const tables = () => ({
  fiscal_periods: [
    { id: PERIOD, association_id: A, status: 'open', organization_id: 'org-1', start_date: '2026-09-01', end_date: '2026-09-30' },
  ],
  journal_entries: jes,
  ledger_entries: lines,
  chart_of_accounts: [
    { id: 'equity', association_id: A, account_type: 'equity', account_number: '3000', fund_id: 'fund-op' },
    { id: 'cash', association_id: A, account_type: 'asset', account_number: '1010', fund_id: 'fund-op' },
  ],
  bank_accounts: [{ id: BANK, organization_id: 'org-1', association_id: A, fund_id: 'fund-op' }],
  bank_reconciliations: [],
})

const periodStatusWrites = (calls: FakeCall[]) =>
  calls
    .filter((c) => c.table === 'fiscal_periods')
    .flatMap((c) => c.ops.filter((o) => o[0] === 'update').map((o) => (o[1] as { status: string }).status))

beforeEach(() => {
  postJournalEntry.mockClear()
})

describe('closePeriod', () => {
  it('closes income from every ledger line, not the first 1000', async () => {
    const fake = cappedFakeDb(tables())
    db = fake.db
    const r = await closePeriod({ periodId: PERIOD })
    expect(r).toEqual({ ok: true, closingJeIds: ['je-closing'], netIncome: 13_000 })
    const posted = postJournalEntry.mock.calls[0]![1]
    expect(posted.lines.reduce((s, l) => s + l.debit, 0)).toBe(13_000)
    expect(periodStatusWrites(fake.calls)).toEqual(['closing', 'closed'])
  })

  it('a failed page refuses, posts nothing and reopens the period', async () => {
    const fake = cappedFakeDb(tables(), { failAt: { table: 'journal_entries', from: 1000 } })
    db = fake.db
    const r = await closePeriod({ periodId: PERIOD })
    expect(r.ok).toBe(false)
    expect(postJournalEntry).not.toHaveBeenCalled()
    expect(periodStatusWrites(fake.calls)).toEqual(['closing', 'open'])
  })
})

describe('reconcileBankAccount', () => {
  const input = { bankAccountId: BANK, statementDate: '2026-09-30', statementBalance: 13_000 }

  it('stores the ledger cash balance over every posted JE', async () => {
    const fake = cappedFakeDb(tables())
    db = fake.db
    const r = await reconcileBankAccount(input)
    expect(r).toEqual({ ok: true, reconciliationId: 'bank_reconciliations-inserted', difference: 0 })
  })

  it('a failed page refuses instead of storing a partial balance', async () => {
    const fake = cappedFakeDb(tables(), { failAt: { table: 'journal_entries', from: 1000 } })
    db = fake.db
    const r = await reconcileBankAccount(input)
    expect(r.ok).toBe(false)
    expect(fake.calls.some((c) => c.table === 'bank_reconciliations' && c.ops.some((o) => o[0] === 'insert'))).toBe(false)
  })
})
