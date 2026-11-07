import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, hasEq, type Recorded } from './test-utils/fake-supabase'

// Management-company scale: one person in 300 orgs. A normal request must
// not load them all, the active org is found by one lookup on the cookie's
// org id, and the switcher search pages through them 20 at a time.

const TOTAL = 300
const org = (i: number) => ({ id: `org-${i}`, name: `Community ${String(i).padStart(3, '0')}`, hub_type: 'hoa', plan: 'pro', doors_count: i })
const member = (i: number) => ({ org_id: `org-${i}`, role: 'admin', org: org(i) })
const ALL = Array.from({ length: TOTAL }, (_, i) => member(i + 1))

const h = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  queries: [] as Recorded[],
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: (k: string) => (k === 'hoa_active_org_id' && h.cookie ? { value: h.cookie } : undefined) })),
}))

/** What the database would answer for an org_members read: it honours eq(org_id), limit and range. */
function answer(q: Recorded) {
  const ops = q.ops
  const orgEq = ops.find(([m, c]) => m === 'eq' && c === 'org_id')
  if (orgEq) {
    const row = ALL.find((r) => r.org_id === orgEq[2])
    return { data: row ?? null, error: null }
  }
  const ilike = ops.find(([m, c]) => m === 'ilike' && c === 'org.name')
  const rows = ilike
    ? ALL.filter((r) => r.org.name.toLowerCase().includes(String(ilike[2]).replace(/%/g, '').toLowerCase()))
    : ALL
  const range = ops.find(([m]) => m === 'range')
  const limit = ops.find(([m]) => m === 'limit')
  const slice = range
    ? rows.slice(range[1] as number, (range[2] as number) + 1)
    : limit
      ? rows.slice(0, limit[1] as number)
      : rows
  return { data: slice, error: null, count: rows.length }
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const { client, queries } = fakeSupabase(answer as never)
    return {
      ...client,
      from(table: string) {
        const b = client.from(table)
        h.queries.push(queries[queries.length - 1])
        return b
      },
      auth: { getUser: async () => ({ data: { user: { id: 'pm-1' } }, error: null }) },
    }
  }),
}))

import { getCurrentOrg, getMembershipDetail, getUserHoaOrgs, getUserHubs, getUserOrgCount } from './orgs'
import { searchMyOrgs } from '@/app/actions/search-my-orgs'
import { SWITCHER_SEARCH_PAGE_SIZE } from './org-switcher'

const memberReads = () => h.queries.filter((q) => q.table === 'org_members')
const rowsRequested = (q: Recorded) => {
  const range = q.ops.find(([m]) => m === 'range')
  const limit = q.ops.find(([m]) => m === 'limit')
  return range ? (range[2] as number) - (range[1] as number) + 1 : (limit?.[1] as number | undefined) ?? Infinity
}

beforeEach(() => {
  h.cookie = undefined
  h.queries = []
})

describe('a user in 300 orgs', () => {
  it('resolves the active org from the cookie with one lookup on that org id', async () => {
    h.cookie = 'org-250'
    const current = await getCurrentOrg()
    expect(current).toMatchObject({ id: 'org-250', name: 'Community 250' })
    const reads = memberReads()
    expect(reads).toHaveLength(1)
    expect(hasEq(reads[0], 'org_id', 'org-250')).toBe(true)
    expect(hasEq(reads[0], 'user_id', 'pm-1')).toBe(true)
  })

  it('no request ever loads more than a short page of memberships', async () => {
    h.cookie = 'org-250'
    await Promise.all([getCurrentOrg(), getUserHoaOrgs(), getUserHubs(), getUserOrgCount(), getMembershipDetail('org-250')])
    expect(memberReads().length).toBeGreaterThan(0)
    for (const q of memberReads()) expect(rowsRequested(q)).toBeLessThanOrEqual(9)
  })

  it('reports how many orgs there are without listing them', async () => {
    expect(await getUserOrgCount()).toBe(TOTAL)
    expect((await getUserHoaOrgs()).length).toBeLessThanOrEqual(9)
  })

  it('falls back to the oldest HOA when the cookie is missing', async () => {
    expect(await getCurrentOrg()).toMatchObject({ id: 'org-1' })
  })

  it('falls back when the cookie names an org the user is not in', async () => {
    h.cookie = 'org-9999'
    expect(await getCurrentOrg()).toMatchObject({ id: 'org-1' })
    expect(memberReads().some((q) => hasEq(q, 'org_id', 'org-9999'))).toBe(true)
  })

  it('answers a role lookup for an org past the first page with a direct read', async () => {
    const detail = await getMembershipDetail('org-250')
    expect(detail?.role).toBe('admin')
    expect(memberReads().some((q) => hasEq(q, 'org_id', 'org-250'))).toBe(true)
  })
})

describe('switcher search pages through the 300', () => {
  it('returns at most 20 per page, filtered to the signed-in user, with a "more" flag', async () => {
    const first = await searchMyOrgs('', 0)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.orgs).toHaveLength(SWITCHER_SEARCH_PAGE_SIZE)
    expect(first.hasMore).toBe(true)
    const q = memberReads().at(-1)!
    expect(hasEq(q, 'user_id', 'pm-1')).toBe(true)
    expect(hasEq(q, 'org.hub_type', 'hoa')).toBe(true)
    // one extra row is requested to learn whether another page exists
    expect(q.ops.find(([m]) => m === 'range')?.slice(1)).toEqual([0, SWITCHER_SEARCH_PAGE_SIZE])
  })

  it('walks every page exactly once and the last page says there is no more', async () => {
    const seen: string[] = []
    let page = 0
    for (;;) {
      const r = await searchMyOrgs('', page)
      if (!r.ok) throw new Error(r.reason)
      seen.push(...r.orgs.map((o) => o.id))
      if (!r.hasMore) break
      page += 1
    }
    expect(page).toBe(14) // 300 / 20 = 15 pages, zero-based
    expect(seen).toHaveLength(TOTAL)
    expect(new Set(seen).size).toBe(TOTAL)
  })

  it('matches on part of the name, case-blind, and escapes wildcard characters', async () => {
    const r = await searchMyOrgs('  community 07 ', 0)
    expect(r.ok && r.orgs.every((o) => o.name.toLowerCase().includes('community 07'))).toBe(true)
    await searchMyOrgs('50%_', 0)
    const ilike = memberReads().at(-1)!.ops.find(([m]) => m === 'ilike')!
    expect(ilike[2]).toBe('%50\\%\\_%')
  })

  it('clamps nonsense paging and over-long text', async () => {
    await searchMyOrgs('x'.repeat(500), -3)
    const q = memberReads().at(-1)!
    expect(String(q.ops.find(([m]) => m === 'ilike')![2]).length).toBeLessThanOrEqual(80 + 2 + 0)
    expect(q.ops.find(([m]) => m === 'range')?.[1]).toBe(0)
  })
})
