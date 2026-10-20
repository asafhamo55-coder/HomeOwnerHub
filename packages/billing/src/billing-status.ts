// Subscription status the webhook records, and the board billing banner
// derived from it. Pure: no Stripe client, no database.
//
// orgs has no column for a subscription's status (and BL-103 adds no
// migration), so the webhook appends one audit_log row per APPLIED
// customer.subscription.updated and per invoice.payment_failed. Rows hold
// ids, Stripe's status string, the quantity and timestamps only, never PII.
// The same rows are the webhook's ordering clock (see webhook.ts) and the
// source of the "payment failed" banner board members see.

import { HOA_PLAN_IDS, V2_LOOKUP_KEYS, V2_PRICE_ENV } from './pricing-v2'

/** audit_log.action for an applied customer.subscription.updated. */
export const AUDIT_SUBSCRIPTION_UPDATED = 'billing.subscription_updated'
/** audit_log.action for a recorded invoice.payment_failed. */
export const AUDIT_INVOICE_PAYMENT_FAILED = 'billing.invoice_payment_failed'
export const BILLING_AUDIT_ACTIONS = [AUDIT_SUBSCRIPTION_UPDATED, AUDIT_INVOICE_PAYMENT_FAILED] as const

/**
 * Stripe statuses that keep the plan but need an admin to act.
 * `incomplete` is not one: it only precedes the first payment, and an org
 * is on a subscription only once its checkout completed (paid), so a late
 * `incomplete` would raise a false banner.
 */
const NEEDS_ATTENTION = new Set(['past_due', 'unpaid', 'paused'])
/** Terminal statuses: the subscription is over, downgrade like a deletion. */
const ENDED = new Set(['canceled', 'incomplete_expired'])

export type SubscriptionStatusEffect = 'keep' | 'attention' | 'downgrade'

/**
 * What a customer.subscription.updated with this status does to the org.
 * active / trialing keep the paid plan; so do incomplete and any status
 * Stripe adds later (recorded, nothing more).
 */
export function statusEffect(status: string | null | undefined): SubscriptionStatusEffect {
  if (status && ENDED.has(status)) return 'downgrade'
  if (status && NEEDS_ATTENTION.has(status)) return 'attention'
  return 'keep'
}

/** The Stripe Price lookup keys set by /api/admin/setup-stripe-pricing. */
export const PLAN_FOR_LOOKUP_KEY: Readonly<Record<string, OrgPlanFromPrice>> = {
  hoa_per_door_monthly: 'monthly',
  hoa_per_door_annual: 'annual',
  // BL-104 band Prices (created only at the PRICING_V2 cut-over). Knowing
  // them early is harmless: no subscription uses them until then.
  [V2_LOOKUP_KEYS.essentials.monthly]: 'essentials',
  [V2_LOOKUP_KEYS.essentials.annual]: 'essentials',
  [V2_LOOKUP_KEYS.complete.monthly]: 'complete',
  [V2_LOOKUP_KEYS.complete.annual]: 'complete',
}

/** orgs.plan for a known Price: the legacy cadence, or a BL-104 plan. */
export type OrgPlanFromPrice = 'monthly' | 'annual' | 'essentials' | 'complete'

/**
 * orgs.plan for a subscription's price. The lookup key first; then the
 * price ids the HOA app may be configured with instead (apps/hoa
 * resolvePriceId checks STRIPE_PRICE_PER_DOOR_* before the lookup key, so
 * a deployment on env price ids has prices with no lookup key). null: not
 * a price we know, so the plan is left alone.
 */
export function planForPrice(
  price: { id?: string | null; lookup_key?: string | null } | null | undefined,
  env: Record<string, string | undefined> = process.env,
): OrgPlanFromPrice | null {
  if (!price) return null
  if (price.lookup_key && Object.prototype.hasOwnProperty.call(PLAN_FOR_LOOKUP_KEY, price.lookup_key)) {
    return PLAN_FOR_LOOKUP_KEY[price.lookup_key]!
  }
  if (price.id) {
    if (price.id === env.STRIPE_PRICE_PER_DOOR_MONTHLY || price.id === env.STRIPE_PRICE_STANDARD) return 'monthly'
    if (price.id === env.STRIPE_PRICE_PER_DOOR_ANNUAL) return 'annual'
    for (const plan of HOA_PLAN_IDS) {
      for (const cadence of ['monthly', 'annual'] as const) {
        const id = env[V2_PRICE_ENV[plan][cadence]]
        if (id && price.id === id) return plan
      }
    }
  }
  return null
}

// ─── Ordering ─────────────────────────────────────────────────────────

/** An event's position: Stripe's event.created (ISO), then its id. */
export interface EventClock {
  created: string
  eventId: string
}

/**
 * a is later than b. Stripe's `created` has one-second resolution, so
 * same-second events are ordered by event id: arbitrary, but the same
 * whichever arrives first, so the end state does not depend on delivery
 * order.
 */
export function isAfter(a: EventClock, b: EventClock): boolean {
  if (a.created !== b.created) return a.created > b.created
  return a.eventId > b.eventId
}

/** The clock recorded in a billing audit row's metadata, if it has one. */
export function clockOf(metadata: unknown): EventClock | null {
  const m = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null
  const created = m?.event_created
  const eventId = m?.event_id
  if (typeof created !== 'string' || !created || typeof eventId !== 'string' || !eventId) return null
  return { created, eventId }
}

// ─── The board banner ─────────────────────────────────────────────────

export interface BillingAuditRow {
  action: string
  metadata: unknown
}

export interface BillingAttention {
  /** 'payment_failed' = an invoice failed and no later status says otherwise. */
  reason: 'past_due' | 'unpaid' | 'paused' | 'payment_failed'
  /** Stripe's event.created (ISO) of the row that raised it. */
  since: string
}

function meta(row: BillingAuditRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {}
}

/**
 * Whether the billing banner shows, from the org's billing audit rows and
 * its CURRENT subscription id. Rows for any other subscription (an old one,
 * a replaced one) never raise it, and an org with no subscription (free,
 * or downgraded) never shows it.
 *
 * Latest status row wins; a failed invoice raises the banner only when it
 * is newer than that status row. That is what lets an invoice.payment_failed
 * delivered before (or without) its customer.subscription.updated show the
 * banner, while a later `active` (recovered) clears it.
 */
export function billingAttention(rows: readonly BillingAuditRow[], currentSubId: string | null | undefined): BillingAttention | null {
  if (!currentSubId) return null
  let status: { status: string | null; clock: EventClock } | null = null
  let failure: EventClock | null = null
  for (const row of rows) {
    const m = meta(row)
    if (m.sub_id !== currentSubId) continue
    const clock = clockOf(m)
    if (!clock) continue
    if (row.action === AUDIT_SUBSCRIPTION_UPDATED) {
      if (!status || isAfter(clock, status.clock)) status = { status: typeof m.status === 'string' ? m.status : null, clock }
    } else if (row.action === AUDIT_INVOICE_PAYMENT_FAILED) {
      if (!failure || isAfter(clock, failure)) failure = clock
    }
  }
  if (status && statusEffect(status.status) === 'attention') {
    return { reason: status.status as BillingAttention['reason'], since: status.clock.created }
  }
  // Strictly newer: a same-second `active` is the recovery, not the failure.
  if (failure && (!status || failure.created > status.clock.created)) return { reason: 'payment_failed', since: failure.created }
  return null
}

/** Banner copy. Generic on purpose: the details are in Stripe. */
export function billingAttentionMessage(a: BillingAttention): { title: string; body: string } {
  if (a.reason === 'unpaid') {
    return {
      title: 'Your HomeownerHub subscription is unpaid',
      body: 'Stripe could not collect recent payments. Update the card on file to keep your plan.',
    }
  }
  if (a.reason === 'paused') {
    return {
      title: 'Your HomeownerHub subscription is paused',
      body: 'The subscription is not being paid right now. Update the card on file to resume it.',
    }
  }
  if (a.reason === 'past_due') {
    return {
      title: 'Your HomeownerHub payment is past due',
      body: 'Stripe could not charge the card on file and will retry it. Update the card to avoid an interruption.',
    }
  }
  return {
    title: 'A HomeownerHub payment failed',
    body: 'Stripe could not charge the card on file and will retry it. Update the card to avoid an interruption.',
  }
}
