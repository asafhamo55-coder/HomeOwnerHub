import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: async () => ({ error: null }) } }),
}))

import { GET } from './route'
import { safeNextPath } from '@/lib/safe-next-path'

describe('auth callback ?next=', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/dues?tab=a')).toBe('/dues?tab=a')
    expect(safeNextPath(null)).toBe('/')
  })

  it('refuses anything that could leave the site', () => {
    for (const v of ['//evil.example', '/\\evil.example', 'https://evil.example', 'evil.example', '/ x']) {
      expect(safeNextPath(v)).toBe('/')
    }
  })

  it('redirects a protocol-relative next to the home page, not off-site', async () => {
    const res = await GET(new Request('https://app.example/auth/callback?code=c&next=//evil.example/p') as never)
    expect(new URL(res.headers.get('location')!).origin).toBe('https://app.example')
  })
})
