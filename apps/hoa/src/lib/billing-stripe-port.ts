// BL-104 — apps/hoa's adapter from the shared Stripe client to the port the
// billing jobs take (packages/jobs/src/billing-stripe-port.ts). The jobs
// never build a client; this file is the only place their Stripe calls
// happen, and every change it sends is `proration_behavior: 'none'`.
//
// Not a 'use server' module: nothing here is callable from a browser.

import type Stripe from 'stripe'
import { getStripe, HOA_PLAN_IDS, V2_LOOKUP_KEYS, V2_PRICE_ENV } from '@homeowner-portal/billing'
import type { BillingStripePort, SubscriptionSnapshot } from '@homeowner-portal/jobs'

/** The env override for a band Price's lookup key (STRIPE_PRICE_<PLAN>_<CADENCE>), if any. */
export function priceEnvForLookupKey(lookupKey: string): string | null {
  for (const plan of HOA_PLAN_IDS) {
    for (const cadence of ['monthly', 'annual'] as const) {
      if (V2_LOOKUP_KEYS[plan][cadence] === lookupKey) return V2_PRICE_ENV[plan][cadence]
    }
  }
  return null
}

type StripeLike = Pick<Stripe, 'subscriptions' | 'subscriptionItems' | 'prices'>

/** Read a Stripe subscription into the port's snapshot. Period end lives on the item from API 2025-03-31 on. */
export function toSnapshot(sub: Stripe.Subscription): SubscriptionSnapshot | null {
  const item = sub.items?.data?.[0]
  if (!item) return null
  const periodEnd =
    (item as unknown as { current_period_end?: number }).current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end
  if (typeof periodEnd !== 'number') return null
  return {
    id: sub.id,
    status: sub.status,
    startedAt: new Date(sub.start_date * 1000),
    currentPeriodEnd: new Date(periodEnd * 1000),
    cadence: item.price?.recurring?.interval === 'year' ? 'annual' : 'monthly',
    itemId: item.id,
    quantity: item.quantity ?? 1,
    lookupKey: item.price?.lookup_key ?? null,
  }
}

export function stripePortFrom(stripe: StripeLike, env: Readonly<Record<string, string | undefined>> = process.env): BillingStripePort {
  return {
    async getSubscription(subscriptionId) {
      try {
        return toSnapshot(await stripe.subscriptions.retrieve(subscriptionId))
      } catch (err) {
        if ((err as { code?: string }).code === 'resource_missing') return null
        throw err
      }
    },
    async resolvePriceId(lookupKey) {
      const envName = priceEnvForLookupKey(lookupKey)
      const fromEnv = envName ? env[envName] : undefined
      if (fromEnv) return fromEnv
      // lookup_key is a module constant (V2_LOOKUP_KEYS), never caller input.
      const res = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
      return res.data[0]?.id ?? null
    },
    async updateSubscriptionItem(change) {
      await stripe.subscriptionItems.update(
        change.itemId,
        {
          quantity: change.quantity,
          ...(change.priceId ? { price: change.priceId } : {}),
          proration_behavior: change.prorationBehavior,
        },
        { idempotencyKey: change.idempotencyKey },
      )
    },
  }
}

/** For the Inngest route: null when STRIPE_SECRET_KEY is unset (the jobs skip). */
export function billingStripePort(): BillingStripePort | null {
  const stripe = getStripe()
  return stripe ? stripePortFrom(stripe) : null
}
