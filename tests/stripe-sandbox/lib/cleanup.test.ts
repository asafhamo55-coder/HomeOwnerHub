import { describe, expect, it } from 'vitest'
import { Registry, sweepStale, type CleanupClient, type SweepClient } from './cleanup'

function stripeError(code: string | undefined, statusCode: number, type = 'StripeInvalidRequestError') {
  return Object.assign(new Error('provider text that must never be surfaced'), { code, statusCode, type })
}

function fakeClient(fail: Record<string, unknown> = {}) {
  const calls: string[] = []
  const op = (name: string) => async (id: string) => {
    calls.push(`${name}:${id}`)
    const f = fail[`${name}:${id}`]
    if (f) throw f
    return {}
  }
  const client: CleanupClient = {
    checkout: { sessions: { expire: op('session.expire') } },
    paymentIntents: { cancel: op('pi.cancel') },
    subscriptions: { cancel: op('sub.cancel') },
    customers: { del: op('customer.del') },
    testHelpers: { testClocks: { del: op('clock.del') } },
    prices: { update: op('price.archive') },
    products: { del: op('product.del'), update: op('product.archive') },
  }
  return { client, calls }
}

describe('Registry.cleanup', () => {
  it('removes everything, dependants first, and skips subscriptions a clock owns', async () => {
    const r = new Registry()
    r.add('product', 'prod_1')
    r.add('price', 'price_1')
    r.add('testClock', 'clock_1')
    r.add('customer', 'cus_1')
    r.add('subscription', 'sub_free')
    r.add('subscription', 'sub_clocked')
    r.markOnClock('sub_clocked')
    r.add('paymentIntent', 'pi_1')
    r.add('checkoutSession', 'cs_1')
    r.add('customer', 'cus_1') // duplicate add is ignored
    r.add('customer', null)
    const f = fakeClient()
    const report = await r.cleanup(f.client)
    expect(f.calls).toEqual([
      'session.expire:cs_1',
      'pi.cancel:pi_1',
      'sub.cancel:sub_free',
      'customer.del:cus_1',
      'clock.del:clock_1',
      'price.archive:price_1',
      'product.del:prod_1',
    ])
    expect(report).toEqual({ removed: 7, alreadyGone: 0, failures: [] })
    expect(r.size).toBe(0)
  })

  it('archives a product that cannot be deleted because it has prices', async () => {
    const r = new Registry()
    r.add('product', 'prod_1')
    const f = fakeClient({ 'product.del:prod_1': stripeError(undefined, 400) })
    expect(await r.cleanup(f.client)).toEqual({ removed: 1, alreadyGone: 0, failures: [] })
    expect(f.calls).toEqual(['product.del:prod_1', 'product.archive:prod_1'])
  })

  it('treats already-gone / already-terminal objects as done, not as leaks', async () => {
    const r = new Registry()
    r.add('customer', 'cus_gone')
    r.add('paymentIntent', 'pi_done')
    r.add('checkoutSession', 'cs_done')
    const f = fakeClient({
      'customer.del:cus_gone': stripeError('resource_missing', 404),
      'pi.cancel:pi_done': stripeError('payment_intent_unexpected_state', 400),
      'session.expire:cs_done': stripeError(undefined, 400),
    })
    expect(await r.cleanup(f.client)).toEqual({ removed: 0, alreadyGone: 3, failures: [] })
  })

  it('reports a real failure by code only and keeps it registered for a retry', async () => {
    const r = new Registry()
    r.add('customer', 'cus_1')
    r.add('testClock', 'clock_1')
    const f = fakeClient({ 'customer.del:cus_1': stripeError('rate_limit', 429, 'StripeRateLimitError') })
    const report = await r.cleanup(f.client)
    expect(report.failures).toEqual([{ kind: 'customer', id: 'cus_1', code: 'rate_limit' }])
    expect(JSON.stringify(report)).not.toContain('provider text')
    expect(report.removed).toBe(1)
    expect(r.list()).toEqual(['cus_1'])
  })
})

describe('sweepStale', () => {
  async function* items<T>(xs: T[]) {
    yield* xs
  }
  it('removes only tagged leftovers older than the cutoff', async () => {
    const calls: string[] = []
    const queries: string[] = []
    const now = 100_000
    const client: SweepClient = {
      customers: {
        search: (p) => (queries.push(p.query), items([{ id: 'cus_old', created: now - 7_200 }, { id: 'cus_new', created: now - 60 }])),
        del: async (id) => calls.push(`customer.del:${id}`),
      },
      testHelpers: {
        testClocks: {
          list: () =>
            items([
              { id: 'clock_old', name: 'bl103-lifecycle', created: now - 7_200 },
              { id: 'clock_foreign', name: 'someone-elses', created: now - 7_200 },
              { id: 'clock_new', name: 'bl103-x', created: now - 10 },
            ]),
          del: async (id) => calls.push(`clock.del:${id}`),
        },
      },
      products: {
        search: (p) => (queries.push(p.query), items([{ id: 'prod_old', created: now - 7_200, active: true }])),
        del: async () => {
          throw new Error('has prices')
        },
        update: async (id) => calls.push(`product.archive:${id}`),
      },
    }
    const counts = await sweepStale(client, { nowSec: now })
    expect(calls).toEqual(['clock.del:clock_old', 'customer.del:cus_old', 'product.archive:prod_old'])
    expect(counts).toEqual({ customers: 1, testClocks: 1, products: 1, failed: 0 })
    expect(queries.every((q) => q.includes(`metadata['bl103_suite']:'stripe-sandbox'`))).toBe(true)
  })
})
