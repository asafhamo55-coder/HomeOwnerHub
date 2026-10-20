// Webhooks: for every event type the app handles, a payload signed with
// the TEST webhook secret (stripe.webhooks.generateTestHeaderString) is
// fed to the app's real handler — and to the real Next route — with an
// in-memory db. No database, no network for the deliveries themselves.
//
// Handled today (packages/billing/src/webhook.ts):
//   checkout.session.completed   (mode subscription | payment, + case_id)
//   customer.subscription.deleted
//   invoice.payment_failed       (acknowledged only)
// Everything else is ignored.
import type Stripe from 'stripe'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { handleStripeWebhook, webhookHttpStatus } from '../../packages/billing/src/webhook'
import { RUN, WEBHOOKS, announceSkip, decision, newOrgId, sandboxStripe } from './lib/context'
import { makeEvent, signEvent, webhookRequest } from './lib/events'
import { createMemDb, type MemDb } from './lib/memdb'

// The route builds its db with createAdminClient(); hand it the in-memory
// one instead. Same module the billing package imports (resolved by path).
const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../packages/db/src/index.ts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createAdminClient: () => {
    if (!holder.db) throw new Error('test did not install an in-memory db')
    return holder.db
  },
}))

announceSkip('webhooks')

const SECRET = decision.mode === 'run' ? decision.webhookSecret ?? '' : ''

describe.skipIf(!RUN || !WEBHOOKS)('webhook handler with signed test payloads', () => {
  let stripe: Stripe
  beforeAll(() => {
    stripe = sandboxStripe()
  })
  afterEach(() => {
    holder.db = null
  })

  const deliver = (event: Stripe.Event | string, mem: MemDb, m1: boolean, opts: { secret?: string; timestamp?: number } = {}) => {
    const d = signEvent(stripe, event, opts.secret ?? SECRET, { timestamp: opts.timestamp })
    return handleStripeWebhook({ ...d, webhookSecret: SECRET }, { db: mem.db, stripe, m1 })
  }

  const checkoutSub = (orgId: string, subId: string, plan: string, created?: number) =>
    makeEvent(
      'checkout.session.completed',
      {
        id: `cs_test_${subId}`,
        object: 'checkout.session',
        mode: 'subscription',
        status: 'complete',
        customer: 'cus_bl103',
        subscription: subId,
        payment_intent: null,
        metadata: { org_id: orgId, plan },
      },
      { created },
    )
  const subDeleted = (subId: string, created?: number) =>
    makeEvent('customer.subscription.deleted', { id: subId, object: 'subscription', status: 'canceled', customer: 'cus_bl103' }, { created })

  for (const m1 of [false, true]) {
    describe(m1 ? 'M1 on (0064 functions)' : 'M1 off (today)', () => {
      it('checkout.session.completed (subscription) puts the org on the plan', async () => {
        const mem = createMemDb()
        const org = newOrgId()
        mem.addOrg(org)
        expect(await deliver(checkoutSub(org, 'sub_a', 'annual'), mem, m1)).toEqual({ ok: true, outcome: 'subscription_started' })
        expect(mem.org(org)).toMatchObject({ plan: 'annual', stripe_sub_id: 'sub_a', stripe_customer_id: 'cus_bl103' })
      })

      it('checkout.session.completed (payment) stamps the customer, and the case when given', async () => {
        const mem = createMemDb()
        const org = newOrgId()
        const kase = newOrgId()
        mem.addOrg(org, { plan: 'monthly' })
        mem.addCase(kase, org)
        const pay = (metadata: Record<string, string>) =>
          makeEvent('checkout.session.completed', {
            id: 'cs_test_pay',
            object: 'checkout.session',
            mode: 'payment',
            customer: 'cus_pay',
            subscription: null,
            payment_intent: 'pi_bl103',
            metadata,
          })
        expect((await deliver(pay({ org_id: org }), mem, m1)).outcome).toBe('one_time_payment')
        expect(mem.org(org)).toMatchObject({ plan: 'monthly', stripe_customer_id: 'cus_pay' })
        expect((await deliver(pay({ org_id: org, case_id: kase }), mem, m1)).outcome).toBe('case_payment_recorded')
        expect(mem.case(kase)?.stripe_payment_id).toBe('pi_bl103')
      })

      it('customer.subscription.deleted downgrades the org to free', async () => {
        const mem = createMemDb()
        const org = newOrgId()
        mem.addOrg(org)
        await deliver(checkoutSub(org, 'sub_d', 'monthly'), mem, m1)
        expect(await deliver(subDeleted('sub_d'), mem, m1)).toEqual({ ok: true, outcome: 'subscription_deleted' })
        expect(mem.billing(org)).toEqual({ plan: 'free', stripe_sub_id: null })
      })

      it('invoice.payment_failed is acknowledged and writes nothing', async () => {
        const mem = createMemDb()
        const r = await deliver(makeEvent('invoice.payment_failed', { id: 'in_bl103', object: 'invoice', status: 'open' }), mem, m1)
        expect(r).toEqual({ ok: true, outcome: 'invoice_failed' })
        expect(mem.writes()).toBe(0)
      })

      it('unknown and unhandled events are ignored and write nothing', async () => {
        const mem = createMemDb()
        for (const type of ['customer.created', 'invoice.paid', 'customer.subscription.updated', 'payment_intent.succeeded', 'made.up.event']) {
          expect(await deliver(makeEvent(type, { id: 'obj_1' }), mem, m1)).toEqual({ ok: true, outcome: 'ignored', message: type })
        }
        expect(mem.writes()).toBe(0)
      })

      it('the same event delivered twice changes nothing the second time', async () => {
        const mem = createMemDb()
        const org = newOrgId()
        mem.addOrg(org)
        const event = checkoutSub(org, 'sub_i', 'monthly')
        await deliver(event, mem, m1)
        const after = mem.org(org)
        const again = await deliver(event, mem, m1)
        // M1 dedupes on the event id; pre-M1 rewrites the same values.
        expect(again).toEqual(m1 ? { ok: true, outcome: 'duplicate' } : { ok: true, outcome: 'subscription_started' })
        expect(mem.org(org)).toEqual(after)
      })
    })
  }

  describe('out-of-order delivery', () => {
    const T = 1_790_000_000
    it('M1 on: a late deletion of the OLD subscription leaves the org on the new one', async () => {
      const mem = createMemDb()
      const org = newOrgId()
      mem.addOrg(org)
      await deliver(checkoutSub(org, 'sub_old', 'monthly', T), mem, true)
      await deliver(checkoutSub(org, 'sub_new', 'annual', T + 100), mem, true)
      expect((await deliver(subDeleted('sub_old', T + 105), mem, true)).outcome).toBe('ignored')
      expect(mem.billing(org)).toEqual({ plan: 'annual', stripe_sub_id: 'sub_new' })
    })

    it('M1 on: a deletion that arrives before its own checkout keeps the org free', async () => {
      const mem = createMemDb()
      const org = newOrgId()
      mem.addOrg(org)
      await deliver(subDeleted('sub_x', T + 10), mem, true)
      expect(await deliver(checkoutSub(org, 'sub_x', 'monthly', T), mem, true)).toEqual({
        ok: true,
        outcome: 'ignored',
        message: 'subscription_deleted',
      })
      expect(mem.billing(org)).toEqual({ plan: 'free', stripe_sub_id: null })
    })

    it('M1 off (today): the same late deletion downgrades a paying org — known defect, fixed by 0064 + M1_APPLIED', async () => {
      const mem = createMemDb()
      const org = newOrgId()
      mem.addOrg(org)
      await deliver(checkoutSub(org, 'sub_old', 'monthly', T), mem, false)
      await deliver(checkoutSub(org, 'sub_new', 'annual', T + 100), mem, false)
      await deliver(subDeleted('sub_old', T + 105), mem, false)
      expect(mem.billing(org)).toEqual({ plan: 'free', stripe_sub_id: null })
    })
  })

  describe('signature checks', () => {
    it('a wrong secret, a tampered body, a stale timestamp, or no header is refused before any write', async () => {
      const mem = createMemDb()
      const org = newOrgId()
      mem.addOrg(org)
      const event = checkoutSub(org, 'sub_s', 'monthly')
      expect(await deliver(event, mem, false, { secret: 'whsec_not_the_test_secret' })).toMatchObject({ ok: false, message: 'invalid_signature' })

      const good = signEvent(stripe, event, SECRET)
      const tampered = good.rawBody.replace('"monthly"', '"annual"')
      expect(
        await handleStripeWebhook({ rawBody: tampered, signatureHeader: good.signatureHeader, webhookSecret: SECRET }, { db: mem.db, stripe }),
      ).toMatchObject({ message: 'invalid_signature' })

      const stale = await deliver(event, mem, false, { timestamp: Math.floor(Date.now() / 1000) - 3_600 })
      expect(stale).toMatchObject({ ok: false, message: 'invalid_signature' })

      expect(
        await handleStripeWebhook({ rawBody: good.rawBody, signatureHeader: null, webhookSecret: SECRET }, { db: mem.db, stripe }),
      ).toMatchObject({ ok: false, message: 'signature_missing' })
      expect(mem.writes()).toBe(0)
      expect(webhookHttpStatus({ ok: false, outcome: 'error', message: 'invalid_signature' })).toBe(400)
    })
  })

  describe('the real route: POST /api/webhooks/stripe (apps/hoa)', () => {
    async function post(d: { rawBody: string; signatureHeader: string | null }) {
      const { POST } = await import('../../apps/hoa/src/app/api/webhooks/stripe/route')
      const res = await POST(webhookRequest(d))
      return { status: res.status, body: (await res.json()) as Record<string, unknown> }
    }

    it('bad signature → 400', async () => {
      holder.db = createMemDb().db
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const event = makeEvent('customer.created', { id: 'cus_1' })
      const r = await post(signEvent(stripe, event, 'whsec_wrong'))
      expect(r).toEqual({ status: 400, body: { error: 'invalid_signature' } })
      expect((await post({ rawBody: JSON.stringify(event), signatureHeader: null })).status).toBe(400)
    })

    it('a handled event → 200 with its outcome, applied to the db', async () => {
      const mem = createMemDb()
      holder.db = mem.db
      const org = newOrgId()
      mem.addOrg(org)
      const r = await post(signEvent(stripe, checkoutSub(org, 'sub_r', 'standard'), SECRET))
      expect(r).toEqual({ status: 200, body: { received: true, outcome: 'subscription_started' } })
      expect(mem.billing(org)).toEqual({ plan: 'standard', stripe_sub_id: 'sub_r' })
    })

    it('an unknown event → 200 ignored', async () => {
      holder.db = createMemDb().db
      const r = await post(signEvent(stripe, makeEvent('charge.refunded', { id: 'ch_1' }), SECRET))
      expect(r).toEqual({ status: 200, body: { received: true, outcome: 'ignored' } })
    })

    it("a write the db rejects → 500 so Stripe redelivers (pre-0064 plan check vs 'monthly')", async () => {
      const mem = createMemDb({ planCheck: 'pre0064' })
      holder.db = mem.db
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const org = newOrgId()
      mem.addOrg(org)
      const r = await post(signEvent(stripe, checkoutSub(org, 'sub_p', 'monthly'), SECRET))
      expect(r).toEqual({ status: 500, body: { error: 'persist_failed' } })
      expect(mem.billing(org)).toEqual({ plan: 'free', stripe_sub_id: null })
    })
  })
})
