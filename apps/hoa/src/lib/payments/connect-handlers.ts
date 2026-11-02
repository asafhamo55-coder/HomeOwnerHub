/**
 * The one place Connect webhook handlers are registered. To handle another
 * event, write your handler in your own file and add ONE line below (see
 * ./connect-webhook.ts for the handler contract). The route imports this file.
 */
import { makeAccountUpdatedHandler } from './connect-account-events'
import { adminDb, writeAccountState } from './connect-store'
import { registerConnectHandler } from './connect-webhook'

registerConnectHandler(
  'account.updated',
  makeAccountUpdatedHandler((id, state) => writeAccountState(adminDb(), id, state)),
)

// PR 4+ add their lines here, for example:
// registerConnectHandler('payment_intent.succeeded', handlePaymentIntentSucceeded)
