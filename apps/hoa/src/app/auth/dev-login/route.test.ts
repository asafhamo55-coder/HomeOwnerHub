import { afterEach, describe, expect, it, vi } from 'vitest'

const generateLink = vi.fn(async () => ({ data: null, error: { message: 'x' } }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { generateLink } } }),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn() }))

import { GET } from './route'

// BL-175a M8: the dev-login route mints sessions with the service-role key.
describe('GET /auth/dev-login', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    generateLink.mockClear()
  })

  const call = () => GET(new Request('https://app.example/auth/dev-login') as never)

  it('404s when DEV_AUTOLOGIN is off', async () => {
    vi.stubEnv('DEV_AUTOLOGIN', '0')
    expect((await call()).status).toBe(404)
  })

  it('404s on Vercel production even when DEV_AUTOLOGIN=1, without touching Supabase', async () => {
    vi.stubEnv('DEV_AUTOLOGIN', '1')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('DEV_AUTOLOGIN_EMAIL', 'a@example.com')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k')
    expect((await call()).status).toBe(404)
    expect(generateLink).not.toHaveBeenCalled()
  })

  it('still runs in a non-production environment with the flag on', async () => {
    vi.stubEnv('DEV_AUTOLOGIN', '1')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('DEV_AUTOLOGIN_EMAIL', 'a@example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k')
    expect((await call()).status).toBe(500)
    expect(generateLink).toHaveBeenCalled()
  })
})
