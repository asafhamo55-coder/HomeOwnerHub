import { describe, expect, it } from 'vitest'
import {
  AUDIT_INVOICE_PAYMENT_FAILED,
  AUDIT_SUBSCRIPTION_UPDATED,
  billingAttention,
  billingAttentionMessage,
  clockOf,
  isAfter,
  planForPrice,
  statusEffect,
} from './billing-status'

const at = (s: number) => new Date(1_790_000_000_000 + s * 1000).toISOString()
const status = (sub: string, st: string, s: number, id = `evt_s${s}`) => ({
  action: AUDIT_SUBSCRIPTION_UPDATED,
  metadata: { event_id: id, event_created: at(s), sub_id: sub, status: st },
})
const failed = (sub: string, s: number, id = `evt_f${s}`) => ({
  action: AUDIT_INVOICE_PAYMENT_FAILED,
  metadata: { event_id: id, event_created: at(s), sub_id: sub },
})

describe('statusEffect', () => {
  it('maps Stripe statuses', () => {
    for (const s of ['active', 'trialing', 'incomplete', 'some_future_status', null, undefined]) expect(statusEffect(s)).toBe('keep')
    for (const s of ['past_due', 'unpaid', 'paused']) expect(statusEffect(s)).toBe('attention')
    for (const s of ['canceled', 'incomplete_expired']) expect(statusEffect(s)).toBe('downgrade')
  })
})

describe('planForPrice', () => {
  it('lookup key first, then the configured env price ids, else null', () => {
    const env = { STRIPE_PRICE_PER_DOOR_MONTHLY: 'price_m', STRIPE_PRICE_PER_DOOR_ANNUAL: 'price_a', STRIPE_PRICE_STANDARD: 'price_std' }
    expect(planForPrice({ id: 'price_a', lookup_key: 'hoa_per_door_monthly' }, env)).toBe('monthly')
    expect(planForPrice({ id: 'x', lookup_key: 'hoa_per_door_annual' }, env)).toBe('annual')
    expect(planForPrice({ id: 'price_a', lookup_key: null }, env)).toBe('annual')
    expect(planForPrice({ id: 'price_m' }, env)).toBe('monthly')
    expect(planForPrice({ id: 'price_std' }, env)).toBe('monthly')
    expect(planForPrice({ id: 'price_other', lookup_key: 'toString' }, env)).toBeNull()
    expect(planForPrice(null, env)).toBeNull()
    expect(planForPrice({ id: 'price_m' }, {})).toBeNull()
  })

  it('BL-104: the four band Prices map to essentials / complete, by lookup key or env id', () => {
    expect(planForPrice({ id: 'x', lookup_key: 'hoa_essentials_monthly' }, {})).toBe('essentials')
    expect(planForPrice({ id: 'x', lookup_key: 'hoa_essentials_annual' }, {})).toBe('essentials')
    expect(planForPrice({ id: 'x', lookup_key: 'hoa_complete_monthly' }, {})).toBe('complete')
    expect(planForPrice({ id: 'x', lookup_key: 'hoa_complete_annual' }, {})).toBe('complete')
    expect(planForPrice({ id: 'price_ca' }, { STRIPE_PRICE_COMPLETE_ANNUAL: 'price_ca' })).toBe('complete')
    expect(planForPrice({ id: 'price_em' }, { STRIPE_PRICE_ESSENTIALS_MONTHLY: 'price_em' })).toBe('essentials')
  })
})

describe('isAfter / clockOf', () => {
  it('orders by created, then event id', () => {
    expect(isAfter({ created: at(2), eventId: 'a' }, { created: at(1), eventId: 'z' })).toBe(true)
    expect(isAfter({ created: at(1), eventId: 'b' }, { created: at(1), eventId: 'a' })).toBe(true)
    expect(isAfter({ created: at(1), eventId: 'a' }, { created: at(1), eventId: 'a' })).toBe(false)
  })
  it('reads only well-formed metadata', () => {
    expect(clockOf({ event_id: 'e', event_created: at(0) })).toEqual({ eventId: 'e', created: at(0) })
    expect(clockOf({ event_id: 'e' })).toBeNull()
    expect(clockOf(null)).toBeNull()
    expect(clockOf('x')).toBeNull()
  })
})

describe('billingAttention', () => {
  it('nothing without a current subscription or rows', () => {
    expect(billingAttention([status('sub_1', 'past_due', 0)], null)).toBeNull()
    expect(billingAttention([], 'sub_1')).toBeNull()
  })

  it('the latest status decides', () => {
    expect(billingAttention([status('sub_1', 'past_due', 0)], 'sub_1')).toEqual({ reason: 'past_due', since: at(0) })
    expect(billingAttention([status('sub_1', 'unpaid', 5), status('sub_1', 'past_due', 0)], 'sub_1')).toMatchObject({ reason: 'unpaid' })
    expect(billingAttention([status('sub_1', 'past_due', 0), status('sub_1', 'active', 5)], 'sub_1')).toBeNull()
    expect(billingAttention([status('sub_1', 'paused', 0)], 'sub_1')).toMatchObject({ reason: 'paused' })
  })

  it('a failed invoice raises it until a later status says otherwise', () => {
    expect(billingAttention([failed('sub_1', 0)], 'sub_1')).toEqual({ reason: 'payment_failed', since: at(0) })
    expect(billingAttention([status('sub_1', 'active', 0), failed('sub_1', 5)], 'sub_1')).toMatchObject({ reason: 'payment_failed' })
    expect(billingAttention([failed('sub_1', 0), status('sub_1', 'active', 5)], 'sub_1')).toBeNull()
    // Same second: the status wins (the recovery, not the failure).
    expect(billingAttention([failed('sub_1', 0), status('sub_1', 'active', 0)], 'sub_1')).toBeNull()
  })

  it('rows for another subscription never raise it', () => {
    expect(billingAttention([status('sub_old', 'past_due', 0), failed('sub_old', 1)], 'sub_new')).toBeNull()
  })

  it('ignores malformed rows', () => {
    expect(billingAttention([{ action: AUDIT_SUBSCRIPTION_UPDATED, metadata: { sub_id: 'sub_1', status: 'past_due' } }], 'sub_1')).toBeNull()
    expect(billingAttention([{ action: AUDIT_SUBSCRIPTION_UPDATED, metadata: null }], 'sub_1')).toBeNull()
  })
})

describe('billingAttentionMessage', () => {
  it('has copy for every reason, with no provider detail', () => {
    for (const reason of ['past_due', 'unpaid', 'paused', 'payment_failed'] as const) {
      const m = billingAttentionMessage({ reason, since: at(0) })
      expect(m.title.length).toBeGreaterThan(0)
      expect(m.body).not.toMatch(/sub_|in_|cus_|evt_/)
    }
    expect(billingAttentionMessage({ reason: 'past_due', since: at(0) }).title).toMatch(/past due/)
  })
})
