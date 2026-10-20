// Customer portal session creation through the app's createPortalSession.
import type Stripe from 'stripe'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPortalSession } from '../../packages/billing/src/checkout'
import { Registry } from './lib/cleanup'
import { RETURN_URL, RUN, announceSkip, assertTestMode, createCustomer, sandboxStripe } from './lib/context'
import { flushReport, record } from './lib/report'

announceSkip('portal')

describe.skipIf(!RUN)('customer portal (Stripe test mode)', () => {
  const reg = new Registry()
  let stripe: Stripe

  beforeAll(async () => {
    stripe = sandboxStripe()
    await assertTestMode(stripe)
  })

  afterAll(async () => {
    if (stripe) {
      const report = await reg.cleanup(stripe)
      flushReport('portal')
      expect(report.failures).toEqual([])
    }
  })

  it('creates a portal session for a customer and returns its billing.stripe.com URL', async () => {
    const customer = await createCustomer(stripe, reg)
    let url: string
    try {
      url = await createPortalSession({ customerId: customer.id, returnUrl: RETURN_URL })
    } catch (e) {
      const err = e as { type?: string; code?: string; message?: string }
      if (err.type === 'StripeInvalidRequestError' && /configuration/i.test(err.message ?? '')) {
        throw new Error(
          'The test-mode Customer Portal has no default configuration. Save it once in the Stripe dashboard ' +
            '(test mode → Settings → Billing → Customer portal). The app passes no configuration id, so live mode needs the same.',
        )
      }
      throw e
    }
    expect(url).toMatch(/^https:\/\/billing\.stripe\.com\//)
  })

  it('records what the default portal configuration lets a board do', async () => {
    const configs = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })
    const cfg = configs.data[0]
    expect(cfg).toBeTruthy()
    const f = cfg!.features
    record(
      'Portal',
      `default config ${cfg!.id}: cancel=${f.subscription_cancel.enabled} (mode ${f.subscription_cancel.mode}), ` +
        `update subscription=${f.subscription_update.enabled}, update payment method=${f.payment_method_update.enabled}, ` +
        `invoice history=${f.invoice_history.enabled}`,
    )
    if (f.subscription_cancel.enabled) {
      record('Portal', 'cancellation is enabled in the portal while the app promises a 12-month commitment; nothing enforces it.')
    }
  })
})
