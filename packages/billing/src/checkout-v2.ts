// BL-104 §3 — what a PRICING_V2 checkout sends to Stripe. Pure, so the
// rules are unit-tested without a Stripe client:
//   - there is one plan (SOLD_PRICE_FAMILY), so the
//     cadence alone picks the Price (lookup key, or an env price id). The
//     caller cannot ask for Complete: there is no plan field to send;
//   - quantity = the server-side unit count, never a form field; 0 units
//     blocks checkout ("add your homes first");
//   - a first subscription gets the 30-day trial and may start without a
//     card (payment_method_collection 'if_required');
//   - a grandfathered $4.99/door subscriber is not sent to checkout: they
//     keep their price until renewal (decision §5).

import {
  SOLD_PLAN_ID,
  SOLD_PRICE_FAMILY,
  TRIAL_DAYS,
  V2_LOOKUP_KEYS,
  V2_PRICE_ENV,
  isLegacyPlan,
  isUnsubscribedPlan,
  type BillingCadence,
  type HoaPlanId,
} from './pricing-v2'

export interface V2CheckoutFacts {
  cadence: BillingCadence
  /** Server-side count of the org's homes (hoa_properties rows). */
  unitCount: number
  /** orgs.plan as stored. */
  currentPlan: string | null
  /** orgs.stripe_sub_id — a live subscription. */
  stripeSubId: string | null
  /** orgs.stripe_customer_id — set once any checkout completed (so: not a first subscription). */
  stripeCustomerId: string | null
}

export type V2CheckoutPlan =
  | {
      ok: true
      lookupKey: string
      priceEnv: string
      quantity: number
      /** orgs.plan the webhook writes and checkout stamps in metadata. */
      metadataPlan: HoaPlanId
      trialPeriodDays?: number
      paymentMethodCollection: 'always' | 'if_required'
    }
  | { ok: false; reason: 'no_units' | 'grandfathered' | 'already_subscribed'; message: string }

export function planV2Checkout(f: V2CheckoutFacts): V2CheckoutPlan {
  if (isLegacyPlan(f.currentPlan) && f.stripeSubId) {
    return {
      ok: false,
      reason: 'grandfathered',
      message:
        'Your current price stays until your term ends. To move to the new price sooner, email support and we’ll switch you at your next invoice.',
    }
  }
  if (!isUnsubscribedPlan(f.currentPlan) && f.stripeSubId) {
    return {
      ok: false,
      reason: 'already_subscribed',
      message: 'You already have a subscription. Change it under Manage subscription.',
    }
  }
  const units = Number.isFinite(f.unitCount) ? Math.floor(f.unitCount) : 0
  if (units < 1) {
    return { ok: false, reason: 'no_units', message: 'Add your homes first: the price is set by how many homes you have.' }
  }
  const first = !f.stripeCustomerId
  return {
    ok: true,
    lookupKey: V2_LOOKUP_KEYS[SOLD_PRICE_FAMILY][f.cadence],
    priceEnv: V2_PRICE_ENV[SOLD_PRICE_FAMILY][f.cadence],
    quantity: units,
    metadataPlan: SOLD_PLAN_ID,
    ...(first ? { trialPeriodDays: TRIAL_DAYS } : {}),
    paymentMethodCollection: first ? 'if_required' : 'always',
  }
}
