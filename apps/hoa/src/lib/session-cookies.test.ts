import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IMPERSONATION_COOKIE, ROLE_OVERRIDE_COOKIE } from './session-cookies'

// Impersonation + role override are per-user, per-org. Sign-out and org
// switch must clear them so they never carry over to the next session or
// into a different org.

const h = vi.hoisted(() => ({ cookies: new Map<string, string>() }))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (n: string) => (h.cookies.has(n) ? { name: n, value: h.cookies.get(n)! } : undefined),
    set: (n: string, v: string) => void h.cookies.set(n, v),
    delete: (n: string) => void h.cookies.delete(n),
    getAll: () => [],
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const result = { data: { org_id: 'org-b', org: { hub_type: 'hoa' } }, error: null }
    const chain: Record<string, unknown> = {}
    for (const m of ['from', 'select', 'eq', 'limit']) chain[m] = () => chain
    chain.maybeSingle = async () => result
    return { ...chain, auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }
  }),
}))

import { setActiveOrg } from '../app/actions/set-active-org'
import { clearSessionCookiesOnSignOut } from '../app/actions/sign-out'

beforeEach(() => {
  h.cookies.clear()
  h.cookies.set(IMPERSONATION_COOKIE, 'token')
  h.cookies.set(ROLE_OVERRIDE_COOKIE, 'resident')
})

describe('session-scoped cookies', () => {
  it('are cleared on sign-out', async () => {
    await clearSessionCookiesOnSignOut()
    expect(h.cookies.has(IMPERSONATION_COOKIE)).toBe(false)
    expect(h.cookies.has(ROLE_OVERRIDE_COOKIE)).toBe(false)
  })

  it('are cleared on org switch', async () => {
    expect(await setActiveOrg('org-b')).toEqual({ ok: true })
    expect(h.cookies.has(IMPERSONATION_COOKIE)).toBe(false)
    expect(h.cookies.has(ROLE_OVERRIDE_COOKIE)).toBe(false)
    expect(h.cookies.get('hoa_active_org_id')).toBe('org-b')
  })
})
