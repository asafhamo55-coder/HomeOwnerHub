/**
 * Production wiring for the online-payment Connect handlers: service-role
 * client, the live receipt runner, the real notifier. Imported only by
 * connect-handlers.ts (the webhook route). Nothing runs until an event
 * arrives, and the route is dark behind M8_APPLIED.
 */
import { createAdminClient } from '@homeowner-portal/db'
import type { OnlineHandlerFactories } from './connect-online-handlers'
import { productionWebhookDeps } from '@/lib/online-payments/production'
import { reversalDeps } from '@/lib/online-payments/reversals-deps'
import { createSupabasePayoutPorts } from '@/lib/online-payments/payouts-store'
import { countAutopayFailure, resetAutopayFailures } from '@/lib/online-payments/autopay-failures'

type FailuresDb = Parameters<typeof countAutopayFailure>[0]

export const productionOnlineHandlerFactories: OnlineHandlerFactories = {
  lifecycle: () => productionWebhookDeps(),
  reversal: () => reversalDeps(),
  payouts: (stripe) =>
    createSupabasePayoutPorts(createAdminClient(), {
      listPayoutBalanceLines: (account, payoutId) => stripe.listPayoutBalanceLines(account, payoutId),
    }),
  autopay: () => {
    const db = createAdminClient() as unknown as FailuresDb
    return {
      countFailure: (pi) => countAutopayFailure(db, pi),
      resetFailures: (attemptId) => resetAutopayFailures(db, attemptId),
    }
  },
}
