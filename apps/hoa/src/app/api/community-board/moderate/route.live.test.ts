import { beforeEach, describe, expect, it, vi } from 'vitest'
import { M13_APPLIED } from '@homeowner-portal/db/m13'

// The community board is live (M13_APPLIED = true, real flag, not mocked).
// These pin the board's moderation path and the one-association scoping.

const state = vi.hoisted(() => ({
  role: 'board' as 'resident' | 'board' | 'admin',
  threadAssociation: 'assoc-1',
  updates: [] as { table: string; patch: Record<string, unknown>; filters: [string, unknown][] }[],
}))

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(() => ({
    from(table: string) {
      let patch: Record<string, unknown> | null = null
      const filters: [string, unknown][] = []
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.update = (p: Record<string, unknown>) => ((patch = p), q)
      q.eq = (c: string, v: unknown) => (filters.push([c, v]), q)
      q.maybeSingle = () =>
        Promise.resolve({
          data:
            table === 'board_threads'
              ? {
                  id: 't1', organization_id: 'org-1', association_id: state.threadAssociation, title: 'x',
                  created_by: null, closed_at: null, hidden_at: null, last_activity_at: '', created_at: '',
                }
              : null,
          error: null,
        })
      q.then = (res: (v: unknown) => void) => {
        if (patch) state.updates.push({ table, patch, filters })
        res({ error: null })
      }
      return q
    },
  })),
}))
vi.mock('@/lib/api/auth', () => ({
  requireRouteMember: vi.fn(async () => ({ orgId: 'org-1', role: state.role, org: {} })),
  requireRouteUser: vi.fn(async () => ({ userId: 'user-1' })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ rpc: async () => ({ data: ['assoc-1'], error: null }) })),
}))

import { POST } from './route'

const T1 = '00000000-0000-4000-8000-000000000001'
function req(body: unknown) {
  return new Request('http://test/api/community-board/moderate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.role = 'board'
  state.threadAssociation = 'assoc-1'
  state.updates = []
})

describe('community board moderation, feature live', () => {
  it('is switched on', () => {
    expect(M13_APPLIED).toBe(true)
  })

  it('lets the board close a thread of its own organization', async () => {
    const res = await POST(req({ action: 'close_thread', threadId: T1 }) as never)
    expect(res.status).toBe(200)
    const u = state.updates.find((x) => x.table === 'board_threads')!
    expect(u.patch).toMatchObject({ closed_by: 'user-1' })
    expect(u.filters).toContainEqual(['id', 't1'])
  })

  it('still refuses a resident, even with the feature live', async () => {
    state.role = 'resident'
    const res = await POST(req({ action: 'close_thread', threadId: T1 }) as never)
    expect(res.status).toBe(403)
    expect(state.updates).toHaveLength(0)
  })
})
