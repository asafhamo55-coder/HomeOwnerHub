import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// ONE_PLAN_NEW_PRICES on: checkout sells the new HomeownerHub Prices and
// nothing older. The flag is a module constant, so mock it before import.
vi.mock('./pricing-flag', () => ({ PRICING_V2: true, ONE_PLAN_NEW_PRICES: true }))

const { planV2Checkout } = await import('./checkout-v2')
const { planForPrice } = await import('./billing-status')

beforeAll(() => {})
afterAll(() => vi.doUnmock('./pricing-flag'))

const NEW = { cadence: 'monthly', unitCount: 50, currentPlan: 'free', stripeSubId: null, stripeCustomerId: null } as const

describe('checkout with the new Prices on', () => {
  it('monthly and annual look up only the new lookup keys and env overrides', () => {
    expect(planV2Checkout({ ...NEW })).toMatchObject({
      ok: true,
      lookupKey: 'hoa_homeownerhub_monthly',
      priceEnv: 'STRIPE_PRICE_HOMEOWNERHUB_MONTHLY',
      metadataPlan: 'essentials',
      trialPeriodDays: 30,
      paymentMethodCollection: 'if_required',
    })
    expect(planV2Checkout({ ...NEW, cadence: 'annual' })).toMatchObject({
      lookupKey: 'hoa_homeownerhub_annual',
      priceEnv: 'STRIPE_PRICE_HOMEOWNERHUB_ANNUAL',
    })
  })

  it('a forged plan field cannot select Essentials or Complete', () => {
    for (const plan of ['essentials', 'complete']) {
      const r = planV2Checkout({ ...NEW, plan } as never)
      expect(r).toMatchObject({ ok: true, lookupKey: 'hoa_homeownerhub_monthly' })
    }
  })

  it('the webhook stores a new-Price subscription as essentials and still reads every older Price', () => {
    expect(planForPrice({ lookup_key: 'hoa_homeownerhub_monthly' })).toBe('essentials')
    expect(planForPrice({ lookup_key: 'hoa_homeownerhub_annual' })).toBe('essentials')
    expect(planForPrice({ id: 'price_h', lookup_key: null }, { STRIPE_PRICE_HOMEOWNERHUB_ANNUAL: 'price_h' })).toBe('essentials')
    expect(planForPrice({ lookup_key: 'hoa_essentials_monthly' })).toBe('essentials')
    expect(planForPrice({ lookup_key: 'hoa_complete_annual' })).toBe('complete')
    expect(planForPrice({ lookup_key: 'hoa_per_door_monthly' })).toBe('monthly')
  })
})
