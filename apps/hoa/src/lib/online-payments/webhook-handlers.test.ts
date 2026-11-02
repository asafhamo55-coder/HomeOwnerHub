import { describe, expect, it, vi } from 'vitest'
import {
  makeHandlers,
  registerOnlinePaymentHandlers,
  type ConnectEventHandler,
  type ConnectEventLike,
  type WebhookAttempt,
  type WebhookStore,
} from './webhook-handlers'

const ACCT = 'acct_12345678'

function setup(initial: Partial<WebhookAttempt> | null = {}) {
  const attempt: WebhookAttempt | null = initial
    ? { id: 'att-1', stripe_account_id: ACCT, status: 'requires_action', association_id: 'assoc', ...initial }
    : null
  let posted = false
  const store: WebhookStore = {
    findByIntent: vi.fn(async () => attempt),
    transition: vi.fn(async (_id, to, from) => {
      if (!attempt || !from.includes(attempt.status)) return false
      attempt.status = to
      return true
    }),
    postSuccess: vi.fn(async () => {
      const already = posted
      posted = true
      if (attempt) attempt.status = 'succeeded'
      return { alreadyPosted: already, paymentIds: already ? [] : ['pay-1'] }
    }),
    dayFor: vi.fn(async () => '2026-11-02'),
  }
  const afterPosted = vi.fn(async () => {})
  return { attempt, store, afterPosted, handlers: makeHandlers({ store, afterPosted }) }
}

const ev = (type: string, over: Partial<ConnectEventLike> = {}, obj: Record<string, unknown> = {}): ConnectEventLike => ({
  id: 'evt_1',
  type,
  account: ACCT,
  created: 1_793_000_000,
  data: { object: { id: 'pi_test1', latest_charge: 'ch_1', ...obj } },
  ...over,
})

describe('payment lifecycle handlers', () => {
  it('processing (ACH) moves the status and posts nothing', async () => {
    const s = setup()
    expect(await s.handlers['payment_intent.processing']!(ev('payment_intent.processing'))).toEqual({ outcome: 'applied' })
    expect(s.attempt!.status).toBe('processing')
    expect(s.store.postSuccess).not.toHaveBeenCalled()
  })

  it('succeeded posts once and a replay is a no-op', async () => {
    const s = setup({ status: 'processing' })
    expect(await s.handlers['payment_intent.succeeded']!(ev('payment_intent.succeeded'))).toEqual({ outcome: 'applied' })
    expect(await s.handlers['payment_intent.succeeded']!(ev('payment_intent.succeeded'))).toEqual({ outcome: 'noop' })
    expect(s.store.postSuccess).toHaveBeenCalledWith('att-1', '2026-11-02', 'ch_1')
    expect(s.afterPosted).toHaveBeenCalledTimes(1)
  })

  it('succeeded before processing posts, and a late processing does not downgrade it', async () => {
    const s = setup({ status: 'requires_action' })
    await s.handlers['payment_intent.succeeded']!(ev('payment_intent.succeeded'))
    expect(await s.handlers['payment_intent.processing']!(ev('payment_intent.processing'))).toEqual({ outcome: 'noop' })
    expect(s.attempt!.status).toBe('succeeded')
  })

  it('a late failed or canceled event cannot undo a succeeded payment', async () => {
    const s = setup({ status: 'succeeded' })
    expect(await s.handlers['payment_intent.payment_failed']!(ev('payment_intent.payment_failed'))).toEqual({ outcome: 'noop' })
    expect(await s.handlers['payment_intent.canceled']!(ev('payment_intent.canceled'))).toEqual({ outcome: 'noop' })
    expect(s.attempt!.status).toBe('succeeded')
  })

  it('payment_failed records the code and posts nothing', async () => {
    const s = setup({ status: 'processing' })
    await s.handlers['payment_intent.payment_failed']!(
      ev('payment_intent.payment_failed', {}, { last_payment_error: { code: 'insufficient_funds' } }),
    )
    expect(s.store.transition).toHaveBeenCalledWith('att-1', 'failed', expect.any(Array), 'insufficient_funds')
    expect(s.attempt!.status).toBe('failed')
    expect(s.store.postSuccess).not.toHaveBeenCalled()
  })

  it('rejects an event from another account and does not post', async () => {
    const s = setup()
    const r = await s.handlers['payment_intent.succeeded']!(ev('payment_intent.succeeded', { account: 'acct_other999' }))
    expect(r).toEqual({ outcome: 'rejected', reason: 'account_mismatch' })
    const none = await s.handlers['payment_intent.succeeded']!(ev('payment_intent.succeeded', { account: null }))
    expect(none.outcome).toBe('rejected')
    expect(s.store.postSuccess).not.toHaveBeenCalled()
  })

  it('succeeded for an attempt we cannot find asks Stripe to retry; other events ignore it', async () => {
    const s = setup(null)
    expect(await s.handlers['payment_intent.succeeded']!(ev('payment_intent.succeeded'))).toEqual({ outcome: 'retry', reason: 'attempt_not_found' })
    expect(await s.handlers['payment_intent.processing']!(ev('payment_intent.processing'))).toEqual({ outcome: 'noop' })
  })

  it('an event without a payment intent id is rejected', async () => {
    const s = setup()
    const r = await s.handlers['payment_intent.succeeded']!(ev('payment_intent.succeeded', {}, { id: 'ch_nope' }))
    expect(r.outcome).toBe('rejected')
  })

  it('a failing after-posted hook never fails the webhook', async () => {
    const s = setup({ status: 'processing' })
    s.afterPosted.mockRejectedValueOnce(new Error('mail down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await s.handlers['payment_intent.succeeded']!(ev('payment_intent.succeeded'))).toEqual({ outcome: 'applied' })
  })
})

describe('registration', () => {
  it('registers every lifecycle event on whatever registry the route provides', () => {
    const seen: string[] = []
    const reg = { register: (t: string, h: ConnectEventHandler) => void (typeof h === 'function' && seen.push(t)) }
    registerOnlinePaymentHandlers(reg, setup().handlers ? { store: setup().store } : { store: setup().store })
    expect(seen.sort()).toEqual([
      'payment_intent.canceled',
      'payment_intent.payment_failed',
      'payment_intent.processing',
      'payment_intent.requires_action',
      'payment_intent.succeeded',
    ])
  })
})
