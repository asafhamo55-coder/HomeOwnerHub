import { beforeEach, describe, expect, it } from 'vitest'
import {
  accountMatches,
  clearConnectHandlers,
  isLiveKey,
  processConnectWebhook,
  registerConnectHandler,
  type ConnectWebhookStore,
} from './connect-webhook'
import { makeAccountUpdatedHandler } from './connect-account-events'
import { createFakeStripeConnect, fakeSignature } from './stripe-connect-fake'
import type { ConnectAccountRow } from './connect-account'

const SECRET = 'whsec_test'
const ACCT = 'acct_fake00000001'

const row: ConnectAccountRow = {
  id: 'r1',
  organizationId: 'org1',
  associationId: 'as1',
  stripeAccountId: ACCT,
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  requirementsDue: [],
  disabledReason: null,
  onlinePaymentsEnabled: false,
  achFeePayer: 'association',
  cardFeePayer: 'homeowner',
  cardFeeAcknowledgedAt: null,
  returnedPaymentFeeCents: null,
}

function memStore() {
  const seen = new Set<string>()
  const store: ConnectWebhookStore & { recorded: string[]; failRecord?: boolean } = {
    recorded: [],
    async findAccountByStripeId(id) {
      return id === ACCT ? row : null
    },
    async eventSeen(id) {
      return seen.has(id)
    },
    async recordEvent(e) {
      if (store.failRecord) throw new Error('boom')
      seen.add(e.eventId)
      store.recorded.push(e.eventId)
    },
  }
  return store
}

function body(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'evt_1',
    type: 'account.updated',
    created: 1_700_000_000,
    livemode: false,
    account: ACCT,
    data: { object: { id: ACCT } },
    ...over,
  })
}

async function send(raw: string, store: ConnectWebhookStore, sig?: string | null, live = false) {
  const stripe = createFakeStripeConnect()
  return processConnectWebhook(
    {
      rawBody: raw,
      signatureHeader: sig === undefined ? fakeSignature(raw, SECRET) : sig,
      webhookSecret: SECRET,
      platformLive: live,
    },
    { stripe, store },
  )
}

describe('processConnectWebhook', () => {
  beforeEach(() => clearConnectHandlers())

  it('rejects a missing and a bad signature with 400 and runs nothing', async () => {
    let ran = false
    registerConnectHandler('account.updated', async () => ((ran = true), 'x'))
    const store = memStore()
    expect((await send(body(), store, null)).status).toBe(400)
    const bad = await send(body(), store, 'nope')
    expect(bad).toMatchObject({ ok: false, status: 400, message: 'invalid_signature' })
    expect(ran).toBe(false)
  })

  it('fails closed when the secret is missing', async () => {
    const r = await processConnectWebhook(
      { rawBody: '{}', signatureHeader: 'x', webhookSecret: undefined, platformLive: false },
      { stripe: createFakeStripeConnect(), store: memStore() },
    )
    expect(r.status).toBe(500)
  })

  it('rejects an event for an account we do not know', async () => {
    let ran = false
    registerConnectHandler('account.updated', async () => ((ran = true), 'x'))
    const r = await send(body({ account: 'acct_other00000001' }), memStore())
    expect(r).toMatchObject({ ok: true, outcome: 'unknown_account' })
    expect(ran).toBe(false)
  })

  it('ignores a platform event with no connected account', async () => {
    const r = await send(body({ account: undefined }), memStore())
    expect(r.outcome).toBe('no_account')
  })

  it('refuses a test event on a live platform and the reverse', async () => {
    let ran = false
    registerConnectHandler('account.updated', async () => ((ran = true), 'x'))
    expect((await send(body({ livemode: false }), memStore(), undefined, true)).outcome).toBe('livemode_mismatch')
    const live = body({ livemode: true })
    expect((await send(live, memStore(), undefined, false)).outcome).toBe('livemode_mismatch')
    expect(ran).toBe(false)
  })

  it('treats a duplicate event as a no-op', async () => {
    let n = 0
    registerConnectHandler('account.updated', async () => (n++, 'done'))
    const store = memStore()
    expect((await send(body(), store)).outcome).toBe('handled')
    expect((await send(body(), store)).outcome).toBe('duplicate')
    expect(n).toBe(1)
    expect(store.recorded).toEqual(['evt_1'])
  })

  it('returns 500 and records nothing when a handler throws, so Stripe redelivers', async () => {
    registerConnectHandler('account.updated', async () => {
      throw new Error('db down')
    })
    const store = memStore()
    const r = await send(body(), store)
    expect(r).toMatchObject({ ok: false, status: 500 })
    expect(store.recorded).toEqual([])
  })

  it('returns 500 when the ledger write fails', async () => {
    registerConnectHandler('account.updated', async () => 'x')
    const store = memStore()
    store.failRecord = true
    expect((await send(body(), store)).status).toBe(500)
  })

  it('records an unhandled type as ignored; several handlers run in order', async () => {
    const store = memStore()
    expect((await send(body({ type: 'payout.paid' }), store)).outcome).toBe('ignored')
    const order: string[] = []
    registerConnectHandler('charge.refunded', async () => (order.push('a'), 'a'))
    registerConnectHandler('charge.refunded', async () => (order.push('b'), 'b'))
    await send(body({ id: 'evt_2', type: 'charge.refunded' }), store)
    expect(order).toEqual(['a', 'b'])
  })

  it('account.updated re-reads the account and writes what Stripe says now', async () => {
    const writes: Array<[string, boolean]> = []
    registerConnectHandler(
      'account.updated',
      makeAccountUpdatedHandler(async (id, s) => void writes.push([id, s.chargesEnabled])),
    )
    const stripe = createFakeStripeConnect()
    stripe.accounts.set(ACCT, {
      id: ACCT,
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      requirementsDue: [],
      disabledReason: null,
    })
    const raw = body()
    const r = await processConnectWebhook(
      { rawBody: raw, signatureHeader: fakeSignature(raw, SECRET), webhookSecret: SECRET, platformLive: false },
      { stripe, store: memStore() },
    )
    expect(r.outcome).toBe('handled')
    expect(writes).toEqual([[ACCT, true]])
  })
})

describe('helpers', () => {
  it('accountMatches compares the attempt account to the event account', () => {
    const ctx = { account: row } as never
    expect(accountMatches(ctx, ACCT)).toBe(true)
    expect(accountMatches(ctx, 'acct_other00000001')).toBe(false)
    expect(accountMatches(ctx, null)).toBe(false)
  })
  it('isLiveKey', () => {
    expect(isLiveKey('sk_live_abc')).toBe(true)
    expect(isLiveKey('sk_test_abc')).toBe(false)
    expect(isLiveKey(undefined)).toBe(false)
  })
})
