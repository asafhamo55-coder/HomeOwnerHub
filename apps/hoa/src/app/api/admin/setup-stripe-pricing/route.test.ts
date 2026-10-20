import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  platformAdmin: false,
  configured: true,
  products: [] as Array<{ id: string; name: string }>,
  existingPrices: {} as Record<string, { id: string; unit_amount: number; lookup_key: string }>,
  failWith: null as Error | null,
  productCreates: 0,
  priceCreates: 0,
}))

vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => h.platformAdmin) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
  })),
}))

function fakeStripe() {
  const maybeFail = () => {
    if (h.failWith) throw h.failWith
  }
  return {
    products: {
      list: () => {
        maybeFail()
        return {
          async *[Symbol.asyncIterator]() {
            for (const p of h.products) yield p
          },
        }
      },
      create: async (p: { name: string }) => {
        maybeFail()
        h.productCreates++
        return { id: 'prod_new', name: p.name }
      },
    },
    prices: {
      search: async ({ query }: { query: string }) => {
        maybeFail()
        const key = /lookup_key:'([^']+)'/.exec(query)?.[1] ?? ''
        const hit = h.existingPrices[key]
        return { data: hit ? [hit] : [] }
      },
      create: async (p: { unit_amount: number; lookup_key: string }) => {
        maybeFail()
        h.priceCreates++
        return { id: `price_${p.lookup_key}`, unit_amount: p.unit_amount, lookup_key: p.lookup_key }
      },
    },
  }
}

vi.mock('@homeowner-portal/billing', async (orig) => ({
  // The real pure pricing (BL-104 tiers, PRICING_V2 = false); Stripe is faked.
  ...(await orig<typeof import('@homeowner-portal/billing')>()),
  MONTHLY_UNIT_CENTS: 499,
  ANNUAL_UNIT_CENTS: 5388,
  isStripeConfigured: () => h.configured,
  getStripe: () => (h.configured ? fakeStripe() : null),
}))

import { POST } from './route'

const SECRET = 'stripe-setup-s3cret'
const req = (auth?: string) =>
  new Request('https://hoa.test/api/admin/setup-stripe-pricing', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
  })

async function body(res: Response) {
  return (await res.json()) as Record<string, unknown> & {
    error?: { code: string; message: string }
  }
}

describe('POST /api/admin/setup-stripe-pricing', () => {
  beforeEach(() => {
    h.user = { id: 'user-1' }
    h.platformAdmin = false
    h.configured = true
    h.products = []
    h.existingPrices = {}
    h.failWith = null
    h.productCreates = 0
    h.priceCreates = 0
    vi.stubEnv('STRIPE_PRICING_SETUP_SECRET', SECRET)
    vi.stubEnv('CRON_SECRET', 'cron-s3cret')
  })
  afterEach(() => vi.unstubAllEnvs())

  describe('auth (RC-3, RC-4, RC-7)', () => {
    it('signed out, no bearer → 401 envelope', async () => {
      h.user = null
      const res = await POST(req())
      expect(res.status).toBe(401)
      expect((await body(res)).error?.code).toBe('unauthenticated')
    })

    it('signed in but not platform staff → 403 envelope', async () => {
      const res = await POST(req())
      expect(res.status).toBe(403)
      const b = await body(res)
      expect(b.error?.code).toBe('forbidden')
      expect(typeof b.error?.message).toBe('string')
      expect(h.priceCreates + h.productCreates).toBe(0)
    })

    it('CRON_SECRET no longer unlocks Stripe price setup (R-21 / C-06)', async () => {
      const res = await POST(req('Bearer cron-s3cret'))
      expect(res.status).toBe(401)
      expect((await body(res)).error?.code).toBe('unauthenticated')
      expect(h.priceCreates + h.productCreates).toBe(0)
    })

    it('a wrong bearer → 401, even for a platform admin session', async () => {
      h.platformAdmin = true
      const res = await POST(req('Bearer nope'))
      expect(res.status).toBe(401)
      expect(h.priceCreates).toBe(0)
    })

    it('a bearer with the dedicated secret unset fails closed → 503 not_configured', async () => {
      vi.stubEnv('STRIPE_PRICING_SETUP_SECRET', '')
      const res = await POST(req(`Bearer ${SECRET}`))
      expect(res.status).toBe(503)
      expect((await body(res)).error?.code).toBe('not_configured')
    })

    it('platform admin session works', async () => {
      h.platformAdmin = true
      expect((await POST(req())).status).toBe(200)
    })

    it('the dedicated bearer secret works', async () => {
      expect((await POST(req(`Bearer ${SECRET}`))).status).toBe(200)
    })
  })

  it('Stripe not configured → 503 not_configured envelope', async () => {
    h.configured = false
    const res = await POST(req(`Bearer ${SECRET}`))
    expect(res.status).toBe(503)
    expect((await body(res)).error?.code).toBe('not_configured')
  })

  it('a Stripe failure → 503 upstream_unavailable JSON envelope, no raw provider text (RC-2, RC-10)', async () => {
    h.failWith = Object.assign(new Error('No such price: price_secret_internal_detail'), {
      type: 'StripeInvalidRequestError',
      code: 'resource_missing',
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req(`Bearer ${SECRET}`))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(text).not.toContain('price_secret_internal_detail')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('price_secret_internal_detail')
    spy.mockRestore()
  })

  it('creates product + both prices; camelCase body with integer cents (RC-11)', async () => {
    const res = await POST(req(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    const b = await body(res)
    expect(b.error).toBeUndefined()
    expect(b).toEqual({
      product: { id: 'prod_new', name: 'HOA Hub' },
      prices: {
        monthly: {
          id: 'price_hoa_per_door_monthly',
          unitAmountCents: 499,
          interval: 'month',
          lookupKey: 'hoa_per_door_monthly',
        },
        annual: {
          id: 'price_hoa_per_door_annual',
          unitAmountCents: 5388,
          interval: 'year',
          lookupKey: 'hoa_per_door_annual',
        },
      },
      // BL-104: the band Prices are created only once PRICING_V2 is on.
      bandPrices: [],
      nextSteps: expect.any(Array),
    })
    expect(h.productCreates).toBe(1)
    expect(h.priceCreates).toBe(2)
  })

  it('is idempotent: finds the product past the first page and reuses prices (RC-9)', async () => {
    h.products = [
      ...Array.from({ length: 150 }, (_, i) => ({ id: `prod_${i}`, name: `Other ${i}` })),
      { id: 'prod_hoa', name: 'HOA Hub' },
    ]
    h.existingPrices = {
      hoa_per_door_monthly: { id: 'price_m', unit_amount: 499, lookup_key: 'hoa_per_door_monthly' },
      hoa_per_door_annual: { id: 'price_a', unit_amount: 5388, lookup_key: 'hoa_per_door_annual' },
    }
    const res = await POST(req(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    const b = (await res.json()) as { product: { id: string }; prices: { monthly: { id: string } } }
    expect(b.product.id).toBe('prod_hoa')
    expect(b.prices.monthly.id).toBe('price_m')
    expect(h.productCreates + h.priceCreates).toBe(0)
  })
})
