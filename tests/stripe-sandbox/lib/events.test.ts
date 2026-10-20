import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { STRIPE_API_VERSION } from '../../../packages/billing/src/client'
import { makeEvent, signEvent, webhookRequest } from './events'

// Dummy key: constructing the client never calls Stripe, and signing and
// verifying are local HMACs.
const stripe = new Stripe('sk_test_unit_dummy_not_a_key')
const SECRET = 'whsec_unit_dummy'

describe('makeEvent', () => {
  it('builds a test-mode event with unique ids and the app API version', () => {
    const a = makeEvent('invoice.payment_failed', { id: 'in_1' })
    const b = makeEvent('invoice.payment_failed', { id: 'in_1' })
    expect(a.id).not.toBe(b.id)
    expect(a).toMatchObject({ object: 'event', livemode: false, type: 'invoice.payment_failed', api_version: STRIPE_API_VERSION })
    expect(makeEvent('x', { id: 'o' }, { id: 'evt_fixed', created: 5 })).toMatchObject({ id: 'evt_fixed', created: 5 })
  })
})

describe('signEvent', () => {
  it('produces a delivery the SDK verifies with the same secret', () => {
    const event = makeEvent('customer.created', { id: 'cus_1' })
    const d = signEvent(stripe, event, SECRET)
    expect(d.signatureHeader).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(stripe.webhooks.constructEvent(d.rawBody, d.signatureHeader, SECRET).id).toBe(event.id)
  })

  it('fails verification with another secret, a tampered body, or a stale timestamp', () => {
    const event = makeEvent('customer.created', { id: 'cus_1' })
    const d = signEvent(stripe, event, SECRET)
    expect(() => stripe.webhooks.constructEvent(d.rawBody, d.signatureHeader, 'whsec_other')).toThrow()
    expect(() => stripe.webhooks.constructEvent(d.rawBody.replace('cus_1', 'cus_2'), d.signatureHeader, SECRET)).toThrow()
    const stale = signEvent(stripe, event, SECRET, { timestamp: Math.floor(Date.now() / 1000) - 3600 })
    expect(() => stripe.webhooks.constructEvent(stale.rawBody, stale.signatureHeader, SECRET)).toThrow()
  })
})

describe('webhookRequest', () => {
  it('carries the body and the stripe-signature header (or none)', async () => {
    const r = webhookRequest({ rawBody: '{"a":1}', signatureHeader: 't=1,v1=ab' })
    expect(r.method).toBe('POST')
    expect(r.headers.get('stripe-signature')).toBe('t=1,v1=ab')
    expect(await r.text()).toBe('{"a":1}')
    expect(webhookRequest({ rawBody: '{}', signatureHeader: null }).headers.get('stripe-signature')).toBeNull()
  })
})
