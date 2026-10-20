import type Stripe from 'stripe'
import { createAdminClient } from '@homeowner-portal/db'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
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
    | 'duplicate'
    | 'ignored'
    | 'error'
  message?: string
  /** Postgres / PostgREST code of a failed write — never its message. */
  dbCode?: string
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
 * `deps` exists for tests (the BL-103 Stripe sandbox suite): an in-memory
 * db and an explicit Stripe client. Routes pass nothing.
 */
export async function handleStripeWebhook(
  input: {
    rawBody: string
    signatureHeader: string | null
    webhookSecret: string | undefined
  },
  deps: { db?: WebhookDb; stripe?: Stripe | null; m1?: boolean } = {},
): Promise<WebhookHandleResult> {
  const stripe = deps.stripe ?? getStripe()
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
    event = stripe.webhooks.constructEvent(input.rawBody, input.signatureHeader, input.webhookSecret)
  } catch {
    // Never surface the SDK's text: it is provider detail, not a code.
    return { ok: false, outcome: 'error', message: 'invalid_signature' }
  }

  return applyStripeEvent(event, {
    db: deps.db ?? (createAdminClient() as unknown as WebhookDb),
    m1: deps.m1,
  })
}

/**
 * HTTP status for a handler result. A request we can never accept (no or
 * bad signature) is 400; a failure on our side (not configured, a write
 * that did not persist) is 500. Stripe redelivers either way, but only the
 * 500s are ours to fix, and logs/alerts can now tell them apart.
 */
export function webhookHttpStatus(result: WebhookHandleResult): number {
  if (result.ok) return 200
  if (result.message === 'signature_missing' || result.message === 'invalid_signature') return 400
  return 500
}

// ─── Persistence ──────────────────────────────────────────────────────

type DbError = { code?: string | number } | null

interface WebhookRpcs {
  stripe_webhook_checkout_subscription: {
    p_event_id: string
    p_event_created: string
    p_org_id: string
    p_customer_id: string | null
    p_sub_id: string | null
    p_plan: string | null
  }
  stripe_webhook_checkout_payment: {
    p_event_id: string
    p_event_created: string
    p_org_id: string
    p_customer_id: string | null
    p_case_id: string | null
    p_payment_intent_id: string | null
  }
  stripe_webhook_subscription_deleted: {
    p_event_id: string
    p_event_created: string
    p_sub_id: string
  }
}

interface Filterable extends PromiseLike<{ error: DbError }> {
  eq(col: string, value: string): Filterable
}

/** The slice of the admin client this module uses (structural, so tests can fake it). */
export interface WebhookDb {
  from(table: 'orgs' | 'eviction_cases'): { update(patch: Record<string, unknown>): Filterable }
  rpc<N extends keyof WebhookRpcs>(fn: N, args: WebhookRpcs[N]): PromiseLike<{ data: unknown; error: DbError }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APPLIED = new Set<WebhookHandleResult['outcome']>([
  'subscription_started',
  'subscription_deleted',
  'one_time_payment',
  'case_payment_recorded',
])

function persistFailed(error: DbError): WebhookHandleResult {
  return {
    ok: false,
    outcome: 'error',
    message: 'persist_failed',
    dbCode: error?.code != null ? String(error.code) : undefined,
  }
}

async function callRpc<N extends keyof WebhookRpcs>(db: WebhookDb, fn: N, args: WebhookRpcs[N]): Promise<WebhookHandleResult> {
  const { data, error } = await db.rpc(fn, args)
  if (error) return persistFailed(error)
  const code = typeof data === 'string' ? data : null
  if (code === 'duplicate') return { ok: true, outcome: 'duplicate' }
  if (code && code.startsWith('ignored_')) return { ok: true, outcome: 'ignored', message: code.slice('ignored_'.length) }
  if (code && APPLIED.has(code as WebhookHandleResult['outcome'])) {
    return { ok: true, outcome: code as WebhookHandleResult['outcome'] }
  }
  // A reply we do not understand: we cannot claim it persisted.
  return { ok: false, outcome: 'error', message: 'unexpected_rpc_result' }
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : (value.id ?? null)
}

/**
 * Apply one verified event.
 *
 * m1 = false (today): the pre-M1 direct writes, unchanged in effect.
 *
 * m1 = true (after migrations/0064_m1_batch.sql): every handled event goes
 * through ONE SQL function that dedupes on Stripe's event id, records the
 * event against its SUBSCRIPTION (stripe_subscriptions), and recomputes the
 * org from the set of subscriptions it has seen — the latest-started live
 * one, or free once its current one is recorded deleted. The result does
 * not depend on delivery order, so a deletion of the old subscription
 * processed before the replacement's checkout cannot leave a paying org on
 * free (the refuted r2 0064 kept one per-org clock and could). A failed
 * write is ok: false, so the route answers non-2xx and Stripe redelivers.
 */
export async function applyStripeEvent(
  event: Stripe.Event,
  deps: { db: WebhookDb; m1?: boolean },
): Promise<WebhookHandleResult> {
  const m1 = deps.m1 ?? M1_APPLIED
  const db = deps.db
  const eventCreated = new Date(event.created * 1000).toISOString()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.org_id
      const plan = session.metadata?.plan || null
      const caseId = session.metadata?.case_id
      const customerId = idOf(session.customer as string | { id: string } | null)
      const paymentIntentId = idOf(session.payment_intent as string | { id: string } | null)

      if (!orgId) return { ok: true, outcome: 'ignored', message: 'session_missing_org_id' }

      if (m1) {
        // Our checkout stamps a uuid; anything else would fail the uuid cast on every redelivery.
        if (!UUID_RE.test(orgId)) return { ok: true, outcome: 'ignored', message: 'session_invalid_org_id' }
        if (session.mode === 'subscription') {
          return callRpc(db, 'stripe_webhook_checkout_subscription', {
            p_event_id: event.id,
            p_event_created: eventCreated,
            p_org_id: orgId,
            p_customer_id: customerId,
            p_sub_id: idOf(session.subscription as string | { id: string } | null),
            p_plan: plan,
          })
        }
        return callRpc(db, 'stripe_webhook_checkout_payment', {
          p_event_id: event.id,
          p_event_created: eventCreated,
          p_org_id: orgId,
          p_customer_id: customerId,
          p_case_id: caseId && UUID_RE.test(caseId) ? caseId : null,
          p_payment_intent_id: paymentIntentId,
        })
      }

      if (session.mode === 'subscription') {
        const updates: Record<string, unknown> = {
          stripe_customer_id: customerId,
          stripe_sub_id: idOf(session.subscription as string | { id: string } | null),
        }
        if (plan) updates.plan = plan
        // A failed write must not be acknowledged: before 0064 the plan
        // check rejected 'monthly'/'annual' (23514) and this returned ok,
        // so Stripe never redelivered and the paying org stayed free.
        const { error } = await db.from('orgs').update(updates).eq('id', orgId)
        if (error) return persistFailed(error)
        return { ok: true, outcome: 'subscription_started' }
      }

      // One-time payment (mode: 'payment'): never overwrite the running
      // plan. Only stamp the customer id so we keep the card on file.
      if (customerId) {
        const { error } = await db.from('orgs').update({ stripe_customer_id: customerId }).eq('id', orgId)
        if (error) return persistFailed(error)
      }

      // Per-case eviction billing, scoped by org_id from the verified
      // metadata so a stray case_id from another org never matches.
      if (caseId && paymentIntentId) {
        const { error } = await db
          .from('eviction_cases')
          .update({ stripe_payment_id: paymentIntentId })
          .eq('id', caseId)
          .eq('org_id', orgId)
        if (error) return persistFailed(error)
        return { ok: true, outcome: 'case_payment_recorded' }
      }

      return { ok: true, outcome: 'one_time_payment' }
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      if (m1) {
        if (!sub.id) return { ok: true, outcome: 'ignored', message: 'subscription_missing_id' }
        return callRpc(db, 'stripe_webhook_subscription_deleted', {
          p_event_id: event.id,
          p_event_created: eventCreated,
          p_sub_id: sub.id,
        })
      }
      const customerId = idOf(sub.customer as string | { id: string } | null)
      if (!customerId) {
        return { ok: true, outcome: 'ignored', message: 'no customer on subscription' }
      }
      const { error } = await db.from('orgs').update({ plan: 'free', stripe_sub_id: null }).eq('stripe_customer_id', customerId)
      if (error) return persistFailed(error)
      return { ok: true, outcome: 'subscription_deleted' }
    }

    case 'invoice.payment_failed':
      // Stripe retries on its own. We just acknowledge.
      return { ok: true, outcome: 'invoice_failed' }

    default:
      return { ok: true, outcome: 'ignored', message: event.type }
  }
}
