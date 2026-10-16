import { beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/plaid/link-token against api-route-conventions (RC-1..RC-13).

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  user: { id: 'user-1' } as { id: string } | null,
  plaidConfigured: true,
  assoc: { data: { id: 'assoc-1' } as { id: string } | null, error: null as { code: string; message: string } | null },
  linkTokenCreate: vi.fn(),
  scopes: [] as Array<[string, unknown]>,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        h.scopes.push([col, val])
        return b
      },
      order: () => b,
      limit: () => b,
      maybeSingle: async () => h.assoc,
    }
    return {
      auth: { getUser: async () => ({ data: { user: h.user } }) },
      from: () => b,
    }
  }),
}))

vi.mock('@/lib/plaid', () => ({
  getPlaidClient: vi.fn(() => (h.plaidConfigured ? { linkTokenCreate: h.linkTokenCreate } : null)),
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { POST } from './route'

const call = () => POST(new Request('http://x/api/plaid/link-token', { method: 'POST' }))

beforeEach(() => {
  h.role = 'board'
  h.user = { id: 'user-1' }
  h.plaidConfigured = true
  h.assoc = { data: { id: 'assoc-1' }, error: null }
  h.scopes = []
  h.linkTokenCreate.mockReset()
  h.linkTokenCreate.mockResolvedValue({
    data: { link_token: 'link-sandbox-abc', expiration: '2026-10-16T12:00:00Z', request_id: 'r1' },
  })
})

describe('POST /api/plaid/link-token', () => {
  it('returns a camelCase link token for a board member, scoped to the gate org (RC-11, RC-4)', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ linkToken: 'link-sandbox-abc', expiration: '2026-10-16T12:00:00Z' })
    expect(h.scopes).toContainEqual(['organization_id', 'org-1'])
    expect(h.linkTokenCreate).toHaveBeenCalledWith(expect.objectContaining({ user: { client_user_id: 'assoc-1' } }))
  })

  it('a resident gets 403 forbidden in the envelope, before any Plaid call (RC-4)', async () => {
    h.role = 'resident'
    const res = await call()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('forbidden')
    expect(typeof body.error.message).toBe('string')
    expect(h.linkTokenCreate).not.toHaveBeenCalled()
  })

  it('a signed-out caller gets 401 unauthenticated', async () => {
    h.role = null
    h.user = null
    const res = await call()
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthenticated')
  })

  it('auth runs before the config check: a resident never learns Plaid is unconfigured (RC-3)', async () => {
    h.role = 'resident'
    h.plaidConfigured = false
    const res = await call()
    expect(res.status).toBe(403)
  })

  it('missing Plaid env is 503 not_configured with a readable message (RC-1)', async () => {
    h.plaidConfigured = false
    const res = await call()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('not_configured')
    expect(body.error.message).toMatch(/bank linking/i)
  })

  it('no association is 404 not_found with reason no_association (RC-1)', async () => {
    h.assoc = { data: null, error: null }
    const res = await call()
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'not_found', reason: 'no_association' })
    expect(h.linkTokenCreate).not.toHaveBeenCalled()
  })

  it('a failed association read is a generic 500, not "no association" (RC-2)', async () => {
    h.assoc = { data: null, error: { code: '42P01', message: 'relation "associations" does not exist' } }
    const res = await call()
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(text).not.toContain('relation')
  })

  it('a Plaid failure is 503 upstream_unavailable with no provider text (RC-1, RC-2)', async () => {
    const err = Object.assign(new Error('INVALID_API_KEYS: secret plaid-secret-xyz is wrong'), {
      response: { data: { error_code: 'INVALID_API_KEYS' } },
    })
    h.linkTokenCreate.mockRejectedValue(err)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call()
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(text).not.toContain('INVALID_API_KEYS')
    expect(text).not.toContain('plaid-secret-xyz')
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('plaid-secret-xyz')
    spy.mockRestore()
  })
})
