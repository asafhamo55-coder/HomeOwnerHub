/**
 * The one place Connect webhook handlers are registered. To handle another
 * event, write your handler in your own file and add ONE line below (see
 * ./connect-webhook.ts for the handler contract). The route imports this file.
 */
import { makeAccountUpdatedHandler } from './connect-account-events'
import { adminDb, writeAccountState } from './connect-store'
import { registerConnectHandler } from './connect-webhook'
import { registerOnlinePaymentConnectHandlers } from './connect-online-handlers'
import { productionOnlineHandlerFactories } from './connect-online-production'

registerConnectHandler(
  'account.updated',
  makeAccountUpdatedHandler((id, state) => writeAccountState(adminDb(), id, state)),
)

// Payment lifecycle, reversals (failed bank payment, refunds, disputes), saved
// methods and payouts. Mapping of retry and rejected outcomes is documented in
// ./connect-online-handlers.ts.
registerOnlinePaymentConnectHandlers(registerConnectHandler, productionOnlineHandlerFactories)
