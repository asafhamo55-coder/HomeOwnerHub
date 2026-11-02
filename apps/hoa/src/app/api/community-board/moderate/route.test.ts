import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ role: 'resident' as 'resident' | 'board' | 'admin', flag: true }))

vi.mock('@homeowner-portal/db/m13', () => ({
  get M13_APPLIED() {
    return state.flag
  },
}))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn(() => ({})) }))
vi.mock('@/lib/api/auth', () => ({
  requireRouteMember: vi.fn(async () => ({ orgId: 'org-1', role: state.role, org: {} })),
  requireRouteUser: vi.fn(async () => ({ userId: 'user-1' })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ rpc: async () => ({ data: ['assoc-1'], error: null }) })),
}))

import { POST } from './route'

function req(body: unknown) {
  return new Request('http://test/api/community-board/moderate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.role = 'resident'
  state.flag = true
})

describe('POST /api/community-board/moderate', () => {
  it('refuses a resident with 403 before reading the body', async () => {
    const res = await POST(req({ nonsense: true }) as never)
    expect(res.status).toBe(403)
  })

  it('answers 404 while the feature is dark', async () => {
    state.flag = false
    state.role = 'board'
    const res = await POST(req({ action: 'close_thread', threadId: '00000000-0000-4000-8000-000000000000' }) as never)
    expect(res.status).toBe(404)
  })

  it('gives the board a 400 envelope for a bad action', async () => {
    state.role = 'board'
    const res = await POST(req({ action: 'delete_everything' }) as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_failed')
  })
})
