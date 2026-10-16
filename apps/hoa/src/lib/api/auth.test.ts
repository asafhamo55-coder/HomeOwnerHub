import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARD_ONLY_DENIED } from '@/lib/accounting/guard'

const h = vi.hoisted(() => ({
  role: 'resident' as 'admin' | 'board' | 'resident' | null,
  user: { id: 'user-1' } as { id: string } | null,
  orgOwned: true,
  lookupError: null as { code: string } | null,
  platformAdmin: false,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => h.platformAdmin) }))

const eqCalls: Array<[string, unknown]> = []
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => {
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          eqCalls.push([col, v])
          return q
        },
        maybeSingle: async () => ({ data: h.orgOwned ? { id: 'x' } : null, error: h.lookupError }),
      }
      return q
    },
  })),
}))

import { ApiRouteError } from './errors'
import {
  requireOrgOwned,
  requireRouteBoardOrAdmin,
  requireRouteMember,
  requireRoutePlatformAdmin,
  requireRouteUser,
} from './auth'

async function code(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    if (e instanceof ApiRouteError) return e.code
    throw e
  }
}

beforeEach(() => {
  h.role = 'resident'
  h.user = { id: 'user-1' }
  h.orgOwned = true
  h.lookupError = null
  h.platformAdmin = false
  eqCalls.length = 0
})

describe('requireRouteUser', () => {
  it('returns the user id', async () => {
    await expect(requireRouteUser()).resolves.toEqual({ userId: 'user-1' })
  })
  it('401s without a session', async () => {
    h.user = null
    expect(await code(requireRouteUser())).toBe('unauthenticated')
  })
})

describe('requireRouteMember', () => {
  it('returns org + role for any member, residents included', async () => {
    await expect(requireRouteMember()).resolves.toMatchObject({ orgId: 'org-1', role: 'resident' })
  })
  it('401s a signed-out caller and 403s a signed-in user with no HOA org', async () => {
    h.role = null
    h.user = null
    expect(await code(requireRouteMember())).toBe('unauthenticated')
    h.user = { id: 'user-1' }
    expect(await code(requireRouteMember())).toBe('forbidden')
  })
})

describe('requireRouteBoardOrAdmin (the shared board gate)', () => {
  it('403s a resident (not 404) with the shared denial text', async () => {
    try {
      await requireRouteBoardOrAdmin()
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiRouteError)
      expect((e as ApiRouteError).status).toBe(403)
      expect((e as ApiRouteError).publicMessage).toBe(BOARD_ONLY_DENIED)
    }
  })
  it('passes board and admin', async () => {
    for (const role of ['board', 'admin'] as const) {
      h.role = role
      await expect(requireRouteBoardOrAdmin()).resolves.toEqual({ orgId: 'org-1', role })
    }
  })
  it('401s signed-out, 403s no-org', async () => {
    h.role = null
    h.user = null
    expect(await code(requireRouteBoardOrAdmin())).toBe('unauthenticated')
    h.user = { id: 'user-1' }
    expect(await code(requireRouteBoardOrAdmin())).toBe('forbidden')
  })
})

describe('requireRoutePlatformAdmin', () => {
  it('403s a non-platform-admin and passes a platform admin', async () => {
    expect(await code(requireRoutePlatformAdmin())).toBe('forbidden')
    h.platformAdmin = true
    await expect(requireRoutePlatformAdmin()).resolves.toEqual({ userId: 'user-1' })
  })
  it('401s without a session', async () => {
    h.user = null
    expect(await code(requireRoutePlatformAdmin())).toBe('unauthenticated')
  })
})

describe('requireOrgOwned (client-supplied ids)', () => {
  it('passes when the row is in the caller org and filters by both id and org', async () => {
    await expect(requireOrgOwned('associations', 'assoc-1', 'org-1')).resolves.toBeUndefined()
    expect(eqCalls).toEqual([
      ['id', 'assoc-1'],
      ['organization_id', 'org-1'],
    ])
  })
  it('honours the org_id column name on legacy tables', async () => {
    await requireOrgOwned('hoa_properties', 'p-1', 'org-1', { orgColumn: 'org_id' })
    expect(eqCalls).toContainEqual(['org_id', 'org-1'])
  })
  it('404s a foreign or missing id', async () => {
    h.orgOwned = false
    expect(await code(requireOrgOwned('funds', 'f-1', 'org-1'))).toBe('not_found')
  })
  it('500s (generic) when the lookup itself fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.lookupError = { code: '42P01' }
    expect(await code(requireOrgOwned('funds', 'f-1', 'org-1'))).toBe('internal')
  })
})
