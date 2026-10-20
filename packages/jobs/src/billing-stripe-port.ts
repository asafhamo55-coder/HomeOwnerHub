/**
 * BL-104 — the slice of Stripe the two billing jobs need (band sync and the
 * grandfathered renewal). Injected, so the jobs never construct a Stripe
 * client: production passes apps/hoa's adapter over the shared client
 * (lib/billing-stripe-port.ts), tests pass a fake, and no test can reach
 * Stripe.
 *
 * Every change the jobs make is `proration_behavior: 'none'` (decision §2
 * and §5): the new quantity or Price bills from the next invoice, the
 * renewal. The field is in the call so the tests can pin it.
 */

export interface SubscriptionSnapshot {
  id: string
  /** Stripe subscription status: 'active', 'trialing', 'past_due', 'canceled', … */
  status: string
  /** Stripe start_date. */
  startedAt: Date
  /** The end of the current period (the next invoice). */
  currentPeriodEnd: Date
  /** From the Price's recurring interval: 'year' → annual, else monthly. */
  cadence: 'monthly' | 'annual'
  /** The subscription's single item (HOA subscriptions have one). */
  itemId: string
  quantity: number
  /** The item's Price lookup key; null when the Price has none. */
  lookupKey: string | null
}

export interface SubscriptionItemChange {
  subscriptionId: string
  itemId: string
  quantity: number
  /** A new Price; omitted to change only the quantity. */
  priceId?: string
  prorationBehavior: 'none'
  /** Stripe idempotency key: a retried run cannot apply a change twice. */
  idempotencyKey: string
}

export interface BillingStripePort {
  /** null when the subscription does not exist. */
  getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot | null>
  /** The active Price with this lookup key (or its env override); null when none. */
  resolvePriceId(lookupKey: string): Promise<string | null>
  updateSubscriptionItem(change: SubscriptionItemChange): Promise<void>
}

/** Statuses a job may change. Anything else (canceled, incomplete…) is left alone. */
export const CHANGEABLE_SUBSCRIPTION_STATUSES: readonly string[] = ['active', 'trialing', 'past_due']

/** Type and code of a thrown Stripe (or other) error: never its message, which can quote request data. */
export function errorFacts(err: unknown): { type: string | null; code: string | null } {
  const e = (err ?? {}) as { type?: unknown; code?: unknown; name?: unknown }
  return {
    type: typeof e.type === 'string' ? e.type : typeof e.name === 'string' ? e.name : null,
    code: typeof e.code === 'string' ? e.code : null,
  }
}
