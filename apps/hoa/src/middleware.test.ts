import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({ user: null as { id: string } | null, sessionExpired: false }))

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(async (request: NextRequest) => ({
    user: h.user,
    sessionExpired: h.sessionExpired,
    response: NextResponse.next({ request }),
  })),
  clearAuthCookies: vi.fn((_req: NextRequest, res: NextResponse) => {
    res.headers.set('x-test-cleared', '1')
    return res
  }),
}))

import { config, middleware } from './middleware'

const req = (path: string) => new NextRequest(new URL(path, 'http://hoa.test'))

beforeEach(() => {
  h.user = null
  h.sessionExpired = false
})

describe('middleware: /api/* without a session (R-03 / C-03)', () => {
  it('returns the JSON 401 envelope instead of a 307 to /login', async () => {
    const res = await middleware(req('/api/ai/rewrite'))
    expect(res.status).toBe(401)
    expect(res.headers.get('location')).toBeNull()
    expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: expect.any(String) } })
  })

  it('returns 401 JSON (and clears the auth cookies) when the 24h session cap expired', async () => {
    h.user = { id: 'u' }
    h.sessionExpired = true
    const res = await middleware(req('/api/governing-docs/upload'))
    expect(res.status).toBe(401)
    expect(res.headers.get('x-test-cleared')).toBe('1')
    expect((await res.json()).error.code).toBe('unauthenticated')
  })

  it('still redirects a page request to /login', async () => {
    const res = await middleware(req('/violations'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('still redirects an expired page session to /login with the reason', async () => {
    h.user = { id: 'u' }
    h.sessionExpired = true
    const res = await middleware(req('/violations'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('reason=session-expired')
  })

  it('lets public token API routes through without a session', async () => {
    for (const p of ['/api/rfp-bid/tok/submit', '/api/vendor-onboard/tok/submit']) {
      const res = await middleware(req(p))
      expect(res.status).toBe(200)
    }
  })

  it('does not treat /apix or /api-docs as an API path', async () => {
    const res = await middleware(req('/api-docs'))
    expect(res.status).toBe(307)
  })

  it('passes a signed-in API call through', async () => {
    h.user = { id: 'u' }
    const res = await middleware(req('/api/ai/rewrite'))
    expect(res.status).toBe(200)
  })
})

describe('middleware matcher exclusions are anchored (C-16)', () => {
  // Next compiles the matcher source to a regex over the pathname; the
  // negative lookahead is the part that decides exclusion.
  const matcher = new RegExp(`^${config.matcher[0]}$`)
  const runs = (p: string) => matcher.test(p)

  it('excludes exactly the routes that carry their own auth', () => {
    for (const p of [
      '/api/health',
      '/api/inngest',
      '/api/cron/recurring-events',
      '/api/cron/sentry-test',
      '/api/webhooks/stripe',
      '/api/webhooks/resend',
      '/api/webhooks/plaid',
      '/api/oauth/google/callback',
      '/api/oauth/google/start',
      '/api/admin/setup-stripe-pricing',
      '/favicon.ico',
      '/_next/static/chunk.js',
      '/sw.js',
    ]) {
      expect(runs(p), p).toBe(false)
    }
  })

  it('gates any look-alike future route', () => {
    for (const p of [
      '/api/healthcare-reports',
      '/api/health/details',
      '/api/inngest-admin',
      '/api/cron-admin',
      '/api/oauth-clients',
      '/api/webhooks-config',
      '/api/admin/setup-stripe-pricing-v2',
      '/favicon.icon-admin',
      '/api/ai/rewrite',
      '/violations',
    ]) {
      expect(runs(p), p).toBe(true)
    }
  })
})
