import Stripe from 'stripe'

/** The API version every client in the app (and the sandbox suite) pins. */
export const STRIPE_API_VERSION = '2025-09-30.clover'

let _stripe: Stripe | null = null

/**
 * Lazy Stripe client. Returns null when STRIPE_SECRET_KEY isn't set so
 * apps can render a "billing not configured" state instead of crashing
 * during local dev.
 */
export function getStripe(): Stripe | null {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  _stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion })
  return _stripe
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}
