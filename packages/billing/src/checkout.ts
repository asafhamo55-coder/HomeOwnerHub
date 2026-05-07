import type Stripe from 'stripe'
import { getStripe } from './client'

export interface CheckoutSessionInput {
  /** The org we're billing. Stamped into metadata so the webhook can route. */
  orgId: string
  /** Stripe price id from your dashboard. */
  priceId: string
  /** Plan tier name we'll write to orgs.plan on success. */
  plan: string
  /** subscription = recurring, payment = one-time (per-case style billing). */
  mode: 'subscription' | 'payment'
  successUrl: string
  cancelUrl: string
  /** Optional Stripe customer id from a previous checkout — keeps card on file. */
  customerId?: string | null
  /** Optional email to pre-fill on the Stripe Checkout form. */
  customerEmail?: string | null
  /** Extra metadata to attach to the session (e.g. case_id for per-case). */
  extraMetadata?: Record<string, string>
}

export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe()
  if (!stripe) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  return stripe.checkout.sessions.create({
    mode: input.mode,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: `${input.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: input.cancelUrl,
    metadata: {
      org_id: input.orgId,
      plan: input.plan,
      ...(input.extraMetadata ?? {}),
    },
    // For subscriptions we also stash metadata on the subscription itself so
    // future invoice events still know which org they belong to.
    ...(input.mode === 'subscription'
      ? {
          subscription_data: {
            metadata: { org_id: input.orgId, plan: input.plan },
          },
        }
      : {}),
    ...(input.customerId ? { customer: input.customerId } : {}),
    ...(input.customerEmail && !input.customerId
      ? { customer_email: input.customerEmail }
      : {}),
    allow_promotion_codes: true,
  })
}

/**
 * Stripe Customer Portal: lets the customer manage their subscription
 * (cancel, swap plan, update card) without us building the UI. Returns the
 * URL to redirect them to.
 */
export async function createPortalSession(input: {
  customerId: string
  returnUrl: string
}): Promise<string> {
  const stripe = getStripe()
  if (!stripe) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  })
  return session.url
}
