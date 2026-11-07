import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, hasEq, type Recorded } from '@/lib/test-utils/fake-supabase'

const h = vi.hoisted(() => ({
  row: null as unknown,
  queries: [] as Recorded[],
  set: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: h.set, delete: vi.fn() })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/session-cookies', () => ({ clearSessionScopedCookies: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const { client, queries } = fakeSupabase(() => ({ data: h.row, error: null }))
    return {
      ...client,
      from(table: string) {
        const b = client.from(table)
        h.queries.push(queries[queries.length - 1])
        return b
      },
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    }
  }),
}))

import { setActiveOrg } from './set-active-org'

const memberOf = (org: Record<string, unknown>) => ({ org_id: 'o-1', org })

beforeEach(() => {
  h.queries = []
  h.set.mockClear()
})

describe('setActiveOrg', () => {
  it('looks the membership up by the caller’s own id and the org', async () => {
    h.row = memberOf({ hub_type: 'hoa', suspended_at: null, archived_at: null })
    expect(await setActiveOrg('o-1')).toEqual({ ok: true })
    expect(hasEq(h.queries[0], 'user_id', 'u-1')).toBe(true)
    expect(hasEq(h.queries[0], 'org_id', 'o-1')).toBe(true)
    expect(h.set).toHaveBeenCalled()
  })
  it('refuses a suspended community and sets no cookie', async () => {
    h.row = memberOf({ hub_type: 'hoa', suspended_at: '2026-01-01', archived_at: null })
    const r = await setActiveOrg('o-1')
    expect(r.ok).toBe(false)
    expect(h.set).not.toHaveBeenCalled()
  })
  it('refuses an archived community and sets no cookie', async () => {
    h.row = memberOf({ hub_type: 'hoa', suspended_at: null, archived_at: '2026-01-01' })
    expect((await setActiveOrg('o-1')).ok).toBe(false)
    expect(h.set).not.toHaveBeenCalled()
  })
  it('still refuses a non-HOA hub', async () => {
    h.row = memberOf({ hub_type: 'pm', suspended_at: null, archived_at: null })
    expect((await setActiveOrg('o-1')).ok).toBe(false)
  })
})
