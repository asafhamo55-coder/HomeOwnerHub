import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-30 cut-over: for the few minutes between the deploy and the owner
// creating the band Prices (POST /api/admin/setup-stripe-pricing), a board
// that clicks Subscribe must get the friendly error, not a crash and not a
// Stripe checkout session.

const h = vi.hoisted(() => ({
  search: vi.fn(async (_q: unknown): Promise<{ data: Array<{ id: string }> }> => ({ data: [] })),
  searchThrows: false,
  createCheckoutSession: vi.fn(async (_a: unknown) => ({ url: 'https://checkout.stripe.test/c' })),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => ({ role: 'admin', org: { id: 'org-1', name: 'Test HOA' } })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.test' } } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = async () => ({ data: { plan: 'free', stripe_customer_id: null, stripe_sub_id: null }, error: null })
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve(table === 'hoa_properties' ? { count: 30, error: null } : { error: null }).then(res)
      return chain
    },
  })),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@homeowner-portal/billing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@homeowner-portal/billing')>()),
  isStripeConfigured: () => true,
  getStripe: () => ({
    prices: {
      search: async (q: unknown) => {
        if (h.searchThrows) throw Object.assign(new Error('boom'), { type: 'StripeConnectionError' })
        return h.search(q)
      },
    },
  }),
  createCheckoutSession: h.createCheckoutSession,
}))

const { startHoaCheckout } = await import('./billing')

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.stubEnv('STRIPE_PRICE_ESSENTIALS_MONTHLY', '')
  h.search.mockClear()
  h.searchThrows = false
  h.createCheckoutSession.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('v2 checkout before the band Prices exist', () => {
  it('no Price under the lookup key: friendly error, no session, the lookup key is logged', async () => {
    const res = await startHoaCheckout({} as never, form({ plan: 'essentials', cadence: 'monthly' }))
    expect(res).toHaveProperty('error')
    expect(h.search).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(h.search.mock.calls)).toContain('hoa_essentials_monthly')
    expect(h.createCheckoutSession).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain('hoa_essentials_monthly')
  })

  it('the Price lookup itself failing is the same friendly error, not a throw', async () => {
    h.searchThrows = true
    const res = await startHoaCheckout({} as never, form({ plan: 'complete', cadence: 'annual' }))
    expect(res).toHaveProperty('error')
    expect(h.createCheckoutSession).not.toHaveBeenCalled()
  })

  it('once the Price exists, the same click starts a session', async () => {
    h.search.mockResolvedValueOnce({ data: [{ id: 'price_ess_m' }] })
    const res = await startHoaCheckout({} as never, form({ plan: 'essentials', cadence: 'monthly' }))
    expect(h.createCheckoutSession).toHaveBeenCalledTimes(1)
    expect((res as { error?: string } | undefined)?.error).toBeUndefined()
  })
})
