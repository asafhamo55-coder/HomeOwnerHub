import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, hasEq, type Recorded } from './test-utils/fake-supabase'

// Management-company scale: one person in 300 orgs. A normal request must
// not load them all, the active org is found by one lookup on the cookie's
// org id, and the switcher search pages through them 20 at a time.

const TOTAL = 300
const SEARCHABLE = TOTAL - 3 // minus suspended, archived and the pm hub
// org-5 is suspended and org-6 archived (both on the first page); org-7 is a
// property-manager hub, not an HOA.
const org = (i: number) => ({
  id: `org-${i}`,
  name: `Community ${String(i).padStart(3, '0')}`,
  hub_type: i === 7 ? 'pm' : 'hoa',
  plan: 'pro',
  doors_count: i,
  suspended_at: i === 5 ? '2026-01-01T00:00:00Z' : null,
  archived_at: i === 6 ? '2026-01-01T00:00:00Z' : null,
})
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
  const hoaOnly = ops.some(([m, c, v]) => m === 'eq' && c === 'org.hub_type' && v === 'hoa')
  const activeOnly = ops.some(([m, c]) => m === 'is' && c === 'org.suspended_at') && ops.some(([m, c]) => m === 'is' && c === 'org.archived_at')
  const filtered = ALL.filter((r) => (!hoaOnly || !!r.org) && (!hoaOnly || r.org.hub_type === 'hoa') && (!activeOnly || !r.org || (!r.org.suspended_at && !r.org.archived_at)))
  const rows = ilike
    ? filtered.filter((r) => r.org.name.toLowerCase().includes(String(ilike[2]).replace(/%/g, '').toLowerCase()))
    : filtered
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
    // The shared first page, then ONE lookup on the cookie's org id (it is not on the page).
    const lookups = memberReads().filter((q) => hasEq(q, 'org_id', 'org-250'))
    expect(lookups).toHaveLength(1)
    expect(hasEq(lookups[0], 'user_id', 'pm-1')).toBe(true)
    expect(memberReads()).toHaveLength(2)
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
    expect(first.orgs.map((o) => o.id)).not.toContain('org-5') // suspended
    expect(first.orgs.map((o) => o.id)).not.toContain('org-6') // archived
    expect(first.orgs.map((o) => o.id)).not.toContain('org-7') // not an HOA
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
    expect(page).toBe(14) // 297 / 20 = 15 pages, zero-based
    expect(seen).toHaveLength(SEARCHABLE)
    expect(new Set(seen).size).toBe(SEARCHABLE)
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

describe('suspended and archived orgs', () => {
  it('a cookie naming a suspended org is ignored: the oldest active HOA is chosen', async () => {
    h.cookie = 'org-5'
    expect(await getCurrentOrg()).toMatchObject({ id: 'org-1' })
  })
  it('a cookie naming an archived org is ignored', async () => {
    h.cookie = 'org-6'
    expect(await getCurrentOrg()).toMatchObject({ id: 'org-1' })
  })
  it('the switcher list leaves them out', async () => {
    const ids = (await getUserHoaOrgs()).map((o) => o.id)
    expect(ids).not.toContain('org-5')
    expect(ids).not.toContain('org-6')
    expect(ids).not.toContain('org-7')
  })
  it('when the whole first page is unusable, the fallback asks for the first ACTIVE HOA directly', async () => {
    const saved = ALL.slice(0, 9).map((r) => r.org.suspended_at)
    ALL.slice(0, 9).forEach((r) => (r.org.suspended_at = '2026-02-02T00:00:00Z'))
    try {
      expect(await getCurrentOrg()).toMatchObject({ id: 'org-10' })
      const q = memberReads().find((r) => r.ops.some(([m, c]) => m === 'is' && c === 'org.suspended_at'))
      expect(q, 'no direct fallback read').toBeTruthy()
      expect(hasEq(q!, 'org.hub_type', 'hoa')).toBe(true)
    } finally {
      ALL.slice(0, 9).forEach((r, i) => (r.org.suspended_at = saved[i]))
    }
  })
})

describe('getCurrentOrg reads the shared page first', () => {
  it('a cookie org that is on the first page needs no second lookup', async () => {
    h.cookie = 'org-3'
    expect(await getCurrentOrg()).toMatchObject({ id: 'org-3' })
    expect(memberReads().filter((q) => hasEq(q, 'org_id', 'org-3'))).toHaveLength(0)
    expect(memberReads()).toHaveLength(1)
  })
})

describe('search page cap', () => {
  it('serves no page past the 50th and runs no query for it', async () => {
    const before = memberReads().length
    const r = await searchMyOrgs('', 50)
    expect(r).toEqual({ ok: true, orgs: [], hasMore: false })
    expect(memberReads().length).toBe(before)
  })
  it('still serves the last allowed page', async () => {
    const r = await searchMyOrgs('', 49)
    expect(r.ok).toBe(true)
    expect(memberReads().at(-1)!.ops.find(([m]) => m === 'range')?.slice(1)).toEqual([980, 1000])
  })
})

describe('outside professionals', () => {
  it('a membership whose org the pro cannot read never appears in search results', async () => {
    // RLS hides the org from a CPA/attorney, so the inner join drops the row; a
    // row that still came back with no org is skipped, never shown blank.
    ALL.push({ org_id: 'org-pro', role: 'cpa', org: null as never })
    try {
      const r = await searchMyOrgs('', 0)
      expect(r.ok && r.orgs.every((o) => o.id !== 'org-pro')).toBe(true)
    } finally {
      ALL.pop()
    }
  })
})

