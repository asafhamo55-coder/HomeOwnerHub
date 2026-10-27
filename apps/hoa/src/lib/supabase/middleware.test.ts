import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { SESSION_MAX_AGE_MS, SESSION_STAMP_COOKIE, signStamp } from '@/lib/session-cap'

// BL-074: middleware runs before EVERY page request, prefetch and RSC
// navigation. It used to call auth.getUser() — a network round trip to the
// Supabase auth server each time. It now verifies the session JWT locally
// with getClaims() (the project signs with asymmetric ES256 keys, so this is
// a WebCrypto check against the cached JWKS, not a request). Pages still
// call getUser once per render, and RLS still checks the token on every
// query. The 24h session cap must behave exactly as before.

const h = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  claimsError: null as unknown,
  user: null as { id: string } | null,
  accessToken: 'header.payload.sig' as string | undefined,
  calls: { getUser: 0, getClaims: 0, signOut: 0 },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => {
        h.calls.getUser += 1
        return { data: { user: h.user }, error: null }
      }),
      getClaims: vi.fn(async () => {
        h.calls.getClaims += 1
        return h.claims
          ? { data: { claims: h.claims, header: {}, signature: new Uint8Array() }, error: null }
          : { data: null, error: h.claimsError }
      }),
      getSession: vi.fn(async () => ({
        data: { session: h.accessToken ? { access_token: h.accessToken } : null },
        error: null,
      })),
      signOut: vi.fn(async () => {
        h.calls.signOut += 1
        return { error: null }
      }),
    },
  })),
}))

import { resetSessionCapWarningForTests, sessionCapSecret, updateSession } from './middleware'

const SECRET = 'test-secret'
const req = (path = '/dues', cookie?: string) => {
  const r = new NextRequest(new URL(path, 'http://hoa.test'))
  if (cookie) r.cookies.set(SESSION_STAMP_COOKIE, cookie)
  return r
}

beforeEach(() => {
  process.env.SESSION_CAP_SECRET = SECRET
  h.claims = { sub: 'user-1', session_id: 'sess-1', email: 'u@example.test' }
  h.claimsError = null
  h.user = { id: 'user-1' }
  h.accessToken = 'header.payload.sig'
  h.calls = { getUser: 0, getClaims: 0, signOut: 0 }
})

describe('updateSession (BL-074: no auth-server round trip per request)', () => {
  it('verifies the session locally: getClaims, never getUser', async () => {
    const res = await updateSession(req())
    expect(res.user).toMatchObject({ id: 'user-1' })
    expect(res.sessionExpired).toBe(false)
    expect(h.calls.getClaims).toBe(1)
    expect(h.calls.getUser).toBe(0)
  })

  it('no (or an invalid) session is signed out', async () => {
    h.claims = null
    h.claimsError = new Error('Invalid JWT signature')
    const res = await updateSession(req())
    expect(res.user).toBeNull()
    expect(h.calls.getUser).toBe(0)
  })

  it('claims without a subject are not a user', async () => {
    h.claims = { session_id: 'sess-1' }
    expect((await updateSession(req())).user).toBeNull()
  })

  it('strict mode asks the auth server (the sign-in pages, so a revoked session is not bounced into the app)', async () => {
    h.user = null
    const res = await updateSession(req('/login'), { strict: true })
    expect(res.user).toBeNull()
    expect(h.calls.getUser).toBe(1)
  })

  it('still expires a session past the 24h cap, and revokes it', async () => {
    const stamp = await signStamp('sess-1', Date.now() - SESSION_MAX_AGE_MS - 60_000, SECRET)
    // A real-shaped token whose payload carries the same session_id.
    const payload = Buffer.from(JSON.stringify({ session_id: 'sess-1' })).toString('base64url')
    h.accessToken = `e30.${payload}.sig`
    const res = await updateSession(req('/dues', stamp))
    expect(res.sessionExpired).toBe(true)
    expect(h.calls.signOut).toBe(1)
  })

  it('stamps a fresh session', async () => {
    const payload = Buffer.from(JSON.stringify({ session_id: 'sess-1' })).toString('base64url')
    h.accessToken = `e30.${payload}.sig`
    const res = await updateSession(req())
    expect(res.sessionExpired).toBe(false)
    expect(res.response.cookies.get(SESSION_STAMP_COOKIE)?.value).toMatch(/^sess-1\./)
  })
})

// BL-175a M4: the service-role fallback is kept (switching would sign every
// user out) but is logged once in production, never with a value.
describe('sessionCapSecret fallback', () => {
  beforeEach(() => resetSessionCapWarningForTests())

  it('prefers SESSION_CAP_SECRET without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(sessionCapSecret({ SESSION_CAP_SECRET: 'dedicated', SUPABASE_SERVICE_ROLE_KEY: 'srk', VERCEL_ENV: 'production' })).toBe('dedicated')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('falls back silently outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(sessionCapSecret({ SUPABASE_SERVICE_ROLE_KEY: 'srk-value', VERCEL_ENV: 'preview' })).toBe('srk-value')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('falls back in production, warning exactly once and never logging the value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const env = { SUPABASE_SERVICE_ROLE_KEY: 'srk-value', VERCEL_ENV: 'production' }
    expect(sessionCapSecret(env)).toBe('srk-value')
    expect(sessionCapSecret(env)).toBe('srk-value')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('SESSION_CAP_SECRET')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('srk-value')
    warn.mockRestore()
  })
})
