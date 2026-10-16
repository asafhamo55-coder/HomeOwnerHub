import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BL-004 wiring for web push: sendPushToUsers asks the outbound guard which
 * users may be pushed BEFORE it looks up their devices. Push targets user
 * ids, so the allowlist entry for a push recipient is `user:<id>`.
 * web-push itself is mocked — nothing here can reach a real device.
 */

const sendNotification = vi.fn()
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
}))

const RESIDENT = 'user-resident'
const OWNER = 'user-owner'

/** Records which user ids the subscription lookup asked for. */
function fakeDb(opts: { orgMode?: 'sandbox' | 'live' } = {}) {
  const askedFor: string[][] = []
  const from = vi.fn((table: string) => {
    if (table === 'associations') {
      const result = {
        data: [{ compliance_settings: { outbound_mode: opts.orgMode ?? 'live' } }],
        error: null,
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r),
      }
      return chain
    }
    // push_subscriptions
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: (_col: string, ids: string[]) => {
        askedFor.push(ids)
        return Promise.resolve({
          data: ids.map((id) => ({ id: `sub-${id}`, endpoint: `https://push/${id}`, p256dh: 'p', auth: 'a' })),
          error: null,
        })
      },
    }
    return chain
  })
  return { db: { from }, askedFor }
}

const content = { title: 'New ticket', body: 'b', link: '/tickets/1', tag: 't' }
const logger = { warn: vi.fn() }

async function fresh() {
  vi.resetModules()
  return (await import('./web-push')).sendPushToUsers
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'pub')
  vi.stubEnv('VAPID_PRIVATE_KEY', 'priv')
  vi.stubEnv('OUTBOUND_ALLOWLIST', `user:${OWNER}`)
  sendNotification.mockReset()
  sendNotification.mockResolvedValue({})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sendPushToUsers outbound guard', () => {
  it('in preview, never pushes a non-allowlisted user', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { db, askedFor } = fakeDb()
    const pushed = await (await fresh())(db, 'org-1', [RESIDENT], content, logger)
    expect(pushed).toBe(0)
    expect(sendNotification).not.toHaveBeenCalled()
    expect(askedFor).toEqual([])
  })

  it('in preview, pushes only the allowlisted user', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { db, askedFor } = fakeDb()
    const pushed = await (await fresh())(db, 'org-1', [RESIDENT, OWNER], content, logger)
    expect(askedFor).toEqual([[OWNER]])
    expect(pushed).toBe(1)
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })

  it('in production, pushes everyone', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { db, askedFor } = fakeDb()
    const pushed = await (await fresh())(db, 'org-1', [RESIDENT, OWNER], content, logger)
    expect(askedFor).toEqual([[RESIDENT, OWNER]])
    expect(pushed).toBe(2)
  })

  it('in production, a sandboxed org pushes only the allowlist', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { db } = fakeDb({ orgMode: 'sandbox' })
    const pushed = await (await fresh())(db, 'org-1', [RESIDENT], content, logger)
    expect(pushed).toBe(0)
    expect(sendNotification).not.toHaveBeenCalled()
  })
})
