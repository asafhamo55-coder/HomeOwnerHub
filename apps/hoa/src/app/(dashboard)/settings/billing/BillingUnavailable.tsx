import { Alert } from '@homeowner-portal/ui'

/**
 * Shown when Stripe isn't configured on this server. Customers never see
 * which environment variables are missing — that detail goes to the
 * server log (logBillingUnavailable) for us, not to the page.
 */
export function BillingUnavailable() {
  return (
    <Alert variant="warning" title="Billing isn’t available right now">
      You can’t start or change a subscription at the moment. Your current plan isn’t affected. Try again later, or contact support if
      this keeps happening.
    </Alert>
  )
}

/** Server-side detail for the missing configuration: env var names only, no customer data. */
export function logBillingUnavailable(orgId: string, v2: boolean): void {
  console.error('[billing] Stripe is not configured: checkout is unavailable', {
    orgId,
    missing: v2 ? 'STRIPE_SECRET_KEY (and the band plan prices)' : 'STRIPE_SECRET_KEY (and STRIPE_PRICE_PER_DOOR_MONTHLY / STRIPE_PRICE_PER_DOOR_ANNUAL)',
  })
}
