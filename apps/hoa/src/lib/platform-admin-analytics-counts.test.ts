import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb, type FakeCall } from '@/lib/supabase/capped-fake-db'

/**
 * BL-057: getAnalyticsData loaded every unit and member row on the
 * platform (up to readAll's 200k cap) only to count them. Units and
 * members are now counted with head/count queries — no row comes back —
 * and every number they feed must stay what the row reads produced.
 */
let db: SupabaseClient
const userClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
  rpc: async () => ({ data: true, error: null }),
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => userClient }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => db }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), appUrl: () => 'http://localhost' }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getAnalyticsData } = await import('./platform-admin')

const many = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i))
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const now = new Date()
const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12).toISOString()
const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 15).toISOString()
const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), 15).toISOString()

function fixture() {
  return {
    orgs: [
      { id: 'org-a', name: 'A', plan: 'pro', created_at: thisMonth, suspended_at: null },
      { id: 'org-b', name: 'B', plan: 'starter', created_at: threeMonthsAgo, suspended_at: null },
      { id: 'org-c', name: 'C', plan: 'pro', created_at: twoYearsAgo, suspended_at: thisMonth },
    ],
    org_members: [
      ...many(1500, (i) => ({ org_id: 'org-a', user_id: `ua${i}`, invited_at: thisMonth })),
      ...many(7, (i) => ({ org_id: 'org-b', user_id: `ub${i}`, invited_at: threeMonthsAgo })),
      ...many(3, (i) => ({ org_id: 'org-b', user_id: `uc${i}`, invited_at: twoYearsAgo })),
      ...many(2, (i) => ({ org_id: 'org-b', user_id: `ud${i}`, invited_at: null })),
      // A member of an org that no longer exists still counts toward the total.
      { org_id: 'org-gone', user_id: 'ux', invited_at: thisMonth },
    ],
    units: [
      ...many(1200, (i) => ({ id: `u-a${i}`, organization_id: 'org-a' })),
      ...many(4, (i) => ({ id: `u-b${i}`, organization_id: 'org-b' })),
      { id: 'u-gone', organization_id: 'org-gone' },
    ],
    associations: [{ id: 'as1', organization_id: 'org-a' }],
    vendor_compliance: [],
    hoa_violations: [],
    ai_runs: [],
    assessments: [],
    rfps: [],
    arc_requests: [],
    hoa_documents: [],
  }
}

const readsOf = (calls: FakeCall[], table: string) => calls.filter((c) => c.table === table)

describe('getAnalyticsData counts units and members without reading their rows (BL-057)', () => {
  it('every units / org_members read is a head count — no rows, no paging', async () => {
    const fake = cappedFakeDb(fixture())
    db = fake.db
    await getAnalyticsData()
    for (const table of ['units', 'org_members']) {
      const reads = readsOf(fake.calls, table)
      expect(reads.length).toBeGreaterThan(0)
      for (const c of reads) {
        const select = c.ops.find((o) => o[0] === 'select')
        expect(select?.[2]).toEqual({ count: 'exact', head: true })
        expect(c.ops.some((o) => o[0] === 'range')).toBe(false)
      }
    }
  })

  it('totals, per-tenant counts and the member growth series are unchanged', async () => {
    ;({ db } = cappedFakeDb(fixture()))
    const a = await getAnalyticsData()

    expect(a.total_members).toBe(1513)
    expect(a.total_units).toBe(1205)
    expect(a.tenant_health.map((t) => [t.id, t.members, t.units])).toEqual([
      ['org-a', 1500, 1200],
      ['org-b', 12, 4],
      ['org-c', 0, 0],
    ])

    expect(a.members_over_time).toHaveLength(12)
    expect(a.members_over_time[11]).toEqual({ month: monthKey(now), count: 1501 })
    const back3 = monthKey(new Date(now.getFullYear(), now.getMonth() - 3, 1))
    expect(a.members_over_time.find((m) => m.month === back3)?.count).toBe(7)
    // Null and older-than-12-months invites are in no bucket, as before.
    expect(a.members_over_time.reduce((s, m) => s + m.count, 0)).toBe(1508)
  })

  it('a failed count throws instead of reporting zero', async () => {
    ;({ db } = cappedFakeDb(fixture(), { failAt: { table: 'org_members' } }))
    await expect(getAnalyticsData()).rejects.toThrow(/57014/)
  })
})
