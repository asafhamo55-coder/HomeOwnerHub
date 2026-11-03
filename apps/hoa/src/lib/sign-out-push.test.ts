import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  filters: [] as Array<[string, unknown]>,
  deleted: 0,
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ delete: () => {} }) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => ({
      delete: () => {
        h.deleted++
        const q = {
          eq: (k: string, v: unknown) => {
            h.filters.push([k, v])
            return q
          },
        }
        return q
      },
    }),
  }),
}))

import { removeMyPushSubscriptionOnSignOut } from '../app/actions/sign-out'

describe('removeMyPushSubscriptionOnSignOut', () => {
  it("deletes only the caller's row for the endpoint", async () => {
    await removeMyPushSubscriptionOnSignOut('https://push.example/abc')
    expect(h.deleted).toBe(1)
    expect(h.filters).toEqual([
      ['endpoint', 'https://push.example/abc'],
      ['user_id', 'user-a'],
    ])
  })

  it('does nothing without a session', async () => {
    h.user = null
    h.deleted = 0
    await removeMyPushSubscriptionOnSignOut('https://push.example/abc')
    expect(h.deleted).toBe(0)
  })
})
