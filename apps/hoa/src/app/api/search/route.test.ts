import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  supabaseCalls: 0,
  result: { groups: [], failed: [] } as unknown,
  throws: null as Error | null,
  searchCalls: [] as Array<{ client: unknown; orgId: string; q: string }>,
  userClient: { tag: 'user-client' },
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    h.supabaseCalls++
    return {
      ...h.userClient,
      auth: { getUser: async () => ({ data: { user: h.role === null ? null : { id: 'user-1' } } }) },
    }
  }),
}))

// Search must never run on the service role.
const { createAdminClient } = vi.hoisted(() => ({
  createAdminClient: vi.fn(() => {
    throw new Error('service role used for search')
  }),
}))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient }))

vi.mock('@/lib/search/records', async (orig) => {
  const real = await orig<typeof import('@/lib/search/records')>()
  return {
    ...real,
    searchRecords: vi.fn(async (client: unknown, orgId: string, q: string) => {
      h.searchCalls.push({ client, orgId, q })
      if (h.throws) throw h.throws
      return h.result
    }),
  }
})

const { GET } = await import('./route')

function get(q?: string): Request {
  const url = new URL('http://localhost/api/search')
  if (q !== undefined) url.searchParams.set('q', q)
  return new Request(url)
}

beforeEach(() => {
  h.role = 'board'
  h.supabaseCalls = 0
  h.result = { groups: [], failed: [] }
  h.throws = null
  h.searchCalls = []
})

describe('GET /api/search', () => {
  it('401s a signed-out caller', async () => {
    h.role = null
    const res = await GET(get('kaur'))
    expect(res.status).toBe(401)
    expect(h.searchCalls).toHaveLength(0)
  })

  it('403s a resident before any search runs (residents never see other owners)', async () => {
    h.role = 'resident'
    const res = await GET(get('kaur'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('forbidden')
    expect(h.searchCalls).toHaveLength(0)
  })

  it('400s a missing or oversized query', async () => {
    expect((await GET(get())).status).toBe(400)
    const res = await GET(get('x'.repeat(101)))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation_failed')
  })

  it('searches the gate org with the user-bound client, never the service role', async () => {
    h.result = {
      groups: [
        {
          type: 'owner',
          label: 'Owners',
          items: [{ id: 'p1', type: 'owner', label: 'A Kaur', hint: null, href: '/properties/p1' }],
        },
      ],
      failed: ['thread'],
    }
    const res = await GET(get('kaur'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ query: 'kaur', ...(h.result as object) })
    expect(h.searchCalls).toHaveLength(1)
    expect(h.searchCalls[0].orgId).toBe('org-1')
    expect(h.searchCalls[0].client).toMatchObject({ tag: 'user-client' })
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('500s with the generic envelope when every type failed', async () => {
    h.result = {
      groups: [],
      failed: ['owner', 'property', 'violation', 'arc', 'ticket', 'thread', 'vendor'],
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(get('kaur'))
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe('internal')
  })

  it('never returns raw error text', async () => {
    h.throws = new Error('relation "hoa_violations" leaked 12 Kaur Lane')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(get('kaur'))
    expect(res.status).toBe(500)
    expect(await res.text()).not.toMatch(/Kaur|hoa_violations/)
  })
})
