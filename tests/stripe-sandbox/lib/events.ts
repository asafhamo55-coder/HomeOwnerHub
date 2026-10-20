// Build Stripe events and sign them the way Stripe's servers do, so the
// app's real handler (signature check included) can be driven directly.
// Signing is a local HMAC: no network call.

import type Stripe from 'stripe'
import { STRIPE_API_VERSION } from '../../../packages/billing/src/client'

let seq = 0

export function makeEvent(
  type: string,
  object: Record<string, unknown> | { id: string },
  opts: { id?: string; created?: number } = {},
): Stripe.Event {
  seq += 1
  return {
    id: opts.id ?? `evt_bl103_${Date.now().toString(36)}_${seq}`,
    object: 'event',
    api_version: STRIPE_API_VERSION,
    created: opts.created ?? Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  } as unknown as Stripe.Event
}

export interface SignedDelivery {
  rawBody: string
  signatureHeader: string
}

/**
 * A delivery as Stripe sends it: the JSON body and its `Stripe-Signature`
 * header. `timestamp` (unix seconds) lets a case build a stale delivery.
 */
export function signEvent(
  stripe: Pick<Stripe, 'webhooks'>,
  event: Stripe.Event | string,
  secret: string,
  opts: { timestamp?: number } = {},
): SignedDelivery {
  const rawBody = typeof event === 'string' ? event : JSON.stringify(event)
  const signatureHeader = stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret,
    ...(opts.timestamp != null ? { timestamp: opts.timestamp } : {}),
  })
  return { rawBody, signatureHeader }
}

/** A Request as Next hands it to the route's POST. */
export function webhookRequest(d: { rawBody: string; signatureHeader: string | null }): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (d.signatureHeader != null) headers['stripe-signature'] = d.signatureHeader
  return new Request('https://sandbox.invalid/api/webhooks/stripe', { method: 'POST', headers, body: d.rawBody })
}
