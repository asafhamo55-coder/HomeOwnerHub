import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ID_CONST = '11111111-1111-4111-8111-111111111111'
const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | 'cpa' | null,
  property: { address: '1234 Peachtree St NE, Atlanta, GA 30309' } as { address: string | null } | null,
  unit: null as { city: string | null; state: string | null; postal_code: string | null } | null,
  assoc: null as { state: string | null; compliance_settings?: unknown } | null,
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
          : table === 'associations'
            ? { data: h.assoc, error: null }
            : { data: h.unit ? { ...h.unit, association_id: 'assoc-1' } : null, error: null }
      return q
    },
  })),
}))

import { GET } from './route'

const ID = '11111111-1111-4111-8111-111111111111'
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) })
const call = (id = ID) => GET(new Request(`http://x/api/properties/${id}/photo`), ctx(id))

const calls: string[] = []
const geoCalls: string[] = []
let geoStatus = 'REQUEST_DENIED'
let geoType = 'ROOFTOP'
let geoHttp = 200
let geoThrow = false
let panoStatus = 'OK'
let panoLoc = { lat: 33.0, lng: -84.0 }
let partial = false
let aimedStatus = 200
let metaStatus = 'OK'
let imageStatus = 200
let metaHttp = 200
let throwOn: 'metadata' | 'image' | null = null

beforeEach(() => {
  h.role = 'board'
  h.property = { address: '1234 Peachtree St NE, Atlanta, GA 30309' }
  h.unit = null
  h.assoc = null
  h.readError = null
  h.orgFilter = null
  calls.length = 0
  geoCalls.length = 0
  geoStatus = 'REQUEST_DENIED'
  geoType = 'ROOFTOP'
  geoHttp = 200
  geoThrow = false
  panoStatus = 'OK'
  panoLoc = { lat: 33.0, lng: -84.0 }
  partial = false
  aimedStatus = 200
  metaStatus = 'OK'
  imageStatus = 200
  metaHttp = 200
  throwOn = null
  process.env.GOOGLE_MAPS_API_KEY = 'test-key-not-real'
  delete process.env.GOOGLE_MAPS_URL_SIGNING_SECRET
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/geocode/json')) {
        geoCalls.push(url)
        if (geoThrow) throw new Error('boom')
        return new Response(
          JSON.stringify({
            status: geoStatus,
            results: geoStatus === 'OK' ? [{ partial_match: partial || undefined, geometry: { location: { lat: 33.0001, lng: -84.0 }, location_type: geoType } }] : [],
          }),
          { status: geoHttp },
        )
      }
      calls.push(url)
      if (url.includes('radius=')) {
        return new Response(JSON.stringify({ status: panoStatus, pano_id: 'PANO123', location: panoLoc }))
      }
      if (url.includes('pano=PANO123') && aimedStatus !== 200) {
        return new Response(aimedStatus === 0 ? 'html' : 'err', { status: aimedStatus === 0 ? 200 : aimedStatus, headers: { 'content-type': 'text/html' } })
      }
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
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.GOOGLE_MAPS_API_KEY
})

const infoLines = () =>
  (console.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => JSON.parse(String(c[1])) as Record<string, unknown>)
const reasons = () => infoLines().map((l) => l.reason)

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

  it('503 when Google is unreachable or answers an error status, each with a one-minute private cache', async () => {
    const check = async () => {
      const res = await call()
      expect(res.status).toBe(503)
      expect(res.headers.get('cache-control')).toBe('private, max-age=60')
    }
    throwOn = 'metadata'
    await check()
    throwOn = 'image'
    await check()
    throwOn = null
    metaHttp = 500
    await check()
    metaHttp = 200
    imageStatus = 500
    await check()
    imageStatus = 200
    metaStatus = 'OVER_QUERY_LIMIT'
    await check()
  })

  it('404 misses are cached an hour, privately', async () => {
    metaStatus = 'ZERO_RESULTS'
    expect((await call()).headers.get('cache-control')).toBe('private, max-age=3600')
  })

  it('500 envelope, no raw text, when the property read fails', async () => {
    h.readError = { code: 'XX000' }
    const res = await call()
    expect(res.status).toBe(500)
    expect(calls).toHaveLength(0)
  })

  describe('diagnostic reason codes', () => {
    it('no_key', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      await call()
      expect(reasons()).toEqual(['no_key'])
    })
    it('row_not_visible', async () => {
      h.property = null
      await call()
      expect(infoLines()[0]).toMatchObject({ event: 'property_photo', outcome: 'miss', reason: 'row_not_visible', propertyId: ID })
    })
    it('no_address', async () => {
      h.property = { address: null }
      await call()
      expect(reasons()).toEqual(['no_address'])
    })
    it('no_location when the address has no street line', async () => {
      h.property = { address: ',' }
      const res = await call()
      expect(res.status).toBe(404)
      expect(reasons()).toEqual(['no_location'])
    })
    it('meta_zero_results and meta_not_found, with the geocode status', async () => {
      metaStatus = 'ZERO_RESULTS'
      await call()
      metaStatus = 'NOT_FOUND'
      await call()
      expect(reasons()).toEqual(['geocode_denied', 'meta_zero_results', 'geocode_denied', 'meta_not_found'])
      expect(infoLines()[1]).toMatchObject({ metaStatus: 'ZERO_RESULTS' })
      expect(infoLines()[0]).toMatchObject({ geocodeStatus: 'REQUEST_DENIED' })
    })
    it('image_404', async () => {
      imageStatus = 404
      await call()
      expect(reasons()).toContain('image_404')
    })
    it('geocode and pano reasons', async () => {
      geoStatus = 'OK'
      geoType = 'APPROXIMATE'
      await call()
      partial = true
      geoType = 'ROOFTOP'
      await call()
      partial = false
      panoStatus = 'ZERO_RESULTS'
      await call()
      panoLoc = { lat: 33.0001 - 0.00054, lng: -84.0 }
      panoStatus = 'OK'
      await call()
      panoLoc = { lat: 33.0001 - 0.00002, lng: -84.0 }
      await call()
      geoHttp = 500
      await call()
      expect(reasons()).toEqual([
        'geocode_imprecise',
        'geocode_imprecise',
        'pano_zero_results',
        'pano_too_far',
        'pano_too_close',
        'geocode_http_error',
      ])
    })
    it('geocode_error, geocode_bad_body and aimed_image_error', async () => {
      geoStatus = 'OK'
      geoThrow = true
      await call()
      geoThrow = false
      aimedStatus = -1
      await call()
      expect(reasons().slice(0, 1)).toEqual(['geocode_error'])
      expect(reasons()).toContain('aimed_image_error')
    })
    it('budget_exhausted when the clock runs low between geocode and pano', async () => {
      geoStatus = 'OK'
      let n = 0
      const real = Date.now()
      vi.spyOn(Date, 'now').mockImplementation(() => {
        n += 1
        // The first calls see plenty of time; later ones see almost none.
        return n < 4 ? real : real + 9500
      })
      await call()
      expect(reasons()).toContain('budget_exhausted')
    })
    it('logs an unknown locationType as other', async () => {
      geoStatus = 'OK'
      geoType = 'SOMETHING_NEW'
      await call()
      expect(infoLines()[0]).toMatchObject({ reason: 'geocode_imprecise', locationType: 'other' })
    })
    it('logs only known Google statuses, else other', async () => {
      geoStatus = 'SOME_NEW_STATUS <script>'
      await call()
      expect(infoLines()[0]).toMatchObject({ reason: 'geocode_denied', geocodeStatus: 'other' })
    })
    it('aimed_image_failed', async () => {
      geoStatus = 'OK'
      aimedStatus = 404
      await call()
      expect(reasons()).toEqual(['aimed_image_failed'])
    })
    it('never logs the address, key or a URL', async () => {
      geoStatus = 'OK'
      aimedStatus = 500
      await call()
      metaStatus = 'ZERO_RESULTS'
      await call()
      const logged = JSON.stringify((console.info as unknown as { mock: { calls: unknown[] } }).mock.calls)
      expect(logged).not.toContain('Peachtree')
      expect(logged).not.toContain('test-key-not-real')
      expect(logged).not.toContain('http')
    })
  })

  describe('association fallback', () => {
    it('404s with zero Google calls for a street plus only the association state', async () => {
      h.property = { address: '105 Springwood Parkway' }
      h.unit = { city: null, state: null, postal_code: null }
      h.assoc = { state: 'GA' }
      const res = await call()
      expect(res.status).toBe(404)
      expect(calls).toHaveLength(0)
      expect(geoCalls).toHaveLength(0)
      expect(reasons()).toEqual(['state_only_location'])
      expect(infoLines()[0]).toMatchObject({ outcome: 'miss', propertyId: ID })
    })
    it('sends the request when the address has a city and ZIP and the association supplies the state', async () => {
      h.property = { address: '105 Springwood Parkway, Marietta, 30067' }
      h.unit = { city: null, state: null, postal_code: null }
      h.assoc = { state: 'GA' }
      expect((await call()).status).toBe(200)
      expect(new URL(calls[0]).searchParams.get('location')).toBe('105 Springwood Pkwy, Marietta, GA 30067')
    })
    it('builds "street, City, ST ZIP" from the board-set community city and ZIP', async () => {
      h.property = { address: '105 Springwood Parkway' }
      h.unit = { city: null, state: null, postal_code: null }
      h.assoc = { state: 'GA', compliance_settings: { community_city: 'Marietta', community_zip: '30067', other: 1 } }
      expect((await call()).status).toBe(200)
      expect(new URL(calls[0]).searchParams.get('location')).toBe('105 Springwood Pkwy, Marietta, GA 30067')
      expect(reasons()).toEqual(['geocode_denied'])
      const logged = JSON.stringify((console.info as unknown as { mock: { calls: unknown[] } }).mock.calls)
      expect(logged).not.toContain('Springwood')
      expect(logged).not.toContain('Marietta')
      expect(logged).not.toContain('30067')
      expect(logged).not.toContain('test-key-not-real')
    })
    it('still applies the precision checks to a community-built address', async () => {
      geoStatus = 'OK'
      geoType = 'APPROXIMATE'
      h.property = { address: '105 Springwood Parkway' }
      h.unit = { city: null, state: null, postal_code: null }
      h.assoc = { state: 'GA', compliance_settings: { community_city: 'Marietta', community_zip: '30067' } }
      await call()
      expect(reasons()).toEqual(['geocode_imprecise'])
      expect(new URL(calls[calls.length - 1]).searchParams.get('heading')).toBeNull()
    })
    it('404s with zero Google calls for an address whose only place is its own state', async () => {
      h.property = { address: '105 Springwood Parkway, GA' }
      h.unit = { city: null, state: null, postal_code: null }
      h.assoc = null
      const res = await call()
      expect(res.status).toBe(404)
      expect(calls).toHaveLength(0)
      expect(geoCalls).toHaveLength(0)
      expect(reasons()).toEqual(['state_only_location'])
    })
    it('a unit with only a state does not make a street-only address safe', async () => {
      h.property = { address: '105 Springwood Parkway' }
      h.unit = { city: null, state: 'GA', postal_code: null }
      expect((await call()).status).toBe(404)
      expect(calls).toHaveLength(0)
    })
    it('prefers the unit place over the association', async () => {
      h.property = { address: '105 Springwood Parkway' }
      h.unit = { city: 'Atlanta', state: 'GA', postal_code: '30067' }
      h.assoc = { state: 'FL' }
      await call()
      expect(new URL(calls[0]).searchParams.get('location')).toBe('105 Springwood Pkwy, Atlanta, GA 30067')
      expect(reasons()).not.toContain('state_only_location')
    })
    it('a full address ignores the association', async () => {
      h.assoc = { state: 'FL' }
      await call()
      expect(reasons()).not.toContain('state_only_location')
    })
  })

  describe('aimed at the house', () => {
    beforeEach(() => {
      geoStatus = 'OK'
    })

    it('geocodes, finds the panorama, then requests the image aimed at the house (3 calls)', async () => {
      const res = await call()
      expect(res.status).toBe(200)
      expect(geoCalls).toHaveLength(1)
      const geo = new URL(geoCalls[0])
      expect(geo.pathname).toBe('/maps/api/geocode/json')
      expect(geo.searchParams.get('address')).toBe('1234 Peachtree St NE, Atlanta, GA 30309')
      expect(geo.searchParams.get('key')).toBe('test-key-not-real')
      expect(calls).toHaveLength(2)
      const pano = new URL(calls[0])
      expect(pano.pathname).toBe('/maps/api/streetview/metadata')
      expect(pano.searchParams.get('location')).toBe('33.0001,-84')
      expect(pano.searchParams.get('source')).toBe('outdoor')
      expect(pano.searchParams.get('radius')).toBe('50')
      const img = new URL(calls[1])
      expect(img.pathname).toBe('/maps/api/streetview')
      expect(img.searchParams.get('pano')).toBe('PANO123')
      expect(img.searchParams.get('location')).toBeNull()
      expect(img.searchParams.get('heading')).toBe('0')
      expect(img.searchParams.get('pitch')).toBe('5')
      expect(img.searchParams.get('fov')).toBe('60')
    })

    it('accepts RANGE_INTERPOLATED', async () => {
      geoType = 'RANGE_INTERPOLATED'
      await call()
      expect(new URL(calls[1]).searchParams.get('pano')).toBe('PANO123')
    })

    it('signs all three URLs when a secret is set', async () => {
      process.env.GOOGLE_MAPS_URL_SIGNING_SECRET = 'c2VjcmV0LW5vdC1yZWFs'
      await call()
      for (const u of [geoCalls[0], calls[0], calls[1]]) expect(new URL(u).searchParams.get('signature')).toBeTruthy()
    })

    const expectOldPath = async () => {
      calls.length = 0
      const res = await call()
      expect(res.status).toBe(200)
      // The last two calls are the address-only coverage check and image (a failed pano lookup may precede them).
      const [metaUrl, imgUrl] = calls.slice(-2)
      expect(calls.length).toBeLessThanOrEqual(4)
      expect(new URL(metaUrl).searchParams.get('location')).toBe('1234 Peachtree St NE, Atlanta, GA 30309')
      const img = new URL(imgUrl)
      expect(img.searchParams.get('location')).toBe('1234 Peachtree St NE, Atlanta, GA 30309')
      expect(img.searchParams.get('heading')).toBeNull()
      expect(img.searchParams.get('fov')).toBe('80')
    }

    it('falls back when geocoding is denied, and logs only the code', async () => {
      geoStatus = 'REQUEST_DENIED'
      await expectOldPath()
      const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
      expect(logged).toContain('REQUEST_DENIED')
      expect(logged).not.toContain('Peachtree')
      expect(logged).not.toContain('test-key-not-real')
    })

    it('falls back on an approximate result', async () => {
      geoType = 'APPROXIMATE'
      await expectOldPath()
      geoType = 'GEOMETRIC_CENTER'
      await expectOldPath()
    })

    it('falls back when the geocode call errors or answers HTTP 500', async () => {
      geoThrow = true
      await expectOldPath()
      geoThrow = false
      geoHttp = 500
      await expectOldPath()
    })

    it('falls back when the panorama metadata is not OK', async () => {
      panoStatus = 'ZERO_RESULTS'
      await expectOldPath()
      panoStatus = 'OVER_QUERY_LIMIT'
      await expectOldPath()
    })

    it('skips the aimed attempt when little of the overall 10 s budget is left', async () => {
      let t = 1_000_000
      vi.spyOn(Date, 'now').mockImplementation(() => {
        t += 7000
        return t
      })
      const res = await call()
      expect(res.status).toBe(200)
      expect(geoCalls).toHaveLength(0)
      expect(new URL(calls[1]).searchParams.get('heading')).toBeNull()
    })

    it('falls back on a partial_match geocode', async () => {
      partial = true
      await expectOldPath()
    })

    it('falls back when the panorama is too far (alley or cross street, about 60 m)', async () => {
      panoLoc = { lat: 33.0001 - 0.00054, lng: -84.0 }
      await expectOldPath()
    })

    it('falls back when the panorama is too close (under 5 m)', async () => {
      panoLoc = { lat: 33.0001 - 0.00002, lng: -84.0 }
      await expectOldPath()
    })

    it('falls back to the address-only flow when the aimed image is 404, 5xx or not an image', async () => {
      for (const st of [404, 500, 0]) {
        aimedStatus = st
        await expectOldPath()
      }
    })

    it('returns 503 only if the address-only fallback also fails after the aimed image failed', async () => {
      aimedStatus = 500
      imageStatus = 500
      expect((await call()).status).toBe(503)
    })

    it('never logs the address on any path', async () => {
      geoThrow = true
      await call()
      geoThrow = false
      panoStatus = 'REQUEST_DENIED'
      await call()
      const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
      expect(logged).not.toContain('Peachtree')
      expect(logged).not.toContain('30309')
    })
  })
})
