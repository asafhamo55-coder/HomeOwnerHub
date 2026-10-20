// Shared setup for the *.sandbox.test.ts files: the gate, a test-mode
// Stripe client, the plan prices, and cleanup. Only imported by sandbox
// test files (which network); the pure helpers live beside it.

import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { ANNUAL_UNIT_CENTS, MONTHLY_UNIT_CENTS } from '../../../packages/billing/src/pricing'
import { STRIPE_API_VERSION } from '../../../packages/billing/src/client'
import { decideSandbox, type SandboxDecision } from './guard'
import { CLOCK_NAME_PREFIX, Registry, SUITE_TAG } from './cleanup'

export const decision: SandboxDecision = decideSandbox(process.env)
export const RUN = decision.mode === 'run'
export const WEBHOOKS = decision.mode === 'run' && decision.webhookSecret != null

/** One log line per skipped file, saying why. */
export function announceSkip(file: string): void {
  if (decision.mode !== 'run') console.warn(`[stripe-sandbox] ${file}: ${decision.reason}`)
  else if (file === 'webhooks' && decision.webhookSkipReason) console.warn(`[stripe-sandbox] ${file}: ${decision.webhookSkipReason}`)
}

export const RUN_ID = `${process.env.GITHUB_RUN_ID ?? 'local'}-${Date.now().toString(36)}`
export const TAG = { ...SUITE_TAG, bl103_run: RUN_ID }

/** Reserved domain (RFC 2606): Stripe test mode sends nothing, and nothing could be delivered. */
export const TEST_EMAIL = 'board+bl103@example.com'
export const RETURN_URL = 'https://example.com/settings/billing'

let client: Stripe | null = null

/** The suite's own client, on the test key, pinned to the app's API version. */
export function sandboxStripe(): Stripe {
  if (decision.mode !== 'run') throw new Error('sandboxStripe() called while the suite is not in run mode')
  client ??= new Stripe(decision.secretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    maxNetworkRetries: 2,
    appInfo: { name: 'homeownerhub-bl103-stripe-sandbox' },
  })
  return client
}

/**
 * Belt and braces on top of the key-prefix guard: ask Stripe itself. A
 * live-mode answer stops the run before anything is created.
 */
export async function assertTestMode(stripe: Stripe): Promise<void> {
  const balance = await stripe.balance.retrieve()
  if (balance.livemode !== false) throw new Error('Stripe reports LIVE mode for the sandbox key. Refusing to continue.')
}

export interface PlanPrices {
  productId: string
  monthly: Stripe.Price
  annual: Stripe.Price
  /** One-time price for mode: 'payment' checkout (eviction per-case style). */
  oneTime: Stripe.Price
}

/**
 * The plan prices, created exactly as /api/admin/setup-stripe-pricing
 * creates them (same unit amounts, interval, currency) but WITHOUT its
 * lookup keys: lookup keys are account-wide, and this suite must never
 * collide with, or be picked up as, a real setup in the test account.
 */
export async function createPlanPrices(stripe: Stripe, reg: Registry): Promise<PlanPrices> {
  const product = await stripe.products.create({ name: `BL-103 sandbox ${RUN_ID}`, metadata: TAG })
  reg.add('product', product.id)
  const mk = async (p: Omit<Stripe.PriceCreateParams, 'currency' | 'product'>) => {
    const price = await stripe.prices.create({ ...p, product: product.id, currency: 'usd', metadata: TAG })
    reg.add('price', price.id)
    return price
  }
  return {
    productId: product.id,
    monthly: await mk({ unit_amount: MONTHLY_UNIT_CENTS, recurring: { interval: 'month' }, nickname: 'BL-103 monthly per door' }),
    annual: await mk({ unit_amount: ANNUAL_UNIT_CENTS, recurring: { interval: 'year' }, nickname: 'BL-103 annual per door' }),
    oneTime: await mk({ unit_amount: 9_900, nickname: 'BL-103 one-time' }),
  }
}

export async function createCustomer(
  stripe: Stripe,
  reg: Registry,
  opts: { paymentMethod?: string; testClock?: string } = {},
): Promise<Stripe.Customer> {
  const customer = await stripe.customers.create({
    email: TEST_EMAIL,
    name: 'BL-103 Sandbox HOA',
    metadata: TAG,
    ...(opts.testClock ? { test_clock: opts.testClock } : {}),
    ...(opts.paymentMethod
      ? { payment_method: opts.paymentMethod, invoice_settings: { default_payment_method: opts.paymentMethod } }
      : {}),
  })
  reg.add('customer', customer.id)
  return customer
}

export async function createClock(stripe: Stripe, reg: Registry, label: string, frozenTime = Math.floor(Date.now() / 1000)) {
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: frozenTime, name: `${CLOCK_NAME_PREFIX}${label}-${RUN_ID}`.slice(0, 300) })
  reg.add('testClock', clock.id)
  return clock
}

/** Make the customer's default card a fresh attachment of a test PaymentMethod. */
export async function setDefaultCard(stripe: Stripe, customerId: string, testPm: string): Promise<string> {
  const pm = await stripe.paymentMethods.attach(testPm, { customer: customerId })
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } })
  return pm.id
}

export const newOrgId = () => randomUUID()

/**
 * Subscription period end. API 2025-03-31+ (the app pins clover) moved it
 * from the subscription to its items; read both so the suite survives
 * either shape.
 */
export function periodEnd(sub: Stripe.Subscription): number {
  const loose = sub as unknown as { current_period_end?: number; items: { data: Array<{ current_period_end?: number }> } }
  const v = loose.items.data[0]?.current_period_end ?? loose.current_period_end
  if (typeof v !== 'number') throw new Error('subscription has no current_period_end')
  return v
}
