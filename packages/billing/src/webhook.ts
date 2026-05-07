import type Stripe from 'stripe'
import { createAdminClient } from '@homeownerhub/db'
import { getStripe } from './client'

export interface WebhookHandleResult {
  ok: boolean
  /** What we did, for logging. */
  outcome:
    | 'subscription_started'
    | 'one_time_payment'
    | 'case_payment_recorded'
    | 'subscription_deleted'
    | 'invoice_failed'
    | 'ignored'
    | 'error'
  message?: string
}

/**
 * Verifies the Stripe webhook signature, then routes to the relevant handler.
 * Apps mount this from /api/webhooks/stripe.
 *
 * Subscriptions update orgs.plan / stripe_customer_id / stripe_sub_id.
 * One-time payments don't touch orgs.plan (the org might already be on a
 * subscription) but DO save the customer id so the next checkout has a
 * card on file. If the session metadata includes a case_id, the eviction
 * case row also gets stamped with stripe_payment_id (per-case billing).
 *
 * Uses the admin client (service role) since webhooks have no user session.
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
      const caseId = session.metadata?.case_id
      const customerId = (session.customer as string | null) ?? null

      if (!orgId) {
        return { ok: true, outcome: 'ignored', message: 'session missing org_id' }
      }

      if (session.mode === 'subscription') {
        const updates: {
          plan?: string
          stripe_customer_id: string | null
          stripe_sub_id: string | null
        } = {
          stripe_customer_id: customerId,
          stripe_sub_id: (session.subscription as string | null) ?? null,
        }
        if (plan) updates.plan = plan
        await db.from('orgs').update(updates).eq('id', orgId)
        return { ok: true, outcome: 'subscription_started' }
      }

      // One-time payment (mode: 'payment'): never overwrite the running
      // plan. Only stamp the customer id so we keep the card on file.
      if (customerId) {
        await db
          .from('orgs')
          .update({ stripe_customer_id: customerId })
          .eq('id', orgId)
      }

      // Per-case eviction billing: stamp the payment intent id onto the
      // case so the case detail page can show "paid" without polling Stripe.
      if (caseId) {
        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null
        if (paymentIntentId) {
          await db
            .from('eviction_cases')
            .update({ stripe_payment_id: paymentIntentId })
            .eq('id', caseId)
          return { ok: true, outcome: 'case_payment_recorded' }
        }
      }

      return { ok: true, outcome: 'one_time_payment' }
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
      // Stripe retries on its own. We just acknowledge.
      return { ok: true, outcome: 'invoice_failed' }
    }

    default:
      return { ok: true, outcome: 'ignored', message: event.type }
  }
}
