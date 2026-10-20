import { describe, expect, it } from 'vitest'
import { planV2Checkout, type V2CheckoutFacts } from './checkout-v2'

const NEW: V2CheckoutFacts = {
  plan: 'essentials',
  cadence: 'monthly',
  unitCount: 50,
  currentPlan: 'free',
  stripeSubId: null,
  stripeCustomerId: null,
}

describe('planV2Checkout (no Stripe calls)', () => {
  it('a first subscription: lookup key, quantity = units, 30-day trial, no card to start', () => {
    expect(planV2Checkout(NEW)).toEqual({
      ok: true,
      lookupKey: 'hoa_essentials_monthly',
      priceEnv: 'STRIPE_PRICE_ESSENTIALS_MONTHLY',
      quantity: 50,
      metadataPlan: 'essentials',
      trialPeriodDays: 30,
      paymentMethodCollection: 'if_required',
    })
  })

  it('plan × cadence picks the Price', () => {
    const r = planV2Checkout({ ...NEW, plan: 'complete', cadence: 'annual' })
    expect(r).toMatchObject({ ok: true, lookupKey: 'hoa_complete_annual', priceEnv: 'STRIPE_PRICE_COMPLETE_ANNUAL', metadataPlan: 'complete' })
  })

  it('an org that checked out before gets no second trial and must give a card', () => {
    const r = planV2Checkout({ ...NEW, stripeCustomerId: 'cus_1' })
    expect(r).toMatchObject({ ok: true, paymentMethodCollection: 'always' })
    expect(r).not.toHaveProperty('trialPeriodDays')
  })

  it('0 homes blocks checkout', () => {
    expect(planV2Checkout({ ...NEW, unitCount: 0 })).toMatchObject({ ok: false, reason: 'no_units' })
    expect(planV2Checkout({ ...NEW, unitCount: Number.NaN })).toMatchObject({ ok: false, reason: 'no_units' })
  })

  it('a grandfathered $4.99/door subscriber keeps their price: no checkout', () => {
    const r = planV2Checkout({ ...NEW, currentPlan: 'monthly', stripeSubId: 'sub_1', stripeCustomerId: 'cus_1' })
    expect(r).toMatchObject({ ok: false, reason: 'grandfathered' })
  })

  it('an org already on a new plan changes it in the portal, not a second checkout', () => {
    const r = planV2Checkout({ ...NEW, currentPlan: 'complete', stripeSubId: 'sub_1', stripeCustomerId: 'cus_1' })
    expect(r).toMatchObject({ ok: false, reason: 'already_subscribed' })
  })

  it('the quantity is the server count, never fractional', () => {
    expect(planV2Checkout({ ...NEW, unitCount: 401.9 })).toMatchObject({ ok: true, quantity: 401 })
  })
})
