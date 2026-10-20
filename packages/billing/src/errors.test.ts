import { describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { checkoutErrorMessage, stripeErrorFacts, SUPPORT_EMAIL } from './errors'

const raw = (type: string, code?: string, message = 'No such customer: cus_SECRET; email jane@example.com') =>
  Stripe.errors.StripeError.generate({ type: type as never, code, message })

describe('stripeErrorFacts', () => {
  it('keeps the Stripe type and code, never the message', () => {
    const facts = stripeErrorFacts(raw('invalid_request_error', 'resource_missing'))
    expect(facts).toEqual({ type: 'StripeInvalidRequestError', code: 'resource_missing' })
    expect(JSON.stringify(facts)).not.toMatch(/cus_SECRET|jane@/)
  })

  it('anything that is not a Stripe error is non_stripe', () => {
    expect(stripeErrorFacts(new Error('boom jane@example.com'))).toEqual({ type: 'non_stripe', code: null })
    expect(stripeErrorFacts(null)).toEqual({ type: 'non_stripe', code: null })
    expect(stripeErrorFacts({ type: 'StripeX', code: 'has spaces and jane@example.com' })).toEqual({ type: 'StripeX', code: null })
  })
})

describe('checkoutErrorMessage', () => {
  it('is ours, never Stripe’s text', () => {
    for (const err of [raw('invalid_request_error', 'resource_missing'), raw('card_error', 'card_declined'), new Error('x'), null]) {
      const m = checkoutErrorMessage(err)
      expect(m).toContain(SUPPORT_EMAIL)
      expect(m).not.toMatch(/cus_SECRET|jane@|No such/)
    }
  })

  it('suggests a retry when Stripe was unreachable or busy', () => {
    expect(checkoutErrorMessage(raw('api_error'))).toMatch(/couldn't reach/)
    expect(checkoutErrorMessage(raw('rate_limit_error'))).toMatch(/couldn't reach/)
    expect(checkoutErrorMessage(raw('invalid_request_error'))).toMatch(/couldn't start checkout/)
  })
})
