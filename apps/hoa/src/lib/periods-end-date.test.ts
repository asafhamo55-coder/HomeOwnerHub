import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb, type FakeCall } from '@/lib/supabase/capped-fake-db'

// A period can only be closed once its end date is behind today in the
// association's time zone. Today is pinned through the mocked todayIn.
let db: SupabaseClient
let today = '2026-09-30'
const todayIn = vi.fn((_tz: string) => today)
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/accounting/guard', () => ({ requireBoardOrAdminForAction: async () => ({ ok: true }) }))
vi.mock('@/lib/vendors', () => ({
  getPrimaryAssociation: async () => ({ id: 'assoc-1', name: 'Test', timeZone: 'America/New_York' }),
}))
vi.mock('@/lib/association-time', async (orig) => ({
  ...(await orig<typeof import('@/lib/association-time')>()),
  todayIn: (tz: string) => todayIn(tz),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ postJournalEntry: vi.fn(async () => ({ ok: true, journalEntryId: 'je' })) }))

const { closePeriod } = await import('./periods')

const PERIOD = '33333333-3333-4333-8333-333333333333'
const tables = () => ({
  fiscal_periods: [
    { id: PERIOD, association_id: 'assoc-1', status: 'open', organization_id: 'org-1', start_date: '2026-09-01', end_date: '2026-09-30' },
  ],
  journal_entries: [],
  ledger_entries: [],
  chart_of_accounts: [],
})
const statusWrites = (calls: FakeCall[]) =>
  calls
    .filter((c) => c.table === 'fiscal_periods')
    .flatMap((c) => c.ops.filter((o) => o[0] === 'update').map((o) => (o[1] as { status: string }).status))

beforeEach(() => {
  todayIn.mockClear()
})

describe('closePeriod end-date check', () => {
  it('refuses on the end date itself and writes nothing', async () => {
    today = '2026-09-30'
    const fake = cappedFakeDb(tables())
    db = fake.db
    const r = await closePeriod({ periodId: PERIOD })
    expect(r).toEqual({
      ok: false,
      error: "This period hasn't ended yet. You can close it after Sep 30, 2026.",
    })
    expect(todayIn).toHaveBeenCalledWith('America/New_York')
    expect(statusWrites(fake.calls)).toEqual([])
  })

  it('refuses before the end date', async () => {
    today = '2026-09-15'
    db = cappedFakeDb(tables()).db
    const r = await closePeriod({ periodId: PERIOD })
    expect(r.ok).toBe(false)
  })

  it('closes the day after the end date', async () => {
    today = '2026-10-01'
    const fake = cappedFakeDb(tables())
    db = fake.db
    const r = await closePeriod({ periodId: PERIOD })
    expect(r.ok).toBe(true)
    expect(statusWrites(fake.calls)).toEqual(['closing', 'closed'])
  })
})
