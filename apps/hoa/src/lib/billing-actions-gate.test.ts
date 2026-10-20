import { beforeEach, describe, expect, it, vi } from 'vitest'

// Security review 2026-10-20 follow-up: the billing server actions are
// public POST endpoints. Only an HOA admin may open the Stripe portal or
// start a checkout; residents and board members are refused before any
// database read or Stripe call. No Stripe calls are made here.

const h = vi.hoisted(() => ({
  role: 'resident' as 'admin' | 'board' | 'resident' | null,
  createPortalSession: vi.fn(async () => 'https://billing.stripe.test/p'),
  createCheckoutSession: vi.fn(async () => ({ url: 'https://checkout.stripe.test/c' })),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA' } },
  ),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    throw new Error('reached the database')
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected')
  }),
}))
vi.mock('@homeowner-portal/billing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@homeowner-portal/billing')>()),
  isStripeConfigured: () => true,
  getStripe: () => null,
  createPortalSession: h.createPortalSession,
  createCheckoutSession: h.createCheckoutSession,
}))

const { openHoaPortal, startHoaCheckout } = await import('./billing')
const { getSupabaseServerClient } = await import('@/lib/supabase/server')

function form(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.mocked(getSupabaseServerClient).mockClear()
  h.createPortalSession.mockClear()
  h.createCheckoutSession.mockClear()
})

describe('billing actions are admin-only', () => {
  for (const role of ['resident', 'board', null] as const) {
    it(`${role ?? 'no membership'}: openHoaPortal does nothing`, async () => {
      h.role = role
      await expect(openHoaPortal()).resolves.toBeUndefined()
      expect(getSupabaseServerClient).not.toHaveBeenCalled()
      expect(h.createPortalSession).not.toHaveBeenCalled()
    })

    it(`${role ?? 'no membership'}: startHoaCheckout is refused`, async () => {
      h.role = role
      const res = await startHoaCheckout({} as never, form({ plan: 'monthly', cadence: 'monthly', doors: '1' }))
      expect(res).toEqual({ error: 'Only an HOA admin can change billing.' })
      expect(getSupabaseServerClient).not.toHaveBeenCalled()
      expect(h.createCheckoutSession).not.toHaveBeenCalled()
    })
  }

  it('admin gets past the gate (control)', async () => {
    h.role = 'admin'
    await expect(openHoaPortal()).rejects.toThrow('reached the database')
  })
})
