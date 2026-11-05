/**
 * Adapters that put the online-payment handlers (payment lifecycle, reversals,
 * saved methods, payouts) behind the Connect webhook's one contract
 * (./connect-webhook.ts): a handler returns a short outcome string, or THROWS
 * when the work did not persist so the route answers 500 and Stripe redelivers.
 *
 * How each module's own outcome maps:
 *  - applied / noop / already_applied / ignored*   -> return the word.
 *  - retry (attempt not found yet, a race with creation) -> THROW. Redelivery
 *    finds the row. Stripe retries for days, so a genuinely unknown id costs
 *    noise in the log, never a lost payment.
 *  - rejected (the event's account is not the attempt's account) -> LOG the
 *    event id and RETURN 'rejected:...'. Redelivery cannot fix it, and a 500
 *    would make Stripe hammer the endpoint for days over a forged-looking id.
 *    The event is then recorded as handled so it is not re-processed.
 *
 * Two handlers share `payment_intent.payment_failed`: the status handler runs
 * first (it moves an unposted attempt to failed), the reversal handler second
 * (it reverses a POSTED bank payment that came back). Both are idempotent on
 * their own keys, and the core runs both even if the first throws.
 *
 * Everything the handlers need is built lazily per event, so importing this
 * file creates no database client.
 */
import type { ConnectEventContext, ConnectHandler } from './connect-webhook'
import type { StripeConnect } from './stripe-connect'
import { makeHandlers, type ConnectEventLike as LifecycleEvent, type ConnectHandlerResult, type WebhookDeps } from '@/lib/online-payments/webhook-handlers'
import {
  REVERSAL_EVENT_TYPES,
  handleReversalEvent,
  type ConnectEventLike as ReversalEvent,
  type ReversalDeps,
  type ReversalResult,
} from '@/lib/online-payments/reversals'
import {
  savedMethodEventHandlers,
  type ConnectEventLike as SavedEvent,
  type HandlerDb,
  type HandlerOutcome,
} from '@/lib/online-payments/saved-method-webhooks'
import { handlePayoutEvent, PAYOUT_EVENT_TYPES, type PayoutEventLike, type PayoutPorts } from '@/lib/online-payments/payouts'

export interface AutopayFailureHooks {
  /** After a failed-payment event was handled: count it against the autopay streak (idempotent). */
  countFailure(paymentIntentId: string): Promise<string>
  /** After a payment posted: end the streak. */
  resetFailures(attemptId: string): Promise<void>
}

export interface OnlineHandlerFactories {
  lifecycle: () => WebhookDeps
  reversal: () => ReversalDeps
  savedMethodsDb?: () => HandlerDb
  payouts: (stripe: StripeConnect) => PayoutPorts
  autopay?: () => AutopayFailureHooks
}

type Register = (eventType: string, handler: ConnectHandler) => void

const logRejected = (type: string, eventId: string, reason: string) =>
  console.error('[stripe-connect webhook] event rejected', { type, eventId, reason })

function fromLifecycle(r: ConnectHandlerResult, ctx: ConnectEventContext): string {
  if (r.outcome === 'retry') throw new Error(`retry:${r.reason}`)
  if (r.outcome === 'rejected') {
    logRejected(ctx.event.type, ctx.event.id, r.reason)
    return `rejected:${r.reason}`
  }
  return r.outcome
}

function fromReversal(r: ReversalResult, ctx: ConnectEventContext): string {
  if (r.outcome === 'retry') throw new Error(`retry:${r.reason ?? 'attempt_not_found'}`)
  if (r.outcome === 'rejected_account') {
    logRejected(ctx.event.type, ctx.event.id, 'account_mismatch')
    return 'rejected:account_mismatch'
  }
  return r.outcome
}

/** Stripe.Event to the small shapes the modules read. The core already checked the signature. */
const asLike = <T>(ctx: ConnectEventContext): T => ctx.event as unknown as T

/** Registers every online-payment handler through `register` (the one hook in connect-handlers.ts). */
export function registerOnlinePaymentConnectHandlers(register: Register, f: OnlineHandlerFactories): void {
  // 1. Payment lifecycle: processing / requires_action / failed / canceled / succeeded.
  const lifecycleTypes = Object.keys(makeHandlers({ store: undefined as never }))
  for (const type of lifecycleTypes) {
    register(type, async (ctx) => {
      const deps = f.lifecycle()
      const handler = makeHandlers(deps)[type]!
      const out = await handler(asLike<LifecycleEvent>(ctx))
      const word = fromLifecycle(out, ctx)
      // A bank debit can post days after the run: that success ends a failure streak.
      if (type === 'payment_intent.succeeded' && out.outcome === 'applied' && f.autopay) {
        const attemptId = await attemptIdFor(deps, ctx)
        if (attemptId) await f.autopay().resetFailures(attemptId)
      }
      return word
    })
  }

  // 2. Reversals: failed bank payment after posting, refunds, disputes.
  for (const type of REVERSAL_EVENT_TYPES) {
    register(type, async (ctx) => {
      const out = await handleReversalEvent(asLike<ReversalEvent>(ctx), f.reversal())
      return fromReversal(out, ctx)
    })
  }

  // 3. Autopay streak: runs after both handlers above have finished on a failed payment.
  if (f.autopay) {
    register('payment_intent.payment_failed', async (ctx) => {
      const id = (ctx.event.data.object as { id?: unknown }).id
      if (typeof id !== 'string') return 'autopay:no_intent'
      return `autopay:${await f.autopay!().countFailure(id)}`
    })
  }

  // 4. Saved methods.
  const savedTypes = ['setup_intent.succeeded', 'payment_method.detached', 'mandate.updated']
  for (const type of savedTypes) {
    register(type, async (ctx) => {
      const handlers = savedMethodEventHandlers(
        { retrievePaymentMethod: (account, id) => ctx.stripe.retrievePaymentMethod(account, id) },
        f.savedMethodsDb?.(),
      )
      const out: HandlerOutcome = await handlers[type]!(asLike<SavedEvent>(ctx))
      return out
    })
  }

  // 5. Payouts.
  for (const type of PAYOUT_EVENT_TYPES) {
    register(type, async (ctx) => handlePayoutEvent(asLike<PayoutEventLike>(ctx), f.payouts(ctx.stripe)))
  }
}

/** The attempt id for a payment_intent event, through the lifecycle store. */
async function attemptIdFor(deps: WebhookDeps, ctx: ConnectEventContext): Promise<string | null> {
  const id = (ctx.event.data.object as { id?: unknown }).id
  if (typeof id !== 'string') return null
  return (await deps.store.findByIntent(id))?.id ?? null
}
