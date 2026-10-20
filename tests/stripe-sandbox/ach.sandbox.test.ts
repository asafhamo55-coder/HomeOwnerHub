// ACH Direct Debit (us_bank_account).
//
// The app pins no payment_method_types, so whether a board can pay by ACH
// is whatever the account's payment-method configuration enables. The
// suite asks Stripe through the app's own createCheckoutSession: if
// us_bank_account is not offered, it asserts and records that, and the ACH
// payment cases skip. If it is, they run with Stripe's test bank accounts.
import type Stripe from 'stripe'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCheckoutSession } from '../../packages/billing/src/checkout'
import { monthlyCostCents } from '../../packages/billing/src/pricing'
import { Registry } from './lib/cleanup'
import { RETURN_URL, RUN, TAG, TEST_EMAIL, announceSkip, assertTestMode, createCustomer, createPlanPrices, newOrgId, sandboxStripe } from './lib/context'
import { pollUntil } from './lib/poll'
import { flushReport, record } from './lib/report'

announceSkip('ach')

// Stripe's documented test numbers (routing 110000000).
const ROUTING = '110000000'
const ACCOUNT_OK = '000123456789'
const ACCOUNT_CLOSED = '000111111116'
// Microdeposit test values.
const GOOD_AMOUNTS = [32, 45]
const GOOD_DESCRIPTOR = 'SM11AA'

describe.skipIf(!RUN)('ACH / us_bank_account (Stripe test mode)', () => {
  const reg = new Registry()
  let stripe: Stripe
  let achEnabled = false

  beforeAll(async () => {
    stripe = sandboxStripe()
    await assertTestMode(stripe)
    const prices = await createPlanPrices(stripe, reg)
    const s = await createCheckoutSession({
      orgId: newOrgId(),
      priceId: prices.monthly.id,
      plan: 'monthly',
      quantity: 41,
      mode: 'subscription',
      successUrl: RETURN_URL,
      cancelUrl: RETURN_URL,
      customerEmail: TEST_EMAIL,
    })
    reg.add('checkoutSession', s.id)
    achEnabled = s.payment_method_types.includes('us_bank_account')
  })

  afterAll(async () => {
    if (stripe) {
      const report = await reg.cleanup(stripe)
      flushReport('ach')
      expect(report.failures).toEqual([])
    }
  })

  it('records whether the app\'s Checkout offers ACH', () => {
    if (achEnabled) {
      record('ACH', 'us_bank_account IS offered by subscription Checkout in this account; ACH cases ran.')
      expect(achEnabled).toBe(true)
    } else {
      record('ACH', 'us_bank_account is NOT enabled in subscription Checkout (the app pins no payment_method_types); ACH cases skipped.')
      expect(achEnabled).toBe(false)
    }
  })

  async function achIntent(account: string) {
    const customer = await createCustomer(stripe, reg)
    const pi = await stripe.paymentIntents.create({
      amount: monthlyCostCents(0),
      currency: 'usd',
      customer: customer.id,
      payment_method_types: ['us_bank_account'],
      payment_method_data: {
        type: 'us_bank_account',
        us_bank_account: { routing_number: ROUTING, account_number: account, account_holder_type: 'company' },
        billing_details: { name: 'BL-103 Sandbox HOA', email: TEST_EMAIL },
      },
      payment_method_options: { us_bank_account: { verification_method: 'microdeposits' } },
      mandate_data: { customer_acceptance: { type: 'online', online: { ip_address: '127.0.0.1', user_agent: 'bl103-stripe-sandbox' } } },
      confirm: true,
      metadata: TAG,
    })
    reg.add('paymentIntent', pi.id)
    return pi
  }

  const settle = (id: string) =>
    pollUntil(
      () => stripe.paymentIntents.retrieve(id),
      (p) => p.status !== 'processing',
      { what: `ACH payment ${id} to leave processing`, timeoutMs: 150_000, intervalMs: 3_000 },
    )

  it('microdeposit verification (amounts), then the debit succeeds', async (ctx) => {
    if (!achEnabled) return ctx.skip()
    const pi = await achIntent(ACCOUNT_OK)
    expect(pi.status).toBe('requires_action')
    expect(pi.next_action?.type).toBe('verify_with_microdeposits')
    const verified = await stripe.paymentIntents.verifyMicrodeposits(pi.id, { amounts: GOOD_AMOUNTS })
    expect(['processing', 'succeeded']).toContain(verified.status)
    expect((await settle(pi.id)).status).toBe('succeeded')
  })

  it('microdeposit verification by descriptor code', async (ctx) => {
    if (!achEnabled) return ctx.skip()
    const pi = await achIntent(ACCOUNT_OK)
    const verified = await stripe.paymentIntents.verifyMicrodeposits(pi.id, { descriptor_code: GOOD_DESCRIPTOR })
    expect(['processing', 'succeeded']).toContain(verified.status)
  })

  it('wrong microdeposit amounts are refused', async (ctx) => {
    if (!achEnabled) return ctx.skip()
    const pi = await achIntent(ACCOUNT_OK)
    await expect(stripe.paymentIntents.verifyMicrodeposits(pi.id, { amounts: [10, 11] })).rejects.toMatchObject({
      type: 'StripeInvalidRequestError',
    })
  })

  it('a closed account fails after verification (back to requires_payment_method)', async (ctx) => {
    if (!achEnabled) return ctx.skip()
    const pi = await achIntent(ACCOUNT_CLOSED)
    await stripe.paymentIntents.verifyMicrodeposits(pi.id, { amounts: GOOD_AMOUNTS })
    const done = await settle(pi.id)
    expect(done.status).toBe('requires_payment_method')
    expect(done.last_payment_error?.code).toBeTruthy()
  })
})
