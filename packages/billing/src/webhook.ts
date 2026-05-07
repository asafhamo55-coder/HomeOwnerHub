import type Stripe from 'stripe'
import { createAdminClient } from '@homeownerhub/db'
import { getStripe } from './client'

export interface WebhookHandleResult {
  ok: boolean
  /** What we did, for logging. */
  outcome:
    | 'checkout_completed'
    | 'subscription_deleted'
    | 'invoice_failed'
    | 'ignored'
    | 'error'
  message?: string
}

/**
 * Verifies the Stripe webhook signature, then routes to the relevant handler.
 * Apps mount this from /api/webhooks/stripe — five-line wrapper.
 *
 * We intentionally use the admin client (service role) since webhooks have no
 * user session and the writes are uniformly cross-org administrative updates
 * (orgs.plan, stripe_customer_id, stripe_sub_id).
 */
export async function handleStripeWebhook(input: {
  rawBody: string
  signatureHeader: string | null
  webhookSecret: string | undefined
}): Promise<WebhookHandleResult> {
  const stripe = getStripe()
  if (!stripe) {
    return { ok: false, outcome: 'error', message: 'stripe_not_configured' }
  }
  if (!input.webhookSecret) {
    return { ok: false, outcome: 'error', message: 'webhook_secret_missing' }
  }
  if (!input.signatureHeader) {
    return { ok: false, outcome: 'error', message: 'signature_missing' }
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      input.rawBody,
      input.signatureHeader,
      input.webhookSecret,
    )
  } catch (err) {
    return {
      ok: false,
      outcome: 'error',
      message: err instanceof Error ? err.message : 'invalid_signature',
    }
  }

  const db = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.org_id
      const plan = session.metadata?.plan
      if (!orgId || !plan) {
        return { ok: true, outcome: 'ignored', message: 'session missing metadata' }
      }
      await db
        .from('orgs')
        .update({
          plan,
          stripe_customer_id: (session.customer as string | null) ?? null,
          stripe_sub_id: (session.subscription as string | null) ?? null,
        })
        .eq('id', orgId)
      return { ok: true, outcome: 'checkout_completed' }
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId =
        typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null
      if (!customerId) {
        return { ok: true, outcome: 'ignored', message: 'no customer on subscription' }
      }
      await db
        .from('orgs')
        .update({ plan: 'free', stripe_sub_id: null })
        .eq('stripe_customer_id', customerId)
      return { ok: true, outcome: 'subscription_deleted' }
    }

    case 'invoice.payment_failed': {
      // We don't change plan on a single failed invoice — Stripe retries on
      // its own. We just log it. A future iteration can email the org or
      // surface it on the billing page.
      return { ok: true, outcome: 'invoice_failed' }
    }

    default:
      return { ok: true, outcome: 'ignored', message: event.type }
  }
}
