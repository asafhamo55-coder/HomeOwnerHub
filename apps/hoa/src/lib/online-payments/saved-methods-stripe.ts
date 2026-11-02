// BL-035 PR 7: the real SavedMethodsStripePort, over the platform Stripe client
// with the connected account passed per call (direct charges: the customer,
// the SetupIntent and the method all live on the association's own account).
// Not a 'use server' module. Tests use fakes of the port and never reach this.

import type Stripe from 'stripe'
import { getStripe } from '@homeowner-portal/billing'
import type { PaymentMethodSummary, SavedMethodsStripePort } from './saved-methods'

type StripeLike = Pick<Stripe, 'customers' | 'setupIntents' | 'paymentMethods'>

export function toSummary(pm: Stripe.PaymentMethod): PaymentMethodSummary | null {
  if (pm.type === 'card' && pm.card) {
    return {
      id: pm.id,
      type: 'card',
      brand: pm.card.brand ?? null,
      last4: pm.card.last4 ?? null,
      expMonth: pm.card.exp_month ?? null,
      expYear: pm.card.exp_year ?? null,
    }
  }
  if (pm.type === 'us_bank_account' && pm.us_bank_account) {
    return {
      id: pm.id,
      type: 'ach',
      brand: pm.us_bank_account.bank_name ?? null,
      last4: pm.us_bank_account.last4 ?? null,
      expMonth: null,
      expYear: null,
    }
  }
  return null
}

export function savedMethodsPortFrom(stripe: StripeLike): SavedMethodsStripePort {
  return {
    async createCustomer(account, input) {
      const c = await stripe.customers.create({ metadata: input.metadata }, { stripeAccount: account })
      return { id: c.id }
    },
    async createSetupIntent(account, input) {
      const si = await stripe.setupIntents.create(
        {
          customer: input.customerId,
          usage: input.usage,
          payment_method_types: ['card', 'us_bank_account'],
          metadata: input.metadata,
        },
        { stripeAccount: account },
      )
      if (!si.client_secret) throw new Error('setup intent has no client secret')
      return { id: si.id, clientSecret: si.client_secret }
    },
    async retrievePaymentMethod(account, pmId) {
      try {
        return toSummary(await stripe.paymentMethods.retrieve(pmId, { stripeAccount: account }))
      } catch (err) {
        if ((err as { code?: string }).code === 'resource_missing') return null
        throw err
      }
    },
    async detachPaymentMethod(account, pmId) {
      try {
        await stripe.paymentMethods.detach(pmId, {}, { stripeAccount: account })
      } catch (err) {
        // Already gone on Stripe's side: the goal is met.
        if ((err as { code?: string }).code !== 'resource_missing') throw err
      }
    },
  }
}

/** Null when Stripe is not configured; callers answer "not available yet". */
export function getSavedMethodsPort(): SavedMethodsStripePort | null {
  const stripe = getStripe()
  return stripe ? savedMethodsPortFrom(stripe) : null
}
