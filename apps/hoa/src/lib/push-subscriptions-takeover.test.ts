import { beforeEach, describe, expect, it, vi } from 'vitest'

// A shared browser: user A subscribed, then user B signs in. B may only
// take the endpoint over when the browser presents the stored keys, and
// the takeover goes through the service role after the session is checked.

const h = vi.hoisted(() => ({
  existing: null as null | { id: string; user_id: string; p256dh: string; auth: string },
  adminUpdates: [] as Array<Record<string, unknown>>,
  userUpserts: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: async () => ({ org: { id: 'org-b' } }),
}))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.existing, error: null }) }),
      }),
      update: (v: Record<string, unknown>) => {
        h.adminUpdates.push(v)
        return { eq: () => ({ eq: async () => ({ error: null }) }) }
      },
    }),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-b' } } }) },
    from: () => ({
      upsert: async (v: Record<string, unknown>) => {
        h.userUpserts.push(v)
        return { error: null }
      },
    }),
  }),
}))

import { savePushSubscription } from './push-subscriptions'

const input = { endpoint: 'https://push.example/abc', p256dh: 'key-1', auth: 'auth-1' }

beforeEach(() => {
  h.existing = null
  h.adminUpdates.length = 0
  h.userUpserts.length = 0
})

describe('savePushSubscription on a shared browser', () => {
  it("takes over another user's row when the keys match", async () => {
    h.existing = { id: 'r1', user_id: 'user-a', p256dh: 'key-1', auth: 'auth-1' }
    expect(await savePushSubscription(input)).toEqual({ ok: true })
    expect(h.adminUpdates).toHaveLength(1)
    expect(h.adminUpdates[0]).toMatchObject({ user_id: 'user-b', organization_id: 'org-b' })
    expect(h.userUpserts).toHaveLength(0)
  })

  it('refuses when the keys do not match', async () => {
    h.existing = { id: 'r1', user_id: 'user-a', p256dh: 'other', auth: 'auth-1' }
    const res = await savePushSubscription(input)
    expect(res.ok).toBe(false)
    expect(h.adminUpdates).toHaveLength(0)
    expect(h.userUpserts).toHaveLength(0)
  })

  it("uses the normal path for a free endpoint or the caller's own row", async () => {
    expect(await savePushSubscription(input)).toEqual({ ok: true })
    h.existing = { id: 'r2', user_id: 'user-b', p256dh: 'key-1', auth: 'auth-1' }
    expect(await savePushSubscription(input)).toEqual({ ok: true })
    expect(h.adminUpdates).toHaveLength(0)
    expect(h.userUpserts).toHaveLength(2)
  })
})
