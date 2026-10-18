import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, hasEq, type Recorded } from './test-utils/fake-supabase'

// BL-074: one board page render used to ask Supabase "who is signed in?"
// and "which orgs is this user in?" many times over — the layout, the page,
// the notification bell (twice), every requireBoardOrAdmin and every
// getCurrentUserRoleInOrg each made their own getUser (a round trip to the
// auth server) and their own org_members read, mostly in series. These
// lookups are memoized per request with React `cache()`; this pins that a
// request makes ONE of each, however many helpers ask.
//
// React only memoizes `cache()` inside a server render, so the test stands
// in a memo that is reset per test ("per request").

const h = vi.hoisted(() => ({
  memos: [] as Map<string, unknown>[],
  getUserCalls: 0,
  queries: [] as unknown[],
  membership: { data: [] as unknown, error: null as unknown },
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, unknown>()
      h.memos.push(memo)
      return (...args: A): R => {
        const key = JSON.stringify(args)
        if (!memo.has(key)) memo.set(key, fn(...args))
        return memo.get(key) as R
      }
    },
  }
})

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`)
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const { client, queries } = fakeSupabase((q) => {
      if (q.table === 'org_members' && q.ops.some(([m]) => m === 'maybeSingle')) {
        return { data: { role: 'admin' }, error: null }
      }
      if (q.table === 'org_members') return h.membership as { data: unknown; error: unknown }
      if (q.table === 'associations') {
        return { data: { id: 'assoc-1', name: 'Assoc', state: 'FL' }, error: null }
      }
      return undefined
    })
    return {
      ...client,
      from(table: string) {
        const b = client.from(table)
        h.queries.push(queries[queries.length - 1])
        return b
      },
      auth: {
        getUser: async () => {
          h.getUserCalls += 1
          return { data: { user: { id: 'user-1', email: 'u@example.test' } }, error: null }
        },
      },
    }
  }),
}))

import { getCurrentOrg, getSignedInUser, getUserHoaOrgs, getUserHubs } from './orgs'
import { getCurrentUserRole, getCurrentUserRoleInOrg, requireBoardOrAdmin } from './auth'
import { getMyNotifications, getMyUnreadCount } from './notifications'
import { getPrimaryAssociationResult } from './primary-association'
import { getPrimaryAssociation } from './vendors'

const org = (id: string, hub_type = 'hoa') => ({ id, name: `Org ${id}`, hub_type, plan: 'pro', doors_count: 10 })

beforeEach(() => {
  for (const m of h.memos) m.clear()
  h.getUserCalls = 0
  h.queries = []
  h.membership = {
    data: [
      { org_id: 'org-1', role: 'board', org: org('org-1') },
      { org_id: 'org-2', role: 'admin', org: org('org-2') },
      { org_id: 'pm-1', role: 'admin', org: org('pm-1', 'pm') },
    ],
    error: null,
  }
})

const tables = () => (h.queries as Recorded[]).map((q) => q.table)
const count = (table: string) => tables().filter((t) => t === table).length

describe('per-request lookups are made once (BL-074)', () => {
  it('what the dashboard layout, a page and the bell ask: one getUser, one membership read', async () => {
    await Promise.all([getCurrentOrg(), getUserHubs(), getUserHoaOrgs()]) // layout
    await getCurrentUserRoleInOrg('org-1') // layout role check
    await requireBoardOrAdmin() // page guard
    await Promise.all([getMyNotifications(), getMyUnreadCount()]) // bell
    await getCurrentOrg() // page body
    await getSignedInUser()

    expect(h.getUserCalls).toBe(1)
    expect(count('org_members')).toBe(1)
    expect(count('notifications')).toBe(2)
    const membership = (h.queries as Recorded[]).find((q) => q.table === 'org_members')!
    expect(hasEq(membership, 'user_id', 'user-1')).toBe(true)
  })

  it('answers the role from the membership read', async () => {
    expect(await getCurrentUserRoleInOrg('org-1')).toBe('board')
    expect(await getCurrentUserRoleInOrg('org-2')).toBe('admin')
    expect(await getCurrentUserRole()).toMatchObject({ role: 'board', org: { id: 'org-1' } })
    expect(count('org_members')).toBe(1)
  })

  it('is not a member: null, from the same complete read', async () => {
    expect(await getCurrentUserRoleInOrg('someone-elses-org')).toBeNull()
    expect(count('org_members')).toBe(1)
  })

  it('an unknown role string is no role', async () => {
    h.membership = { data: [{ org_id: 'org-1', role: 'owner', org: org('org-1') }], error: null }
    expect(await getCurrentUserRoleInOrg('org-1')).toBeNull()
  })

  it('falls back to a direct role read when the membership read failed', async () => {
    h.membership = { data: null, error: { code: '57014' } }
    expect(await getCurrentUserRoleInOrg('org-1')).toBe('admin')
    const direct = (h.queries as Recorded[]).filter((q) => q.table === 'org_members')
    expect(direct).toHaveLength(2)
    expect(hasEq(direct[1], 'org_id', 'org-1')).toBe(true)
    expect(hasEq(direct[1], 'user_id', 'user-1')).toBe(true)
  })

  it('falls back to a direct role read when the membership list may be truncated', async () => {
    h.membership = {
      data: Array.from({ length: 20 }, (_, i) => ({ org_id: `o-${i}`, role: 'board', org: org(`o-${i}`) })),
      error: null,
    }
    expect(await getCurrentUserRoleInOrg('org-beyond-the-first-20')).toBe('admin')
    expect(count('org_members')).toBe(2)
  })

  it('the primary association is read once, whichever helper asks', async () => {
    const [a, b] = await Promise.all([getPrimaryAssociation(), getPrimaryAssociationResult()])
    expect(a).toMatchObject({ id: 'assoc-1' })
    expect(b).toMatchObject({ ok: true, data: { id: 'assoc-1' } })
    expect(count('associations')).toBe(1)
  })
})
