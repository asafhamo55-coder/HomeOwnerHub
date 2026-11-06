import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn(() => ({})) }))
const load = vi.hoisted(() => vi.fn())
vi.mock('@/lib/calendar-feed/load', () => ({ loadFeedData: load }))

import { GET } from './route'
import { signFeedToken } from '@/lib/calendar-feed/token'

const U = '11111111-1111-4111-8111-111111111111'
const O = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SECRET = 's'.repeat(40)
const call = (token: string) => GET(new Request('http://x/calendar/' + token), { params: Promise.resolve({ token }) })

afterEach(() => {
  vi.unstubAllEnvs()
  load.mockReset()
})

describe('GET /calendar/[token]', () => {
  it('404s with no secret configured in production, and never reads the database', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('CALENDAR_FEED_SECRET', '')
    const res = await call(signFeedToken(SECRET, { userId: U, orgId: O, version: 0 }))
    expect(res.status).toBe(404)
    expect(load).not.toHaveBeenCalled()
  })

  it('404s a tampered token before any database read', async () => {
    vi.stubEnv('CALENDAR_FEED_SECRET', SECRET)
    const res = await call(`${U}.${O}.0.${'A'.repeat(43)}`)
    expect(res.status).toBe(404)
    expect(load).not.toHaveBeenCalled()
  })

  it('404s a revoked link and 503s a failed read', async () => {
    vi.stubEnv('CALENDAR_FEED_SECRET', SECRET)
    const t = signFeedToken(SECRET, { userId: U, orgId: O, version: 0 })
    load.mockResolvedValueOnce({ ok: false, reason: 'denied' })
    expect((await call(t)).status).toBe(404)
    load.mockResolvedValueOnce({ ok: false, reason: 'error' })
    expect((await call(t)).status).toBe(503)
  })

  it('serves a private, cacheable calendar for a good token (also with .ics)', async () => {
    vi.stubEnv('CALENDAR_FEED_SECRET', SECRET)
    load.mockResolvedValue({
      ok: true,
      data: { associationName: 'Oak Glen', timeZone: 'America/New_York', today: '2026-11-06', meetings: [], events: [] },
    })
    const t = signFeedToken(SECRET, { userId: U, orgId: O, version: 0 })
    const res = await call(`${t}.ics`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, max-age=900')
    expect(res.headers.get('content-type')).toContain('text/calendar')
    expect(await res.text()).toContain('BEGIN:VCALENDAR')
    expect(load).toHaveBeenCalledWith(expect.anything(), { userId: U, orgId: O, version: 0 })
  })
})
