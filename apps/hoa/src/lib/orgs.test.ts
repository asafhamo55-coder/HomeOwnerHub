import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, hasEq, type Recorded } from './test-utils/fake-supabase'

// S-02: org_members' RLS policy exposes co-members' rows (an admin sees
// their whole org), so these reads must filter on the caller's own id —
// otherwise `.limit(20)` returns other people's memberships.

const h = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  queries: [] as unknown[],
  rows: null as unknown,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const { client, queries } = fakeSupabase(() => ({
      data: h.rows ?? [{ org: { id: 'org-1', name: 'HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } }],
      error: null,
    }))
    return {
      ...client,
      from(table: string) {
        const b = client.from(table)
        h.queries.push(queries[queries.length - 1])
        return b
      },
      auth: { getUser: async () => ({ data: { user: h.userId ? { id: h.userId } : null }, error: null }) },
    }
  }),
}))

import { getCurrentOrg, getUserHoaOrgs, getUserHubs } from './orgs'

beforeEach(() => {
  h.userId = 'user-1'
  h.queries = []
  h.rows = null
})

function membershipQuery(): Recorded {
  const q = (h.queries as Recorded[]).find((r) => r.table === 'org_members')
  expect(q, 'no org_members query').toBeTruthy()
  return q!
}

describe('org_members reads are filtered to the signed-in user', () => {
  it('getCurrentOrg', async () => {
    expect(await getCurrentOrg()).toMatchObject({ id: 'org-1' })
    expect(hasEq(membershipQuery(), 'user_id', 'user-1')).toBe(true)
  })

  it('getUserHoaOrgs', async () => {
    await getUserHoaOrgs()
    expect(hasEq(membershipQuery(), 'user_id', 'user-1')).toBe(true)
  })

  it('getUserHubs', async () => {
    await getUserHubs()
    expect(hasEq(membershipQuery(), 'user_id', 'user-1')).toBe(true)
  })

  it('no signed-in user: no org, and no membership read at all', async () => {
    h.userId = null
    h.queries = []
    expect(await getCurrentOrg()).toBeNull()
    expect(await getUserHoaOrgs()).toEqual([])
    expect(await getUserHubs()).toEqual([])
    expect((h.queries as Recorded[]).some((q) => q.table === 'org_members')).toBe(false)
  })
})

describe('suspended and archived orgs', () => {
  const org = (id: string, extra: Record<string, unknown> = {}) => ({
    org_id: id,
    role: 'admin',
    org: { id, name: id, hub_type: 'hoa', plan: 'pro', doors_count: 1, suspended_at: null, archived_at: null, ...extra },
  })

  it('only org suspended: that org is still returned (last resort, same as before)', async () => {
    h.rows = [org('only', { suspended_at: '2026-01-01T00:00:00Z' })]
    expect(await getCurrentOrg()).toMatchObject({ id: 'only' })
  })

  it('only org archived: also still returned', async () => {
    h.rows = [org('only', { archived_at: '2026-01-01T00:00:00Z' })]
    expect(await getCurrentOrg()).toMatchObject({ id: 'only' })
  })

  it('an active org wins over an older suspended one', async () => {
    h.rows = [org('old', { suspended_at: '2026-01-01T00:00:00Z' }), org('new')]
    expect(await getCurrentOrg()).toMatchObject({ id: 'new' })
  })

  it('the switcher list leaves the suspended one out', async () => {
    h.rows = [org('old', { suspended_at: '2026-01-01T00:00:00Z' }), org('new')]
    expect((await getUserHoaOrgs()).map((o) => o.id)).toEqual(['new'])
  })
})

