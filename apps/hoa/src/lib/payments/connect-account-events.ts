/**
 * `account.updated` on the Connect endpoint: mirror the account's onboarding
 * state. The payload is NOT trusted for ordering (Stripe may deliver events
 * out of order), so the handler re-reads the account and writes what Stripe
 * says now. A stale event therefore cannot flip an enabled account back off.
 */
import type { ConnectHandler } from './connect-webhook'
import type { ConnectAccountState } from './stripe-connect'

export function makeAccountUpdatedHandler(
  write: (stripeAccountId: string, state: ConnectAccountState) => Promise<void>,
): ConnectHandler {
  return async ({ account, stripe }) => {
    const state = await stripe.retrieveAccount(account.stripeAccountId)
    await write(account.stripeAccountId, state)
    return 'account_synced'
  }
}
