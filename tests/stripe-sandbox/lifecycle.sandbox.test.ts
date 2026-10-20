// Subscription lifecycle on Stripe test clocks: trial → active, renewal,
// failed renewal → past_due → recovery, cancel at period end, and a
// quantity and plan change with proration. Where the app reacts to the
// outcome, the REAL test-mode object is signed into the app's webhook
// handler (in-memory db) and its effect asserted.
import type Stripe from 'stripe'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ANNUAL_UNIT_CENTS, MONTHLY_UNIT_CENTS } from '../../packages/billing/src/pricing'
import { handleStripeWebhook } from '../../packages/billing/src/webhook'
import { AUDIT_SUBSCRIPTION_UPDATED, billingAttention } from '../../packages/billing/src/billing-status'
import { Registry } from './lib/cleanup'
import {
  RUN,
  TAG,
  announceSkip,
  assertTestMode,
  createClock,
  createCustomer,
  createPlanPrices,
  newOrgId,
  periodEnd,
  sandboxStripe,
  setDefaultCard,
  type PlanPrices,
} from './lib/context'
import { makeEvent, signEvent } from './lib/events'
import { createMemDb } from './lib/memdb'
import { DAY, advanceClock } from './lib/poll'
import { flushReport, record } from './lib/report'

announceSkip('lifecycle')

// Signing is local; the lifecycle file always has a secret to sign with,
// so its handler checks run even without STRIPE_TEST_WEBHOOK_SECRET.
const SIGNING_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_bl103_lifecycle_local'

describe.skipIf(!RUN)('subscription lifecycle on test clocks (Stripe test mode)', () => {
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
      flushReport('lifecycle')
      expect(report.failures).toEqual([])
    }
  })

  const advance = (clockId: string, to: number) => advanceClock(stripe.testHelpers.testClocks, clockId, to)

  /** A clock, a customer on it with a card, and a subscription the way Checkout creates one. */
  async function subscribed(label: string, opts: { trialDays?: number; quantity?: number; price?: Stripe.Price } = {}) {
    const clock = await createClock(stripe, reg, label)
    const customer = await createCustomer(stripe, reg, { paymentMethod: 'pm_card_visa', testClock: clock.id })
    const orgId = newOrgId()
    const plan = (opts.price ?? prices.monthly).id === prices.annual.id ? 'annual' : 'monthly'
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: (opts.price ?? prices.monthly).id, quantity: opts.quantity ?? 41 }],
      // What createCheckoutSession stamps via subscription_data.metadata.
      metadata: { ...TAG, org_id: orgId, plan },
      ...(opts.trialDays ? { trial_period_days: opts.trialDays } : {}),
    })
    reg.add('subscription', sub.id)
    reg.markOnClock(sub.id)
    return { clock, customer, sub, orgId, plan }
  }

  async function invoices(subId: string) {
    return (await stripe.invoices.list({ subscription: subId, limit: 20 })).data
  }

  async function deliver(event: Stripe.Event, db: ReturnType<typeof createMemDb>, m1: boolean) {
    const d = signEvent(stripe, event, SIGNING_SECRET)
    return handleStripeWebhook({ rawBody: d.rawBody, signatureHeader: d.signatureHeader, webhookSecret: SIGNING_SECRET }, { db: db.db, stripe, m1 })
  }

  it('trial → active, then a renewal, each invoiced at unit × quantity', async () => {
    const { clock, sub } = await subscribed('trial', { trialDays: 14 })
    expect(sub.status).toBe('trialing')
    expect(sub.trial_end).toBeTruthy()

    await advance(clock.id, sub.trial_end! + DAY)
    const active = await stripe.subscriptions.retrieve(sub.id)
    expect(active.status).toBe('active')
    const afterTrial = await invoices(sub.id)
    const firstCharge = afterTrial.find((i) => i.amount_due > 0)
    expect(firstCharge).toMatchObject({ status: 'paid', amount_paid: MONTHLY_UNIT_CENTS * 41 })

    const end = periodEnd(active)
    await advance(clock.id, end + DAY)
    const renewed = await stripe.subscriptions.retrieve(sub.id)
    expect(renewed.status).toBe('active')
    expect(periodEnd(renewed)).toBeGreaterThan(end)
    const paid = (await invoices(sub.id)).filter((i) => i.amount_due > 0 && i.status === 'paid')
    expect(paid).toHaveLength(2)
  })

  it('failed renewal → past_due (recorded, banner raised) → recovery (banner cleared)', async () => {
    const { clock, customer, sub, orgId } = await subscribed('pastdue')
    expect(sub.status).toBe('active')

    // A card that attaches but declines every charge.
    await setDefaultCard(stripe, customer.id, 'pm_card_chargeCustomerFail')
    await advance(clock.id, periodEnd(sub) + DAY)

    const pastDue = await stripe.subscriptions.retrieve(sub.id)
    expect(pastDue.status).toBe('past_due')
    const failed = (await invoices(sub.id)).find((i) => i.status === 'open')
    expect(failed).toBeTruthy()
    expect(failed!.attempt_count).toBeGreaterThanOrEqual(1)

    // The real failed invoice and the real past_due subscription, signed,
    // through the app's handler: both are recorded (ids only) and raise the
    // banner; the plan is untouched (Stripe retries on its own).
    for (const m1 of [false, true]) {
      const db = createMemDb()
      db.addOrg(orgId, { plan: 'monthly', stripe_customer_id: customer.id, stripe_sub_id: sub.id })
      const r = await deliver(makeEvent('invoice.payment_failed', failed as unknown as Record<string, unknown>, { created: pastDue.created + 1 }), db, m1)
      expect(r).toEqual({ ok: true, outcome: 'invoice_failed' })
      expect(billingAttention(db.audit(), sub.id)).toMatchObject({ reason: 'payment_failed' })
      const u = await deliver(makeEvent('customer.subscription.updated', pastDue as unknown as Record<string, unknown>), db, m1)
      expect(u).toEqual({ ok: true, outcome: 'subscription_updated' })
      expect(billingAttention(db.audit(), sub.id)).toMatchObject({ reason: 'past_due' })
      expect(db.billing(orgId)).toEqual({ plan: 'monthly', stripe_sub_id: sub.id })
    }
    record('Lifecycle', 'past_due reaches the app: invoice.payment_failed and customer.subscription.updated are recorded, and the dashboard banner shows.')

    // Recovery: a good card, pay the open invoice.
    await setDefaultCard(stripe, customer.id, 'pm_card_visa')
    const paid = await stripe.invoices.pay(failed!.id)
    expect(paid.status).toBe('paid')
    const recovered = await stripe.subscriptions.retrieve(sub.id)
    expect(recovered.status).toBe('active')

    // The recovery, one second later than the past_due as Stripe would send it, clears the banner.
    const db = createMemDb()
    db.addOrg(orgId, { plan: 'monthly', stripe_customer_id: customer.id, stripe_sub_id: sub.id })
    const t = Math.floor(Date.now() / 1000)
    await deliver(makeEvent('customer.subscription.updated', pastDue as unknown as Record<string, unknown>, { created: t }), db, false)
    await deliver(makeEvent('customer.subscription.updated', recovered as unknown as Record<string, unknown>, { created: t + 1 }), db, false)
    expect(billingAttention(db.audit(), sub.id)).toBeNull()
  })

  it('cancel at period end: stays active, then ends; the real deletion downgrades the org', async () => {
    const { clock, customer, sub, orgId } = await subscribed('cancel')
    const flagged = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true })
    expect(flagged).toMatchObject({ status: 'active', cancel_at_period_end: true })
    record('Lifecycle', 'the API accepts cancel_at_period_end in month 1; nothing in the app enforces the 12-month commitment.')

    await advance(clock.id, periodEnd(flagged) + DAY)
    const ended = await stripe.subscriptions.retrieve(sub.id)
    expect(ended.status).toBe('canceled')

    // M1 off (today): deletion matched by customer.
    const pre = createMemDb()
    pre.addOrg(orgId, { plan: 'monthly', stripe_customer_id: customer.id, stripe_sub_id: sub.id })
    expect(await deliver(makeEvent('customer.subscription.deleted', ended as unknown as Record<string, unknown>), pre, false)).toEqual({
      ok: true,
      outcome: 'subscription_deleted',
    })
    expect(pre.billing(orgId)).toEqual({ plan: 'free', stripe_sub_id: null })

    // M1 on: checkout recorded first, then the real deletion by sub id.
    const m1 = createMemDb()
    m1.addOrg(orgId)
    const checkout = makeEvent('checkout.session.completed', {
      id: 'cs_test_bl103',
      object: 'checkout.session',
      mode: 'subscription',
      customer: customer.id,
      subscription: sub.id,
      metadata: { org_id: orgId, plan: 'monthly' },
    }, { created: sub.created })
    expect((await deliver(checkout, m1, true)).outcome).toBe('subscription_started')
    expect((await deliver(makeEvent('customer.subscription.deleted', ended as unknown as Record<string, unknown>), m1, true)).outcome).toBe(
      'subscription_deleted',
    )
    expect(m1.billing(orgId)).toEqual({ plan: 'free', stripe_sub_id: null })
  })

  it('quantity change mid-cycle prorates; monthly → annual credits the unused month', async () => {
    const { clock, customer, sub, orgId } = await subscribed('proration')
    const start = (await stripe.testHelpers.testClocks.retrieve(clock.id)).frozen_time
    await advance(clock.id, start + 15 * DAY)

    const item = sub.items.data[0]!
    const bigger = await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, quantity: 180 }],
      proration_behavior: 'always_invoice',
      expand: ['latest_invoice'],
    })
    const prorated = bigger.latest_invoice as Stripe.Invoice
    const fullDifference = MONTHLY_UNIT_CENTS * (180 - 41)
    expect(prorated.status).toBe('paid')
    expect(prorated.amount_paid).toBeGreaterThan(0.3 * fullDifference)
    expect(prorated.amount_paid).toBeLessThan(0.7 * fullDifference)

    // The real update through the handler: the quantity reaches doors_count.
    const db = createMemDb()
    db.addOrg(orgId, { plan: 'monthly', stripe_customer_id: customer.id, stripe_sub_id: sub.id, doors_count: 41 })
    const t = Math.floor(Date.now() / 1000)
    const r = await deliver(makeEvent('customer.subscription.updated', bigger as unknown as Record<string, unknown>, { created: t }), db, false)
    expect(r).toEqual({ ok: true, outcome: 'subscription_updated' })
    expect(db.org(orgId)!.doors_count).toBe(180)

    const annual = await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: prices.annual.id, quantity: 180 }],
      proration_behavior: 'always_invoice',
      expand: ['latest_invoice'],
    })
    expect(annual.items.data[0]!.price.id).toBe(prices.annual.id)
    const switchInvoice = annual.latest_invoice as Stripe.Invoice
    const fullAnnual = ANNUAL_UNIT_CENTS * 180
    expect(switchInvoice.status).toBe('paid')
    expect(switchInvoice.amount_paid).toBeLessThan(fullAnnual)
    expect(switchInvoice.amount_paid).toBeGreaterThan(fullAnnual - MONTHLY_UNIT_CENTS * 180)

    // The suite's prices carry no lookup key (the real keys belong to the
    // account's live-config prices), so map them the way an env-configured
    // deployment does. Under M1 the switch reaches orgs.plan; before it,
    // 0000's plan check would refuse 'annual', so it is recorded only.
    vi.stubEnv('STRIPE_PRICE_PER_DOOR_ANNUAL', prices.annual.id)
    try {
      for (const m1 of [false, true]) {
        const sw = createMemDb()
        sw.addOrg(orgId, { plan: 'monthly', stripe_customer_id: customer.id, stripe_sub_id: sub.id, doors_count: 180 })
        const u = await deliver(makeEvent('customer.subscription.updated', annual as unknown as Record<string, unknown>), sw, m1)
        expect(u).toEqual({ ok: true, outcome: 'subscription_updated' })
        expect(sw.billing(orgId)?.plan).toBe(m1 ? 'annual' : 'monthly')
        expect(sw.audit(AUDIT_SUBSCRIPTION_UPDATED)[0]!.metadata).toMatchObject({ plan: 'annual', quantity: 180 })
      }
    } finally {
      vi.unstubAllEnvs()
    }
    record('Lifecycle', 'a quantity change syncs doors_count; a monthly → annual switch reaches orgs.plan under M1 and is recorded only before it.')
  })
})
