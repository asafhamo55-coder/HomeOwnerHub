import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

let org: { id: string } | null = { id: 'org-1' }
let user: { id: string } | null = { id: 'user-1' }
let role: 'admin' | 'board' | 'resident' | null = 'admin'

const getCurrentOrg = vi.fn(async () => org)
const getCurrentUserRoleInOrg = vi.fn(async () => role)
const startConnect = vi.fn((_orgId: string, _userId: string, _returnTo: string, _nonce: string) => 'https://accounts.google.com/o/oauth2/v2/auth?state=s')

vi.mock('@/lib/orgs', () => ({ getCurrentOrg }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRoleInOrg }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock('@/lib/inbox/connect', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/inbox/connect')>()
  return { ...real, startConnect }
})

const { GET } = await import('./route')

const ENV = {
  MAILBOX_TOKEN_KEY: 'k',
  GOOGLE_OAUTH_CLIENT_ID: 'id',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://app.example/api/oauth/google/callback',
}

function get(query = ''): Promise<Response> {
  return GET(new Request(`https://app.example/api/oauth/google/start${query}`))
}

function location(res: Response): URL {
  const loc = res.headers.get('location')
  expect(loc).toBeTruthy()
  return new URL(loc!)
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  org = { id: 'org-1' }
  user = { id: 'user-1' }
  role = 'admin'
  startConnect.mockClear()
  startConnect.mockImplementation(() => 'https://accounts.google.com/o/oauth2/v2/auth?state=s')
  getCurrentOrg.mockClear()
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  errorSpy.mockRestore()
})

// ─── Tests ───────────────────────────────────────────────────────────

describe('GET /api/oauth/google/start', () => {
  it('sends a signed-out caller to /login before looking up an org', async () => {
    user = null
    const res = await get()
    expect(res.status).toBe(307)
    expect(location(res).pathname).toBe('/login')
    expect(getCurrentOrg).not.toHaveBeenCalled()
    expect(startConnect).not.toHaveBeenCalled()
  })

  it('sends a caller with no org to /onboarding', async () => {
    org = null
    const res = await get()
    expect(location(res).pathname).toBe('/onboarding')
    expect(startConnect).not.toHaveBeenCalled()
  })

  it.each(['board', 'resident', null] as const)('refuses role %s with ?error=forbidden (a code, not a message)', async (r) => {
    role = r
    const res = await get('?returnTo=/onboarding/setup')
    const url = location(res)
    expect(url.origin).toBe('https://app.example')
    expect(url.pathname).toBe('/onboarding/setup')
    expect(url.searchParams.get('error')).toBe('forbidden')
    expect(startConnect).not.toHaveBeenCalled()
  })

  it('redirects an admin to the Google consent URL', async () => {
    const res = await get('?returnTo=/onboarding/setup')
    expect(location(res).origin).toBe('https://accounts.google.com')
    expect(startConnect).toHaveBeenCalledWith('org-1', 'user-1', '/onboarding/setup', expect.any(String))
  })

  it('sets the nonce cookie (httpOnly, secure, Lax, 10 min) matching the nonce signed into state', async () => {
    const res = await get()
    const nonce = startConnect.mock.calls[0][3]
    expect(nonce.length).toBeGreaterThanOrEqual(16)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`hh_gmail_oauth_nonce=${nonce}`)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toMatch(/Max-Age=600/i)
  })

  it('sanitises a hostile returnTo before redirecting or signing it', async () => {
    role = 'resident'
    const res = await get(`?returnTo=${encodeURIComponent('//evil.example/x')}`)
    const url = location(res)
    expect(url.origin).toBe('https://app.example')
    expect(url.pathname).toBe('/settings/mailbox')
  })

  it('keeps an existing query on returnTo intact when appending the error code', async () => {
    role = 'board'
    const res = await get(`?returnTo=${encodeURIComponent('/settings/mailbox?tab=a')}`)
    const url = location(res)
    expect(url.searchParams.get('tab')).toBe('a')
    expect(url.searchParams.get('error')).toBe('forbidden')
  })

  it('reports a missing OAuth env var as ?error=not_configured without naming it', async () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', '')
    const res = await get()
    const url = location(res)
    expect(url.searchParams.get('error')).toBe('not_configured')
    expect(res.headers.get('location')).not.toContain('GOOGLE')
    expect(startConnect).not.toHaveBeenCalled()
  })

  it('never puts a thrown message in the redirect URL or the log', async () => {
    startConnect.mockImplementation(() => {
      throw new Error('SECRET_INTERNAL_DETAIL jane@example.com')
    })
    const res = await get()
    const loc = res.headers.get('location') ?? ''
    expect(new URL(loc).searchParams.get('error')).toBe('internal')
    expect(loc).not.toContain('SECRET_INTERNAL_DETAIL')
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('SECRET_INTERNAL_DETAIL')
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('jane@example.com')
  })

  it('answers an unexpected throw before the redirect with the JSON 500 envelope, no raw text', async () => {
    getCurrentOrg.mockImplementationOnce(async () => {
      throw new Error('SECRET_INTERNAL_DETAIL')
    })
    const res = await get()
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(text).not.toContain('SECRET_INTERNAL_DETAIL')
  })
})
