/**
 * The real Stripe adapter for the online-payment port. SERVER ONLY, and not a
 * 'use server' module: nothing here is callable from a browser. Tests never
 * import it; they pass a fake port (stripe-port.ts).
 *
 * There is ONE Stripe adapter for payments, lib/payments/stripe-connect.ts;
 * this is just the attempt code's view of it.
 */
import { getStripeConnect } from '@/lib/payments/stripe-connect'
import { portFromConnect, type OnlinePaymentsStripePort } from './stripe-port'

/** The configured live port, or null when STRIPE_SECRET_KEY is not set. */
export function getLivePort(): OnlinePaymentsStripePort | null {
  const connect = getStripeConnect()
  return connect ? portFromConnect(connect) : null
}
