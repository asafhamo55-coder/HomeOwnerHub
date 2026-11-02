/**
 * BL-035 PR 4/5: Connect webhook handlers for the payment lifecycle
 * (design doc 3.4, 3.7). Pure over a store port; the real store is
 * attempt-store.ts.
 *
 * RECONCILIATION NEEDED: the Connect webhook route and its handler registry
 * belong to another agent (lib/payments/stripe-connect.ts). That interface did
 * not exist when this was written, so this file codes against the small local
 * `ConnectHandlerRegistry` below. Registration is one line in the route:
 *
 *   registerOnlinePaymentHandlers(registry, productionDeps())
 *
 * where `registry.register(eventType, handler)` stores a handler. If the real
 * registry has another shape, adapt only that one line. The route must have
 * verified the signature on the raw body and deduped on event id before
 * calling a handler; the safety here is in the business keys (unique intent,
 * the attempt row lock inside record_online_payment_success).
 *
 * Rules enforced here:
 *  - status moves forward only (a late `processing` never downgrades `succeeded`);
 *  - `processing` (ACH) posts NOTHING; only `succeeded` posts;
 *  - an event whose account is not the attempt's account is rejected;
 *  - an unknown attempt on `succeeded` asks for a retry (race with creation).
 */

export interface ConnectEventLike {
  id: string
  type: string
  /** The connected account the event is about (acct_...). */
  account?: string | null
  /** Unix seconds. */
  created: number
  data: { object: Record<string, unknown> }
}

export type ConnectHandlerResult =
  | { outcome: 'applied' | 'noop' }
  /** Do not mark the event done: respond 5xx so Stripe redelivers. */
  | { outcome: 'retry'; reason: string }
  | { outcome: 'rejected'; reason: string }

export type ConnectEventHandler = (event: ConnectEventLike) => Promise<ConnectHandlerResult>

export interface ConnectHandlerRegistry {
  register(eventType: string, handler: ConnectEventHandler): void
}

export interface WebhookAttempt {
  id: string
  stripe_account_id: string
  status: string
  association_id: string
}

export interface WebhookStore {
  findByIntent(intentId: string): Promise<WebhookAttempt | null>
  /** Sets status only if the current status is one of `from`. Returns whether a row changed. */
  transition(attemptId: string, to: string, from: readonly string[], failureCode?: string | null): Promise<boolean>
  /** record_online_payment_success (service role). Returns the posted payment ids. */
  postSuccess(attemptId: string, paidOn: string, chargeId: string | null): Promise<{ alreadyPosted: boolean; paymentIds: string[] }>
  /** The association's day for `unixSeconds`. */
  dayFor(associationId: string, unixSeconds: number): Promise<string>
}

export interface WebhookDeps {
  store: WebhookStore
  /** Best effort, after posting. The runner itself is gated by the board's setting and the outbound guard. */
  afterPosted?: (info: { attemptId: string; associationId: string; paymentIds: string[] }) => Promise<void>
}

/** Forward-only status rules. */
export const FROM_FOR = {
  requires_action: ['created'],
  processing: ['created', 'requires_action'],
  failed: ['created', 'requires_action', 'processing'],
  canceled: ['created', 'requires_action'],
} as const

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

function intentOf(event: ConnectEventLike): { id: string; chargeId: string | null; errorCode: string | null } | null {
  const o = event.data.object
  const id = str(o.id)
  if (!id || !id.startsWith('pi_')) return null
  const err = o.last_payment_error as { code?: unknown } | null | undefined
  return { id, chargeId: str(o.latest_charge), errorCode: str(err?.code)?.slice(0, 120) ?? null }
}

async function locate(deps: WebhookDeps, event: ConnectEventLike) {
  const pi = intentOf(event)
  if (!pi) return { err: { outcome: 'rejected', reason: 'no_intent' } as ConnectHandlerResult }
  const attempt = await deps.store.findByIntent(pi.id)
  if (!attempt) return { pi, err: { outcome: 'noop' } as ConnectHandlerResult, missing: true as const }
  if (!event.account || event.account !== attempt.stripe_account_id) {
    return { pi, err: { outcome: 'rejected', reason: 'account_mismatch' } as ConnectHandlerResult }
  }
  return { pi, attempt }
}


export function makeHandlers(deps: WebhookDeps): Record<string, ConnectEventHandler> {
  const move =
    (to: keyof typeof FROM_FOR, withError: boolean): ConnectEventHandler =>
    async (event) => {
      const found = await locate(deps, event)
      if ('err' in found && found.err) return found.err
      const { attempt, pi } = found as { attempt: WebhookAttempt; pi: NonNullable<ReturnType<typeof intentOf>> }
      const changed = await deps.store.transition(attempt.id, to, FROM_FOR[to], withError ? pi.errorCode : undefined)
      return { outcome: changed ? 'applied' : 'noop' }
    }

  return {
    'payment_intent.requires_action': move('requires_action', false),
    // ACH: the bank has the debit. Nothing is posted to the books.
    'payment_intent.processing': move('processing', false),
    'payment_intent.payment_failed': move('failed', true),
    'payment_intent.canceled': move('canceled', false),
    'payment_intent.succeeded': async (event) => {
      const found = await locate(deps, event)
      if ('missing' in found && found.missing) {
        return { outcome: 'retry', reason: 'attempt_not_found' }
      }
      if ('err' in found && found.err) return found.err
      const { attempt, pi } = found as { attempt: WebhookAttempt; pi: NonNullable<ReturnType<typeof intentOf>> }
      const paidOn = await deps.store.dayFor(attempt.association_id, event.created)
      const posted = await deps.store.postSuccess(attempt.id, paidOn, pi.chargeId)
      if (!posted.alreadyPosted && deps.afterPosted) {
        try {
          await deps.afterPosted({ attemptId: attempt.id, associationId: attempt.association_id, paymentIds: posted.paymentIds })
        } catch (e) {
          console.error('[online-payments] after-posted hook failed', { attempt: attempt.id, error: e instanceof Error ? e.name : 'unknown' })
        }
      }
      return { outcome: posted.alreadyPosted ? 'noop' : 'applied' }
    },
  }
}

/** The one registration entry point. */
export function registerOnlinePaymentHandlers(registry: ConnectHandlerRegistry, deps: WebhookDeps): void {
  for (const [type, handler] of Object.entries(makeHandlers(deps))) registry.register(type, handler)
}
