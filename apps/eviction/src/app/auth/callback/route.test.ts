import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: async () => ({ error: null }) } }),
}))

import { GET } from './route'

// BL-175a H6: ?next= must never send a freshly signed-in user off-site.
describe('auth callback ?next= (open redirect)', () => {
  it.each(['javascript:alert(1)', '//evil.com', 'https://evil.com', '/\\evil.com'])(
    'sends %s to the home page on this origin',
    async (next) => {
      const res = await GET(
        new Request(`https://app.example/auth/callback?code=c&next=${encodeURIComponent(next)}`) as never,
      )
      const loc = new URL(res.headers.get('location')!)
      expect(loc.origin).toBe('https://app.example')
      expect(loc.pathname).toBe('/')
    },
  )

  it('keeps a same-site path', async () => {
    const res = await GET(new Request('https://app.example/auth/callback?code=c&next=%2Fcases%3Fa%3D1') as never)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.pathname + loc.search).toBe('/cases?a=1')
  })
})
