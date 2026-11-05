import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ID_CONST = '11111111-1111-4111-8111-111111111111'
const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | 'cpa' | null,
  property: { address: '1234 Peachtree St NE, Atlanta, GA 30309' } as { address: string | null } | null,
  unit: null as { city: string | null; state: string | null; postal_code: string | null } | null,
  readError: null as null | { code: string },
  orgFilter: null as string | null,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.role ? { id: 'user-1' } : null } }) },
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'is', 'order', 'limit']) q[m] = () => q
      q.eq = (col: string, value: string) => {
        if (table === 'hoa_properties' && col === 'org_id') h.orgFilter = value
        return q
      }
      // resolveUnitForProperty awaits the bridge query directly.
      q.then = (resolve: (v: unknown) => void) =>
        resolve({ data: h.unit ? [{ id: 'unit-1', legacy_hoa_property_id: ID_CONST, created_at: '2020-01-01' }] : [], error: null })
      q.maybeSingle = async () =>
        table === 'hoa_properties'
          ? { data: h.property, error: h.readError }
          : { data: h.unit, error: null }
      return q
    },
  })),
}))

import { GET } from './route'

const ID = '11111111-1111-4111-8111-111111111111'
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) })
const call = (id = ID) => GET(new Request(`http://x/api/properties/${id}/photo`), ctx(id))

const calls: string[] = []
let metaStatus = 'OK'
let imageStatus = 200
let metaHttp = 200
let throwOn: 'metadata' | 'image' | null = null

beforeEach(() => {
  h.role = 'board'
  h.property = { address: '1234 Peachtree St NE, Atlanta, GA 30309' }
  h.unit = null
  h.readError = null
  h.orgFilter = null
  calls.length = 0
  metaStatus = 'OK'
  imageStatus = 200
  metaHttp = 200
  throwOn = null
  process.env.GOOGLE_MAPS_API_KEY = 'test-key-not-real'
  delete process.env.GOOGLE_MAPS_URL_SIGNING_SECRET
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const isMeta = url.includes('/streetview/metadata')
      if (throwOn === (isMeta ? 'metadata' : 'image')) throw new Error('boom')
      if (isMeta) return new Response(JSON.stringify({ status: metaStatus }), { status: metaHttp })
      return new Response(imageStatus === 200 ? new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]) : 'nope', {
        status: imageStatus,
        headers: { 'content-type': imageStatus === 200 ? 'image/jpeg' : 'text/plain' },
      })
    }),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.GOOGLE_MAPS_API_KEY
})

describe('GET /api/properties/:id/photo', () => {
  it('401 without a session, before any Google call', async () => {
    h.role = null
    const res = await call()
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('403 for a role that reads no tenant data', async () => {
    h.role = 'cpa'
    expect((await call()).status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it('lets a board member, an admin and a resident through to the RLS-bound read', async () => {
    for (const role of ['board', 'admin', 'resident'] as const) {
      h.role = role
      expect((await call()).status).toBe(200)
    }
    expect(h.orgFilter).toBe('org-1')
  })

  it('404 when RLS hides the property (another home, another org)', async () => {
    h.property = null
    const res = await call()
    expect(res.status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('404 for an id that is not a uuid', async () => {
    expect((await call('not-a-uuid')).status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('404 right away with no key, and never calls Google', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY
    const res = await call()
    expect(res.status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('404 when Google has no imagery, and does not fetch the billed image', async () => {
    metaStatus = 'ZERO_RESULTS'
    const res = await call()
    expect(res.status).toBe(404)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/streetview/metadata')
    const body = await res.json()
    expect(body.error.code).toBe('not_found')
  })

  it('200 streams the JPEG with a private day-long cache and the right Google calls', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400')
    expect(new Uint8Array(await res.arrayBuffer())[0]).toBe(0xff)
    expect(calls).toHaveLength(2)
    const meta = new URL(calls[0])
    expect(meta.pathname).toBe('/maps/api/streetview/metadata')
    expect(meta.searchParams.get('location')).toBe('1234 Peachtree St NE, Atlanta, GA 30309')
    expect(meta.searchParams.get('key')).toBe('test-key-not-real')
    const img = new URL(calls[1])
    expect(img.pathname).toBe('/maps/api/streetview')
    expect(img.searchParams.get('size')).toBe('640x400')
    expect(img.searchParams.get('fov')).toBe('80')
    expect(img.searchParams.get('return_error_code')).toBe('true')
    expect(img.searchParams.get('source')).toBe('outdoor')
  })

  it('signs the URLs when a signing secret is set', async () => {
    process.env.GOOGLE_MAPS_URL_SIGNING_SECRET = 'c2VjcmV0LW5vdC1yZWFs'
    await call()
    expect(new URL(calls[0]).searchParams.get('signature')).toBeTruthy()
    expect(new URL(calls[1]).searchParams.get('signature')).toBeTruthy()
  })

  it('completes a street-only address with the community city, state and ZIP', async () => {
    h.property = { address: '105 Springwood Parkway' }
    h.unit = { city: 'Atlanta', state: 'GA', postal_code: '30067' }
    await call()
    expect(new URL(calls[0]).searchParams.get('location')).toBe('105 Springwood Pkwy, Atlanta, GA 30067')
  })

  it('404 when Google has the metadata but the image call says 404', async () => {
    imageStatus = 404
    expect((await call()).status).toBe(404)
  })

  it('503 with the generic envelope when Google refuses the key, with no Google text or key leaked', async () => {
    metaStatus = 'REQUEST_DENIED'
    const res = await call()
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(text).toContain('upstream_unavailable')
    expect(text).not.toContain('test-key-not-real')
    expect(text).not.toContain('REQUEST_DENIED')
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(logged).not.toContain('test-key-not-real')
    expect(logged).not.toContain('Peachtree')
  })

  it('503 when Google is unreachable or answers an error status', async () => {
    throwOn = 'metadata'
    expect((await call()).status).toBe(503)
    throwOn = 'image'
    expect((await call()).status).toBe(503)
    throwOn = null
    metaHttp = 500
    expect((await call()).status).toBe(503)
    metaHttp = 200
    imageStatus = 500
    expect((await call()).status).toBe(503)
  })

  it('500 envelope, no raw text, when the property read fails', async () => {
    h.readError = { code: 'XX000' }
    const res = await call()
    expect(res.status).toBe(500)
    expect(calls).toHaveLength(0)
  })
})
