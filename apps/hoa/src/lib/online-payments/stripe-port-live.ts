/**
 * The real Stripe adapter for the online-payment port. SERVER ONLY, and not a
 * 'use server' module: nothing here is callable from a browser. Tests never
 * import it; they pass a fake port (stripe-port.ts).
 */

import type Stripe from 'stripe'
import { getStripe } from '@homeowner-portal/billing'
import type { CreateIntentInput, IntentSnapshot, OnlinePaymentsStripePort } from './stripe-port'

type StripeLike = Pick<Stripe, 'paymentIntents'>

export function toSnapshot(pi: Stripe.PaymentIntent): IntentSnapshot {
  const charge = pi.latest_charge
  const next = pi.next_action
  return {
    id: pi.id,
    status: pi.status,
    clientSecret: pi.client_secret ?? null,
    microdepositUrl:
      next?.type === 'verify_with_microdeposits' ? (next.verify_with_microdeposits?.hosted_verification_url ?? null) : null,
    chargeId: typeof charge === 'string' ? charge : (charge?.id ?? null),
  }
}

export function livePort(stripe: StripeLike): OnlinePaymentsStripePort {
  return {
    async createPaymentIntent(input: CreateIntentInput) {
      const params: Stripe.PaymentIntentCreateParams = {
        amount: input.amountCents,
        currency: 'usd',
        payment_method_types: [input.method === 'ach' ? 'us_bank_account' : 'card'],
        metadata: input.metadata,
        ...(input.applicationFeeCents > 0 ? { application_fee_amount: input.applicationFeeCents } : {}),
        ...(input.method === 'card' && input.descriptorSuffix
          ? { statement_descriptor_suffix: input.descriptorSuffix }
          : {}),
        ...(input.method === 'ach'
          ? {
              // Instant bank login through Stripe Financial Connections first;
              // Stripe falls back to microdeposits when the bank is not supported.
              payment_method_options: {
                us_bank_account: {
                  financial_connections: { permissions: ['payment_method'] },
                  verification_method: 'automatic',
                },
              },
            }
          : {}),
      }
      const pi = await stripe.paymentIntents.create(params, {
        stripeAccount: input.accountId,
        idempotencyKey: input.idempotencyKey,
      })
      return toSnapshot(pi)
    },
    async retrievePaymentIntent(accountId, intentId) {
      const pi = await stripe.paymentIntents.retrieve(intentId, {}, { stripeAccount: accountId })
      return toSnapshot(pi)
    },
  }
}

/** The configured live port, or null when STRIPE_SECRET_KEY is not set. */
export function getLivePort(): OnlinePaymentsStripePort | null {
  const stripe = getStripe()
  return stripe ? livePort(stripe) : null
}
