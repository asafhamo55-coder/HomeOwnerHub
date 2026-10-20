// Checkout session creation through the app's own createCheckoutSession,
// for every plan and a spread of door counts including the minimum.
import type Stripe from 'stripe'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCheckoutSession } from '../../packages/billing/src/checkout'
import { ANNUAL_UNIT_CENTS, MONTHLY_UNIT_CENTS, billableDoors } from '../../packages/billing/src/pricing'
import { Registry } from './lib/cleanup'
import {
  RETURN_URL,
  RUN,
  TEST_EMAIL,
  announceSkip,
  assertTestMode,
  createCustomer,
  createPlanPrices,
  newOrgId,
  sandboxStripe,
  type PlanPrices,
} from './lib/context'
import { flushReport, record } from './lib/report'

announceSkip('checkout')

describe.skipIf(!RUN)('checkout sessions (Stripe test mode)', () => {
  const reg = new Registry()
  let stripe: Stripe
  let prices: PlanPrices

  beforeAll(async () => {
    stripe = sandboxStripe()
    await assertTestMode(stripe)
    prices = await createPlanPrices(stripe, reg)
  })

  afterAll(async () => {
    if (stripe) {
      const report = await reg.cleanup(stripe)
      flushReport('checkout')
      expect(report.failures).toEqual([])
    }
  })

  async function session(input: Partial<Parameters<typeof createCheckoutSession>[0]> & { priceId: string; plan: string }) {
    const s = await createCheckoutSession({
      orgId: newOrgId(),
      mode: 'subscription',
      successUrl: RETURN_URL,
      cancelUrl: RETURN_URL,
      customerEmail: TEST_EMAIL,
      ...input,
    })
    reg.add('checkoutSession', s.id)
    return s
  }

  // 0 and 10 fall under the minimum (41); 41 is exactly it; 42 just over.
  const DOORS = [0, 10, 40, 41, 42, 180, 1000]
  const PLANS = [
    { plan: 'monthly', unit: MONTHLY_UNIT_CENTS, price: () => prices.monthly },
    { plan: 'annual', unit: ANNUAL_UNIT_CENTS, price: () => prices.annual },
  ] as const

  for (const p of PLANS) {
    for (const doors of DOORS) {
      it(`${p.plan}, ${doors} doors → quantity ${billableDoors(doors)}, Stripe total = unit × quantity`, async () => {
        const qty = billableDoors(doors)
        const orgId = newOrgId()
        const s = await session({ orgId, priceId: p.price().id, plan: p.plan, quantity: qty })

        expect(s.id).toMatch(/^cs_test_/)
        expect(s.livemode).toBe(false)
        expect(s.mode).toBe('subscription')
        expect(s.url).toMatch(/^https:\/\/checkout\.stripe\.com\//)
        expect(s.metadata).toEqual({ org_id: orgId, plan: p.plan })
        expect(s.success_url).toBe(`${RETURN_URL}?session_id={CHECKOUT_SESSION_ID}`)
        expect(s.customer_email).toBe(TEST_EMAIL)
        expect(s.amount_subtotal).toBe(p.unit * qty)
        expect(s.amount_total).toBe(p.unit * qty)

        const items = await stripe.checkout.sessions.listLineItems(s.id)
        expect(items.data).toHaveLength(1)
        expect(items.data[0]).toMatchObject({ quantity: qty, price: { id: p.price().id, unit_amount: p.unit } })
      })
    }
  }

  it('the minimum bill is 41 doors: $204.59 monthly, $2,209.08 annual', async () => {
    const m = await session({ priceId: prices.monthly.id, plan: 'monthly', quantity: billableDoors(1) })
    const a = await session({ priceId: prices.annual.id, plan: 'annual', quantity: billableDoors(1) })
    expect(m.amount_total).toBe(20_459)
    expect(a.amount_total).toBe(220_908)
  })

  it('Stripe rejects a non-integer quantity; billableDoors never produces one (BL-103 fix)', async () => {
    await expect(session({ priceId: prices.monthly.id, plan: 'monthly', quantity: 41.5 })).rejects.toMatchObject({
      type: 'StripeInvalidRequestError',
    })
    const s = await session({ priceId: prices.monthly.id, plan: 'monthly', quantity: billableDoors(41.5) })
    expect(s.amount_total).toBe(MONTHLY_UNIT_CENTS * 42)
    const n = await session({ priceId: prices.monthly.id, plan: 'monthly', quantity: billableDoors(Number('not-a-number')) })
    expect(n.amount_total).toBe(MONTHLY_UNIT_CENTS * 41)
  })

  it('an existing customer is reused (card on file) and the email is not sent alongside it', async () => {
    const customer = await createCustomer(stripe, reg)
    const s = await session({ priceId: prices.monthly.id, plan: 'monthly', quantity: 41, customerId: customer.id })
    expect(s.customer).toBe(customer.id)
    expect(s.customer_email).toBeNull()
  })

  it('one-time (mode: payment) checkout carries case metadata', async () => {
    const orgId = newOrgId()
    const caseId = newOrgId()
    const s = await session({ orgId, priceId: prices.oneTime.id, plan: 'per_case', mode: 'payment', extraMetadata: { case_id: caseId } })
    expect(s.mode).toBe('payment')
    expect(s.metadata).toEqual({ org_id: orgId, plan: 'per_case', case_id: caseId })
    expect(s.amount_total).toBe(9_900)
    record('Payment methods (payment mode)', `[${s.payment_method_types.join(', ')}]`)
  })

  it('records the payment-method types Checkout offers (the app pins none: dashboard config decides)', async () => {
    const s = await session({ priceId: prices.monthly.id, plan: 'monthly', quantity: 41 })
    expect(s.payment_method_types).toContain('card')
    record('Payment methods (subscription mode)', `[${s.payment_method_types.join(', ')}]`)
  })
})
