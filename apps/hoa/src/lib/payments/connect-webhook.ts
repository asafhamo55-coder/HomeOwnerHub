/**
 * Stripe Connect webhook core (BL-035). The route
 * app/api/webhooks/stripe-connect/route.ts is a thin wrapper around
 * `processConnectWebhook`.
 *
 * HOW OTHER PAYMENT FEATURES PLUG IN: write a handler in your own file and add
 * ONE line to ./connect-handlers.ts:
 *
 *   registerConnectHandler('payment_intent.succeeded', handlePaymentSucceeded)
 *
 * A handler gets the verified event and the association row resolved from
 * `event.account`. It returns a short outcome string (logged and stored in the
 * dedupe ledger). It THROWS when the work did not persist: the route then
 * answers 500, nothing is recorded and Stripe redelivers. Several handlers may
 * register for one event type; they run in registration order.
 *
 * What the core guarantees before any handler runs: the signature checked
 * against the raw body, the event is for this mode (test vs live), it
 * carries a connected account we know, and it is not a duplicate. The dedupe
 * ledger is noise control, not the safety: handlers stay idempotent on their
 * own business keys, and the ledger row is written last so a crash mid-handler
 * is redelivered and finishes.
 */
import type { StripeConnect, StripeEvent } from './stripe-connect'
import type { ConnectAccountRow } from './connect-account'

export interface ConnectEventContext {
  event: StripeEvent
  /** The association's Connect row, resolved from event.account. */
  account: ConnectAccountRow
  stripe: StripeConnect
}

export type ConnectHandler = (ctx: ConnectEventContext) => Promise<string>

const registry = new Map<string, ConnectHandler[]>()

export function registerConnectHandler(eventType: string, handler: ConnectHandler): void {
  const list = registry.get(eventType) ?? []
  // Registering the same function twice (module re-evaluation) is a no-op.
  if (!list.includes(handler)) list.push(handler)
  registry.set(eventType, list)
}

export function connectHandlersFor(eventType: string): readonly ConnectHandler[] {
  return registry.get(eventType) ?? []
}

/** Test helper. */
export function clearConnectHandlers(): void {
  registry.clear()
}

/**
 * A handler that acts on a payment attempt must call this first: the event's
 * account has to be the account the attempt was created on. A valid signature
 * does not prove the event's object belongs to this association.
 */
export function accountMatches(ctx: ConnectEventContext, attemptStripeAccountId: string | null | undefined): boolean {
  return Boolean(attemptStripeAccountId) && attemptStripeAccountId === ctx.account.stripeAccountId
}

/** Persistence the core needs. The route wires the Supabase one. */
export interface ConnectWebhookStore {
  findAccountByStripeId(stripeAccountId: string): Promise<ConnectAccountRow | null>
  eventSeen(eventId: string): Promise<boolean>
  recordEvent(e: {
    eventId: string
    eventType: string
    eventCreated: Date
    objectId: string | null
    orgId: string
    outcome: string
  }): Promise<void>
}

export type ConnectWebhookOutcome =
  | 'handled'
  | 'ignored'
  | 'duplicate'
  | 'unknown_account'
  | 'no_account'
  | 'livemode_mismatch'
  | 'error'

export interface ConnectWebhookResult {
  ok: boolean
  outcome: ConnectWebhookOutcome
  message?: string
  /** 400 for a request we can never accept, 500 for a failure on our side. */
  status: number
}

/** True when the key is a live Stripe key. */
export function isLiveKey(key: string | undefined): boolean {
  return /^(sk|rk)_live_/.test(key ?? '')
}

export async function processConnectWebhook(
  input: {
    rawBody: string
    signatureHeader: string | null
    webhookSecret: string | undefined
    /** Whether the platform key is live; events from the other mode are refused. */
    platformLive: boolean
  },
  deps: { stripe: StripeConnect | null; store: ConnectWebhookStore },
): Promise<ConnectWebhookResult> {
  const fail = (status: number, message: string): ConnectWebhookResult => ({
    ok: false,
    outcome: 'error',
    message,
    status,
  })
  if (!deps.stripe) return fail(500, 'stripe_not_configured')
  if (!input.webhookSecret) return fail(500, 'webhook_secret_missing')
  if (!input.signatureHeader) return fail(400, 'signature_missing')

  let event: StripeEvent
  try {
    event = deps.stripe.constructEvent(input.rawBody, input.signatureHeader, input.webhookSecret)
  } catch {
    // Never surface the SDK's text. The event id is not trusted yet, so none is logged.
    return fail(400, 'invalid_signature')
  }

  const done = (outcome: ConnectWebhookOutcome): ConnectWebhookResult => ({ ok: true, outcome, status: 200 })

  // A test-mode event must never post to a live platform, or the reverse.
  if (Boolean(event.livemode) !== input.platformLive) return done('livemode_mismatch')

  const stripeAccountId = event.account
  if (!stripeAccountId) return done('no_account')

  let account: ConnectAccountRow | null
  try {
    if (await deps.store.eventSeen(event.id)) return done('duplicate')
    account = await deps.store.findAccountByStripeId(stripeAccountId)
  } catch {
    return fail(500, 'store_read_failed')
  }
  if (!account) return done('unknown_account')

  const handlers = connectHandlersFor(event.type)
  const outcomes: string[] = []
  try {
    for (const h of handlers) {
      outcomes.push(await h({ event, account, stripe: deps.stripe }))
    }
  } catch {
    // Nothing recorded: Stripe redelivers and the handler finishes the job.
    return fail(500, 'handler_failed')
  }

  const outcome = handlers.length === 0 ? 'ignored' : outcomes.join(',').slice(0, 64)
  try {
    await deps.store.recordEvent({
      eventId: event.id,
      eventType: event.type,
      eventCreated: new Date(event.created * 1000),
      objectId: objectIdOf(event),
      orgId: account.organizationId,
      outcome,
    })
  } catch {
    return fail(500, 'record_failed')
  }
  return done(handlers.length === 0 ? 'ignored' : 'handled')
}

function objectIdOf(event: StripeEvent): string | null {
  const id = (event.data?.object as { id?: unknown } | undefined)?.id
  return typeof id === 'string' && id.length > 0 && id.length <= 255 ? id : null
}
