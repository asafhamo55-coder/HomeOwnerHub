import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { applyStripeEvent, type WebhookDb } from './webhook'

const ORG = '9a1b2c3d-0000-4000-8000-000000000001'
const CASE = '0b6f4a7e-6a43-4c1e-9f55-1d1e3c1c0a01'

function fakeDb(rpcReply: { data: unknown; error: { code?: string } | null } = { data: 'subscription_started', error: null }) {
  const updates: Array<{ table: string; patch: Record<string, unknown>; filters: Array<[string, string]> }> = []
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = []
  const db: WebhookDb = {
    from(table) {
      return {
        update(patch) {
          const rec = { table, patch, filters: [] as Array<[string, string]> }
          updates.push(rec)
          const f = {
            eq(col: string, v: string) {
              rec.filters.push([col, v])
              return f
            },
            then(ok: (r: { error: null }) => unknown) {
              return Promise.resolve({ error: null }).then(ok)
            },
          }
          return f as never
        },
      }
    },
    rpc(fn, args) {
      rpcs.push({ fn, args: args as Record<string, unknown> })
      return Promise.resolve(rpcReply)
    },
  }
  return { db, updates, rpcs }
}

const checkout = (object: Record<string, unknown>): Stripe.Event =>
  ({ id: 'evt_1', created: 1_760_000_000, type: 'checkout.session.completed', data: { object } }) as unknown as Stripe.Event
const deleted = (object: Record<string, unknown>): Stripe.Event =>
  ({ id: 'evt_2', created: 1_760_000_100, type: 'customer.subscription.deleted', data: { object } }) as unknown as Stripe.Event

describe('applyStripeEvent, M1 off (today)', () => {
  it('subscription checkout writes the org directly and calls no function', async () => {
    const f = fakeDb()
    const r = await applyStripeEvent(
      checkout({ mode: 'subscription', metadata: { org_id: ORG, plan: 'annual' }, customer: 'cus_1', subscription: 'sub_1' }),
      { db: f.db, m1: false },
    )
    expect(r).toEqual({ ok: true, outcome: 'subscription_started' })
    expect(f.rpcs).toEqual([])
    expect(f.updates).toEqual([
      { table: 'orgs', patch: { stripe_customer_id: 'cus_1', stripe_sub_id: 'sub_1', plan: 'annual' }, filters: [['id', ORG]] },
    ])
  })

  it('deletion downgrades by customer, as before', async () => {
    const f = fakeDb()
    const r = await applyStripeEvent(deleted({ id: 'sub_1', customer: 'cus_1' }), { db: f.db, m1: false })
    expect(r.outcome).toBe('subscription_deleted')
    expect(f.updates[0]).toMatchObject({ patch: { plan: 'free', stripe_sub_id: null }, filters: [['stripe_customer_id', 'cus_1']] })
  })

  it('a case payment is stamped scoped to the org', async () => {
    const f = fakeDb()
    const r = await applyStripeEvent(
      checkout({ mode: 'payment', metadata: { org_id: ORG, case_id: CASE }, customer: null, payment_intent: 'pi_1' }),
      { db: f.db, m1: false },
    )
    expect(r.outcome).toBe('case_payment_recorded')
    expect(f.updates[0]).toMatchObject({ table: 'eviction_cases', filters: [['id', CASE], ['org_id', ORG]] })
  })
})

describe('applyStripeEvent, M1 on (0064 functions)', () => {
  it('subscription checkout goes through the ordering function only', async () => {
    const f = fakeDb()
    const r = await applyStripeEvent(
      checkout({ mode: 'subscription', metadata: { org_id: ORG, plan: 'monthly' }, customer: 'cus_1', subscription: { id: 'sub_2' } }),
      { db: f.db, m1: true },
    )
    expect(r).toEqual({ ok: true, outcome: 'subscription_started' })
    expect(f.updates).toEqual([])
    expect(f.rpcs).toEqual([
      {
        fn: 'stripe_webhook_checkout_subscription',
        args: {
          p_event_id: 'evt_1',
          p_event_created: new Date(1_760_000_000 * 1000).toISOString(),
          p_org_id: ORG,
          p_customer_id: 'cus_1',
          p_sub_id: 'sub_2',
          p_plan: 'monthly',
        },
      },
    ])
  })

  it('deletion is keyed by subscription id, not customer', async () => {
    const f = fakeDb({ data: 'ignored_not_current_subscription', error: null })
    const r = await applyStripeEvent(deleted({ id: 'sub_1', customer: 'cus_1' }), { db: f.db, m1: true })
    expect(r).toEqual({ ok: true, outcome: 'ignored', message: 'not_current_subscription' })
    expect(f.rpcs[0]).toMatchObject({ fn: 'stripe_webhook_subscription_deleted', args: { p_sub_id: 'sub_1' } })
    expect(f.updates).toEqual([])
  })

  it('a failed or unrecognised write is not acknowledged (Stripe redelivers)', async () => {
    const failed = fakeDb({ data: null, error: { code: '23514' } })
    const r1 = await applyStripeEvent(deleted({ id: 'sub_1' }), { db: failed.db, m1: true })
    expect(r1).toEqual({ ok: false, outcome: 'error', message: 'persist_failed', dbCode: '23514' })
    const odd = fakeDb({ data: 'something_else', error: null })
    expect((await applyStripeEvent(deleted({ id: 'sub_1' }), { db: odd.db, m1: true })).ok).toBe(false)
  })

  it('duplicates are acknowledged; a non-uuid org or case never reaches Postgres as one', async () => {
    const dup = fakeDb({ data: 'duplicate', error: null })
    expect(await applyStripeEvent(deleted({ id: 'sub_1' }), { db: dup.db, m1: true })).toEqual({ ok: true, outcome: 'duplicate' })
    const bad = fakeDb()
    const r = await applyStripeEvent(checkout({ mode: 'subscription', metadata: { org_id: 'nope' } }), { db: bad.db, m1: true })
    expect(r).toMatchObject({ ok: true, outcome: 'ignored' })
    expect(bad.rpcs).toEqual([])
    const pay = fakeDb({ data: 'one_time_payment', error: null })
    await applyStripeEvent(checkout({ mode: 'payment', metadata: { org_id: ORG, case_id: 'x' }, payment_intent: 'pi_1' }), {
      db: pay.db,
      m1: true,
    })
    expect(pay.rpcs[0]).toMatchObject({ fn: 'stripe_webhook_checkout_payment', args: { p_case_id: null, p_payment_intent_id: 'pi_1' } })
  })
})
