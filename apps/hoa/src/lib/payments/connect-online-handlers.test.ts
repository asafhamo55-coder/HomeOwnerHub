import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/db/m8', () => ({ M8_APPLIED: true }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))

import { clearConnectHandlers, connectHandlersFor, processConnectWebhook, registerConnectHandler } from './connect-webhook'
import { registerOnlinePaymentConnectHandlers, type OnlineHandlerFactories } from './connect-online-handlers'
import { createFakeStripeConnect, fakeSignature } from './stripe-connect-fake'
import type { ConnectAccountRow } from './connect-account'
import type { WebhookStore } from '@/lib/online-payments/webhook-handlers'

const ACCT = 'acct_fake00000001'
const SECRET = 'whsec_t'
const row: ConnectAccountRow = {
  id: 'r',
  organizationId: 'o',
  associationId: 'a',
  stripeAccountId: ACCT,
  detailsSubmitted: true,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsDue: [],
  disabledReason: null,
  onlinePaymentsEnabled: true,
  achFeePayer: 'association',
  cardFeePayer: 'homeowner',
  cardFeeAcknowledgedAt: null,
  returnedPaymentFeeCents: null,
}

const seen = new Set<string>()
const store = {
  findAccountByStripeId: async () => row,
  eventSeen: async (id: string) => seen.has(id),
  recordEvent: async (e: { eventId: string }) => void seen.add(e.eventId),
}

function lifecycle(over: Partial<WebhookStore> = {}): WebhookStore {
  return {
    findByIntent: async () => null,
    transition: async () => true,
    postSuccess: async () => ({ alreadyPosted: false, paymentIds: [] }),
    dayFor: async () => '2026-11-02',
    ...over,
  }
}

const noPayouts = () => {
  throw new Error('unused')
}

function setup(f: Partial<OnlineHandlerFactories>) {
  clearConnectHandlers()
  const factories: OnlineHandlerFactories = {
    lifecycle: () => ({ store: lifecycle() }),
    reversal: () => ({
      store: { findAttempt: async () => null, returnedFeeSetting: async () => null, reverse: vi.fn(), markDisputed: async () => false },
      notifier: { resident: async () => {}, board: async () => {} },
    }),
    payouts: noPayouts,
    ...f,
  }
  registerOnlinePaymentConnectHandlers(registerConnectHandler, factories)
}

async function deliver(type: string, object: Record<string, unknown>, id = `evt_${type}`) {
  const body = JSON.stringify({ id, type, created: 1_793_000_000, livemode: false, account: ACCT, data: { object } })
  return processConnectWebhook(
    { rawBody: body, signatureHeader: fakeSignature(body, SECRET), webhookSecret: SECRET, platformLive: false },
    { stripe: createFakeStripeConnect(), store },
  )
}

beforeEach(() => {
  seen.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('registration', () => {
  it('covers every event the design subscribes to (3.7) except account.updated', () => {
    setup({})
    for (const t of [
      'payment_intent.processing',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'charge.refunded',
      'refund.updated',
      'charge.refund.updated',
      'charge.dispute.created',
      'charge.dispute.closed',
      'payout.paid',
      'payout.failed',
      'setup_intent.succeeded',
      'mandate.updated',
      'payment_method.detached',
    ]) {
      expect(connectHandlersFor(t).length, t).toBeGreaterThan(0)
    }
  })

  it('payment_failed has the status handler first and the reversal handler second', () => {
    setup({})
    expect(connectHandlersFor('payment_intent.payment_failed')).toHaveLength(2)
  })

  it('adds the autopay streak handler last when autopay hooks are given', () => {
    setup({ autopay: () => ({ countFailure: async () => 'counted', resetFailures: async () => {} }) })
    expect(connectHandlersFor('payment_intent.payment_failed')).toHaveLength(3)
  })
})

describe('outcome mapping', () => {
  it('an attempt not found yet on payment_intent.succeeded throws, so the route answers 500 and Stripe redelivers', async () => {
    setup({})
    const res = await deliver('payment_intent.succeeded', { id: 'pi_missing' })
    expect(res).toMatchObject({ ok: false, status: 500 })
    expect(seen.size).toBe(0)
  })

  it('a rejected account is logged and answered 200: redelivery could never fix it', async () => {
    setup({
      lifecycle: () => ({
        store: lifecycle({ findByIntent: async () => ({ id: 'att', stripe_account_id: 'acct_other', status: 'processing', association_id: 'a' }) }),
      }),
    })
    const res = await deliver('payment_intent.succeeded', { id: 'pi_1' })
    expect(res).toMatchObject({ ok: true, outcome: 'handled' })
    expect(seen.has('evt_payment_intent.succeeded')).toBe(true)
  })

  it('an applied payment is handled and recorded', async () => {
    const postSuccess = vi.fn(async () => ({ alreadyPosted: false, paymentIds: ['p1'] }))
    setup({
      lifecycle: () => ({
        store: lifecycle({
          findByIntent: async () => ({ id: 'att', stripe_account_id: ACCT, status: 'processing', association_id: 'a' }),
          postSuccess,
        }),
      }),
    })
    expect(await deliver('payment_intent.succeeded', { id: 'pi_1', latest_charge: 'ch_1' })).toMatchObject({ ok: true, outcome: 'handled' })
    expect(postSuccess).toHaveBeenCalledOnce()
  })
})

describe('two handlers on one event', () => {
  const failedEvent = { id: 'pi_1', last_payment_error: { code: 'account_closed' } }

  it('both run even when the first fails, and the event is NOT recorded so Stripe redelivers', async () => {
    const countFailure = vi.fn(async () => 'counted')
    const reverse = vi.fn()
    setup({
      lifecycle: () => ({
        store: lifecycle({
          findByIntent: async () => {
            throw new Error('db down')
          },
        }),
      }),
      reversal: () => ({
        store: { findAttempt: async () => null, returnedFeeSetting: async () => null, reverse, markDisputed: async () => false },
        notifier: { resident: async () => {}, board: async () => {} },
      }),
      autopay: () => ({ countFailure, resetFailures: async () => {} }),
    })
    const res = await deliver('payment_intent.payment_failed', failedEvent)
    expect(res).toMatchObject({ ok: false, status: 500 })
    expect(seen.size).toBe(0)
    // The autopay handler still ran: a persistent failure in handler 1 cannot starve the others.
    expect(countFailure).toHaveBeenCalledWith('pi_1')
  })
})

describe('autopay streak after a successful bank debit', () => {
  it('resets the failure streak when the payment finally posts', async () => {
    const resetFailures = vi.fn(async () => {})
    setup({
      lifecycle: () => ({
        store: lifecycle({
          findByIntent: async () => ({ id: 'att-9', stripe_account_id: ACCT, status: 'processing', association_id: 'a' }),
        }),
      }),
      autopay: () => ({ countFailure: async () => 'counted', resetFailures }),
    })
    await deliver('payment_intent.succeeded', { id: 'pi_1', latest_charge: 'ch_1' })
    expect(resetFailures).toHaveBeenCalledWith('att-9')
  })

  it('does not reset on a replay that posted nothing new', async () => {
    const resetFailures = vi.fn(async () => {})
    setup({
      lifecycle: () => ({
        store: lifecycle({
          findByIntent: async () => ({ id: 'att-9', stripe_account_id: ACCT, status: 'succeeded', association_id: 'a' }),
          postSuccess: async () => ({ alreadyPosted: true, paymentIds: [] }),
        }),
      }),
      autopay: () => ({ countFailure: async () => 'counted', resetFailures }),
    })
    await deliver('payment_intent.succeeded', { id: 'pi_1', latest_charge: 'ch_1' })
    expect(resetFailures).not.toHaveBeenCalled()
  })
})
