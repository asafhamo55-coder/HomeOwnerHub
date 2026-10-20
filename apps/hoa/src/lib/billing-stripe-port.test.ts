import { describe, expect, it, vi } from 'vitest'
import { priceEnvForLookupKey, stripePortFrom, toSnapshot } from './billing-stripe-port'

// BL-104: the adapter the billing jobs' Stripe calls go through. A fake
// Stripe object only; no network.

function sub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    start_date: Date.parse('2026-01-01T00:00:00Z') / 1000,
    items: {
      data: [
        {
          id: 'si_1',
          quantity: 48,
          current_period_end: Date.parse('2026-12-01T00:00:00Z') / 1000,
          price: { lookup_key: 'hoa_per_door_annual', recurring: { interval: 'year' } },
        },
      ],
    },
    ...over,
  }
}

function fakeStripe(s: unknown = sub()) {
  return {
    subscriptions: { retrieve: vi.fn(async () => s) },
    subscriptionItems: { update: vi.fn(async () => ({})) },
    prices: { list: vi.fn(async () => ({ data: [{ id: 'price_found' }] })) },
  }
}

describe('billing Stripe port', () => {
  it('reads the period end from the item (API 2025-03-31+) and the cadence from the interval', () => {
    expect(toSnapshot(sub() as never)).toEqual({
      id: 'sub_1',
      status: 'active',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
      cadence: 'annual',
      itemId: 'si_1',
      quantity: 48,
      lookupKey: 'hoa_per_door_annual',
    })
  })

  it('every change is proration_behavior none, with the idempotency key', async () => {
    const stripe = fakeStripe()
    const port = stripePortFrom(stripe as never, {})
    await port.updateSubscriptionItem({
      subscriptionId: 'sub_1',
      itemId: 'si_1',
      quantity: 60,
      prorationBehavior: 'none',
      idempotencyKey: 'k1',
    })
    await port.updateSubscriptionItem({
      subscriptionId: 'sub_1',
      itemId: 'si_1',
      quantity: 48,
      priceId: 'price_ca',
      prorationBehavior: 'none',
      idempotencyKey: 'k2',
    })
    expect(stripe.subscriptionItems.update.mock.calls).toEqual([
      ['si_1', { quantity: 60, proration_behavior: 'none' }, { idempotencyKey: 'k1' }],
      ['si_1', { quantity: 48, price: 'price_ca', proration_behavior: 'none' }, { idempotencyKey: 'k2' }],
    ])
  })

  it('price: env override first, then the active Price by lookup key', async () => {
    expect(priceEnvForLookupKey('hoa_complete_annual')).toBe('STRIPE_PRICE_COMPLETE_ANNUAL')
    expect(priceEnvForLookupKey('hoa_per_door_annual')).toBeNull()
    const stripe = fakeStripe()
    expect(await stripePortFrom(stripe as never, { STRIPE_PRICE_COMPLETE_ANNUAL: 'price_env' }).resolvePriceId('hoa_complete_annual')).toBe(
      'price_env',
    )
    expect(stripe.prices.list).not.toHaveBeenCalled()
    expect(await stripePortFrom(stripe as never, {}).resolvePriceId('hoa_complete_annual')).toBe('price_found')
    expect(stripe.prices.list).toHaveBeenCalledWith({ lookup_keys: ['hoa_complete_annual'], active: true, limit: 1 })
  })

  it('a missing subscription is null; other errors throw', async () => {
    const missing = fakeStripe()
    missing.subscriptions.retrieve.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'resource_missing' }))
    expect(await stripePortFrom(missing as never, {}).getSubscription('sub_x')).toBeNull()
    const broken = fakeStripe()
    broken.subscriptions.retrieve.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'rate_limit' }))
    await expect(stripePortFrom(broken as never, {}).getSubscription('sub_x')).rejects.toThrow()
  })
})
