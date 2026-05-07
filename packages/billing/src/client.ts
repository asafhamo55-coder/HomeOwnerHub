import Stripe from 'stripe'

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
  _stripe = new Stripe(key, { apiVersion: '2025-09-30.clover' as Stripe.LatestApiVersion })
  return _stripe
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}
