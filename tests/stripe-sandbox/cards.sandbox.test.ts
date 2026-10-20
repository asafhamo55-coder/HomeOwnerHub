// Card outcomes with Stripe's test PaymentMethods, both as a direct charge
// of the minimum monthly bill and as a subscription's first invoice (what
// Checkout does for a board).
import type Stripe from 'stripe'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MONTHLY_UNIT_CENTS, monthlyCostCents } from '../../packages/billing/src/pricing'
import { Registry } from './lib/cleanup'
import { RUN, TAG, announceSkip, assertTestMode, createCustomer, createPlanPrices, sandboxStripe, type PlanPrices } from './lib/context'
import { flushReport } from './lib/report'

announceSkip('cards')

describe.skipIf(!RUN)('card payments (Stripe test mode)', () => {
  const reg = new Registry()
  let stripe: Stripe
  let prices: PlanPrices
  const AMOUNT = monthlyCostCents(0) // $204.59, the minimum monthly bill

  beforeAll(async () => {
    stripe = sandboxStripe()
    await assertTestMode(stripe)
    prices = await createPlanPrices(stripe, reg)
  })

  afterAll(async () => {
    if (stripe) {
      const report = await reg.cleanup(stripe)
      flushReport('cards')
      expect(report.failures).toEqual([])
    }
  })

  async function charge(pm: string) {
    try {
      const pi = await stripe.paymentIntents.create({
        amount: AMOUNT,
        currency: 'usd',
        payment_method_types: ['card'],
        payment_method: pm,
        confirm: true,
        metadata: TAG,
      })
      reg.add('paymentIntent', pi.id)
      return { pi, error: null }
    } catch (e) {
      const err = e as Stripe.errors.StripeError & { payment_intent?: { id: string } }
      reg.add('paymentIntent', err.payment_intent?.id)
      return { pi: null, error: err }
    }
  }

  it('pm_card_visa succeeds', async () => {
    const { pi, error } = await charge('pm_card_visa')
    expect(error).toBeNull()
    expect(pi).toMatchObject({ status: 'succeeded', amount_received: AMOUNT, livemode: false })
  })

  it('pm_card_chargeDeclined is declined (generic_decline)', async () => {
    const { pi, error } = await charge('pm_card_chargeDeclined')
    expect(pi).toBeNull()
    expect(error).toMatchObject({ type: 'StripeCardError', code: 'card_declined', decline_code: 'generic_decline' })
  })

  it('insufficient funds is declined (insufficient_funds)', async () => {
    const { pi, error } = await charge('pm_card_visa_chargeDeclinedInsufficientFunds')
    expect(pi).toBeNull()
    expect(error).toMatchObject({ type: 'StripeCardError', code: 'card_declined', decline_code: 'insufficient_funds' })
  })

  it('pm_card_authenticationRequired triggers 3D Secure (requires_action)', async () => {
    const { pi, error } = await charge('pm_card_authenticationRequired')
    expect(error).toBeNull()
    expect(pi?.status).toBe('requires_action')
    expect(['use_stripe_sdk', 'redirect_to_url']).toContain(pi?.next_action?.type)
  })

  describe('as a subscription first invoice (what Checkout does)', () => {
    it('visa: active, first invoice paid for unit × quantity', async () => {
      const c = await createCustomer(stripe, reg, { paymentMethod: 'pm_card_visa' })
      const sub = await stripe.subscriptions.create({
        customer: c.id,
        items: [{ price: prices.monthly.id, quantity: 41 }],
        metadata: TAG,
        expand: ['latest_invoice'],
      })
      reg.add('subscription', sub.id)
      expect(sub.status).toBe('active')
      const inv = sub.latest_invoice as Stripe.Invoice
      expect(inv).toMatchObject({ status: 'paid', amount_paid: MONTHLY_UNIT_CENTS * 41 })
    })

    it('3DS card: subscription is incomplete until the customer authenticates', async () => {
      const c = await createCustomer(stripe, reg, { paymentMethod: 'pm_card_authenticationRequired' })
      const sub = await stripe.subscriptions.create({
        customer: c.id,
        items: [{ price: prices.monthly.id, quantity: 41 }],
        metadata: TAG,
        expand: ['latest_invoice'],
      })
      reg.add('subscription', sub.id)
      expect(sub.status).toBe('incomplete')
      expect((sub.latest_invoice as Stripe.Invoice).status).toBe('open')
    })

    it('a card that attaches but fails to charge: error_if_incomplete refuses the subscription', async () => {
      const c = await createCustomer(stripe, reg, { paymentMethod: 'pm_card_chargeCustomerFail' })
      await expect(
        stripe.subscriptions.create({
          customer: c.id,
          items: [{ price: prices.monthly.id, quantity: 41 }],
          payment_behavior: 'error_if_incomplete',
          metadata: TAG,
        }),
      ).rejects.toMatchObject({ type: 'StripeCardError', code: 'card_declined' })
    })
  })
})
