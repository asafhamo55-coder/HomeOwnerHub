import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORG = 'org-1'
const ID = '11111111-1111-4111-8111-111111111111'
const h = vi.hoisted(() => ({ flag: true, photoPath: null as string | null, address: '1234 Peachtree St NE, Atlanta, GA 30309' }))

vi.mock('@homeowner-portal/db/m20', () => ({
  get M20_APPLIED() {
    return h.flag
  },
}))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => ({ role: 'board', org: { id: ORG, name: 'T', hub_type: 'hoa', plan: 'pro', doors_count: 1 } })),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'is', 'eq', 'order', 'limit']) q[m] = () => q
      q.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
      q.maybeSingle = async () => ({ data: { address: h.address, photo_path: h.photoPath }, error: null })
      return q
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://files.example/s?t=1' }, error: null }) }) },
  })),
}))

import { GET } from './route'

const call = () => GET(new Request(`http://x/api/properties/${ID}/photo`), { params: Promise.resolve({ id: ID }) })
const urls: string[] = []

beforeEach(() => {
  h.flag = true
  h.photoPath = null
  urls.length = 0
  process.env.GOOGLE_MAPS_API_KEY = 'k'
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) => {
      urls.push(String(u))
      if (String(u).startsWith('https://files.example')) return new Response('UPLOADED', { status: 200 })
      return new Response('{"status":"ZERO_RESULTS"}', { status: 200 })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GOOGLE_MAPS_API_KEY
})

describe('the photo route with M20', () => {
  it('serves the uploaded photo and never calls Google', async () => {
    h.photoPath = `${ORG}/${ID}/front.jpg`
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('UPLOADED')
    expect(urls.every((u) => u.startsWith('https://files.example'))).toBe(true)
  })

  it('serves the uploaded photo even when no Google key is set', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY
    h.photoPath = `${ORG}/${ID}/front.jpg`
    expect((await call()).status).toBe(200)
  })

  it('falls back to Street View after a remove (no path)', async () => {
    const res = await call()
    expect(urls.some((u) => u.includes('maps.googleapis.com'))).toBe(true)
    expect(res.status).toBe(404) // the fake Google has no imagery here
  })

  it('ignores a stored path while the flag is off', async () => {
    h.flag = false
    h.photoPath = `${ORG}/${ID}/front.jpg`
    await call()
    expect(urls.some((u) => u.startsWith('https://files.example'))).toBe(false)
  })
})
