/**
 * End to end, in memory, with the fake Stripe (BL-035): a Connect account
 * comes online, a resident pays by card, the webhook posts it, the board gives
 * all of it back with our application fee returned, and every replayed event
 * does nothing. Real code all the way through (create-attempt, the webhook
 * core, the registered handlers, the refund runner); only the database, the
 * mailer and Stripe are fakes. Nothing here can reach live Stripe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/db/m8', () => ({ M8_APPLIED: true }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))

import { clearConnectHandlers, processConnectWebhook, registerConnectHandler, type ConnectWebhookStore } from './connect-webhook'
import { registerOnlinePaymentConnectHandlers, type OnlineHandlerFactories } from './connect-online-handlers'
import { makeAccountUpdatedHandler } from './connect-account-events'
import { createFakeStripeConnect, fakeSignature, type FakeStripeConnect } from './stripe-connect-fake'
import type { ConnectAccountRow } from './connect-account'
import type { ConnectAccountState } from './stripe-connect'
import { createOnlinePaymentAttempt, type AttemptRow, type AttemptStore, type PayContext } from '@/lib/online-payments/create-attempt'
import { portFromConnect } from '@/lib/online-payments/stripe-port'
import { runBoardRefund } from '@/lib/online-payments/refund-core'
import type { AttemptView, ReversalDeps, ReversalNotifier, ReversalStore } from '@/lib/online-payments/reversals'
import type { WebhookStore } from '@/lib/online-payments/webhook-handlers'

const SECRET = 'whsec_e2e'
const UNIT = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const KEY = 'e2e-key-aaaaaaaaaaaaaaaa'
const CHARGE = 'ch_e2e1'

// ── in-memory world ────────────────────────────────────────────────────

interface World {
  fake: FakeStripeConnect
  attempt: (AttemptRow & { organization_id: string; posted: boolean; charge: string | null }) | null
  /** Cents of dues posted to the owner ledger, net of reversals. */
  ledgerCents: number
  postings: number
  adjustments: Map<string, number>
  accountWrites: ConnectAccountState[]
  seenEvents: Set<string>
  receipts: number
  notices: { resident: number; board: number }
  refundCalls: Array<{ amountCents: number; refundApplicationFee: boolean; idempotencyKey: string }>
}

function newWorld(): World {
  return {
    fake: createFakeStripeConnect(),
    attempt: null,
    ledgerCents: 0,
    postings: 0,
    adjustments: new Map(),
    accountWrites: [],
    seenEvents: new Set(),
    receipts: 0,
    notices: { resident: 0, board: 0 },
    refundCalls: [],
  }
}

let w: World

const accountRow = (acct: string): ConnectAccountRow => ({
  id: 'r1',
  organizationId: 'org1',
  associationId: 'assoc1',
  stripeAccountId: acct,
  detailsSubmitted: true,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsDue: [],
  disabledReason: null,
  onlinePaymentsEnabled: true,
  achFeePayer: 'association',
  cardFeePayer: 'homeowner',
  cardFeeAcknowledgedAt: '2026-11-01T00:00:00Z',
  returnedPaymentFeeCents: null,
})

function webhookStore(acct: string): ConnectWebhookStore {
  return {
    findAccountByStripeId: async (id) => (id === acct ? accountRow(acct) : null),
    eventSeen: async (id) => w.seenEvents.has(id),
    recordEvent: async (e) => void w.seenEvents.add(e.eventId),
  }
}

function lifecycleStore(): WebhookStore {
  return {
    async findByIntent(pi) {
      const a = w.attempt
      return a && a.stripe_payment_intent_id === pi
        ? { id: a.id, stripe_account_id: a.stripe_account_id, status: a.status, association_id: a.association_id }
        : null
    },
    async transition(_id, to, from) {
      if (!w.attempt || !from.includes(w.attempt.status)) return false
      w.attempt.status = to
      return true
    },
    async postSuccess(_id, _paidOn, chargeId) {
      const a = w.attempt!
      if (a.posted) return { alreadyPosted: true, paymentIds: [] }
      a.posted = true
      a.status = 'succeeded'
      a.charge = chargeId
      w.ledgerCents += a.dues_cents
      w.postings += 1
      return { alreadyPosted: false, paymentIds: ['pay_1'] }
    },
    dayFor: async () => '2026-11-02',
  }
}

function attemptView(): AttemptView {
  const a = w.attempt!
  const reversed = [...w.adjustments.values()].reduce((n, c) => n + c, 0)
  return {
    id: a.id,
    organizationId: a.organization_id,
    associationId: a.association_id,
    unitId: a.unit_id,
    payerUserId: a.user_id,
    methodType: a.method_type,
    status: a.status as AttemptView['status'],
    stripeAccountId: a.stripe_account_id,
    totalCents: a.total_cents,
    duesCents: a.dues_cents,
    feeCents: a.fee_cents,
    feePayer: a.fee_payer,
    postedAt: a.posted ? '2026-11-02T12:00:00Z' : null,
    postedCents: a.posted ? a.dues_cents : 0,
    reversedCents: reversed,
  }
}

function reversalStore(): ReversalStore {
  return {
    async findAttempt(key) {
      const a = w.attempt
      if (!a) return null
      return key.paymentIntentId === a.stripe_payment_intent_id || key.chargeId === a.charge ? attemptView() : null
    },
    returnedFeeSetting: async () => null,
    async reverse(args) {
      if (w.adjustments.has(args.ref)) return { alreadyApplied: true, status: w.attempt!.status, reversedCents: 0, shortCents: 0, returnedFeeCents: 0 }
      const cents = args.cents ?? 0
      w.adjustments.set(args.ref, cents)
      w.ledgerCents -= cents
      const reversed = [...w.adjustments.values()].reduce((n, c) => n + c, 0)
      w.attempt!.status = reversed >= w.attempt!.dues_cents ? 'refunded' : 'partially_refunded'
      return { alreadyApplied: false, status: w.attempt!.status, reversedCents: cents, shortCents: 0, returnedFeeCents: 0 }
    },
    markDisputed: async () => false,
  }
}

function reversalDeps(): ReversalDeps {
  const notifier: ReversalNotifier = {
    resident: async () => void (w.notices.resident += 1),
    board: async () => void (w.notices.board += 1),
  }
  return { store: reversalStore(), notifier, listRefunds: (acct, charge) => w.fake.listChargeRefunds(acct, charge) }
}

function attemptStore(): AttemptStore {
  const ctx: PayContext = {
    organizationId: 'org1',
    associationId: 'assoc1',
    associationName: 'Maple Grove HOA',
    state: 'GA',
    today: '2026-11-02',
    sandbox: false,
    charges: [{ id: 'dues-nov', type: 'regular', dueDate: '2026-11-01', remainingCents: 25000 }],
    account: {
      stripeAccountId: [...w.fake.accounts.keys()][0]!,
      chargesEnabled: true,
      payoutsEnabled: true,
      onlinePaymentsEnabled: true,
      achFeePayer: 'association',
      cardFeePayer: 'homeowner',
      cardFeeAcknowledged: true,
    },
  }
  return {
    loadContext: async () => ctx,
    findByKey: async () => w.attempt,
    async insert(row) {
      w.attempt = {
        id: 'att-1',
        organization_id: row.organization_id,
        user_id: row.user_id,
        unit_id: row.unit_id,
        association_id: row.association_id,
        method_type: row.method_type,
        status: 'created',
        dues_cents: row.dues_cents,
        fee_cents: row.fee_cents,
        fee_payer: row.fee_payer,
        total_cents: row.total_cents,
        application_fee_cents: row.application_fee_cents,
        stripe_account_id: row.stripe_account_id,
        stripe_payment_intent_id: null,
        posted: false,
        charge: null,
      }
      return w.attempt
    },
    async setIntent(_id, pi) {
      w.attempt!.stripe_payment_intent_id = pi
      w.attempt!.status = 'requires_action'
    },
  }
}

function register() {
  clearConnectHandlers()
  registerConnectHandler(
    'account.updated',
    makeAccountUpdatedHandler(async (_id, state) => void w.accountWrites.push(state)),
  )
  const factories: OnlineHandlerFactories = {
    lifecycle: () => ({
      store: lifecycleStore(),
      afterPosted: async () => void (w.receipts += 1),
    }),
    reversal: reversalDeps,
    payouts: () => {
      throw new Error('no payouts in this scenario')
    },
  }
  registerOnlinePaymentConnectHandlers(registerConnectHandler, factories)
}

async function deliver(acct: string, event: Record<string, unknown>) {
  const body = JSON.stringify({ created: 1_793_000_000, livemode: false, account: acct, ...event })
  return processConnectWebhook(
    { rawBody: body, signatureHeader: fakeSignature(body, SECRET), webhookSecret: SECRET, platformLive: false },
    { stripe: w.fake, store: webhookStore(acct) },
  )
}

beforeEach(() => {
  w = newWorld()
  register()
})

// ── the story ──────────────────────────────────────────────────────────

describe('online dues, end to end with the fake Stripe', () => {
  async function connectAndPay() {
    // 1. Connect account: created, then Stripe says it can take payments.
    const created = await w.fake.createAccount({ associationId: 'assoc1', name: 'Maple Grove HOA', state: 'GA', idempotencyKey: 'acct-key-1' })
    const acct = created.id
    expect(created.chargesEnabled).toBe(false)
    w.fake.accounts.set(acct, { ...created, detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true, requirementsDue: [], disabledReason: null })
    const updated = await deliver(acct, { id: 'evt_acct', type: 'account.updated', data: { object: { id: acct } } })
    expect(updated).toMatchObject({ ok: true, outcome: 'handled' })
    expect(w.accountWrites.at(-1)).toMatchObject({ chargesEnabled: true, payoutsEnabled: true })

    // 2. The resident pays by card: the fee is computed on the server and the intent is a direct charge.
    const made = await createOnlinePaymentAttempt(
      { store: attemptStore(), stripe: portFromConnect(w.fake) },
      { userId: USER, residentUnitIds: [UNIT], impersonating: false, unitId: UNIT, method: 'card', idempotencyKey: KEY },
    )
    expect(made.ok).toBe(true)
    if (!made.ok) throw new Error('attempt failed')
    expect(made.duesCents).toBe(25000)
    expect(made.feePayer).toBe('homeowner')
    expect(made.totalCents).toBe(25000 + made.feeCents)
    const intent = w.fake.paymentIntents[0]!
    expect(intent.stripeAccount).toBe(acct)
    expect(intent.amountCents).toBe(made.totalCents)
    // Decision 3: at a 3% network cap a card leaves no margin, so our fee is 0 here (it is never negative).
    expect(intent.applicationFeeCents).toBe(w.attempt!.application_fee_cents)
    expect(intent.applicationFeeCents).toBeGreaterThanOrEqual(0)
    expect(intent.paymentMethodTypes).toEqual(['card'])
    return { acct, pi: w.attempt!.stripe_payment_intent_id!, made }
  }

  const succeeded = (pi: string, id = 'evt_ok') => ({
    id,
    type: 'payment_intent.succeeded',
    data: { object: { id: pi, latest_charge: CHARGE } },
  })

  it('posts a card payment once, refunds all of it with our fee returned, and ignores every replay', async () => {
    const { acct, pi, made } = await connectAndPay()

    // 3. Success posts the dues to the owner ledger and sends one receipt.
    expect(await deliver(acct, succeeded(pi))).toMatchObject({ ok: true, outcome: 'handled' })
    expect(w.attempt).toMatchObject({ status: 'succeeded', posted: true, charge: CHARGE })
    expect(w.ledgerCents).toBe(25000)
    expect(w.postings).toBe(1)
    expect(w.receipts).toBe(1)

    // 4. Stripe redelivers the very same event: the dedupe ledger answers, nothing runs.
    expect(await deliver(acct, succeeded(pi))).toMatchObject({ ok: true, outcome: 'duplicate' })
    // A second event for the same payment (new id, e.g. a manual resend) is a no-op on the business key.
    expect(await deliver(acct, succeeded(pi, 'evt_ok_again'))).toMatchObject({ ok: true, outcome: 'handled' })
    expect(w.postings).toBe(1)
    expect(w.ledgerCents).toBe(25000)
    expect(w.receipts).toBe(1)

    // 5. The board gives it all back. Our application fee goes back with a full refund,
    //    and so does the card fee the homeowner paid on top.
    const refund = await runBoardRefund(
      reversalDeps(),
      {
        async createRefund(i) {
          w.refundCalls.push({ amountCents: i.amountCents, refundApplicationFee: i.refundApplicationFee, idempotencyKey: i.idempotencyKey })
          const r = await w.fake.createRefund({
            stripeAccount: i.stripeAccountId,
            paymentIntentId: i.paymentIntentId,
            amountCents: i.amountCents,
            refundApplicationFee: i.refundApplicationFee,
            idempotencyKey: i.idempotencyKey,
          })
          w.fake.refundsByCharge.set(CHARGE, [{ id: r.id, amountCents: r.amountCents, status: 'succeeded' }])
          return { id: r.id }
        },
      },
      { attempt: attemptView(), paymentIntentId: pi, cents: null, userId: USER },
    )
    expect(refund).toMatchObject({ ok: true, refundedCents: 25000, full: true })
    expect(w.refundCalls).toEqual([
      { amountCents: made.totalCents, refundApplicationFee: true, idempotencyKey: expect.stringContaining('refund:att-1') },
    ])
    expect(w.attempt!.status).toBe('refunded')
    expect(w.ledgerCents).toBe(0)
    expect(w.notices).toEqual({ resident: 1, board: 1 })

    // 6. Stripe's charge.refunded echo carries NO refunds list (Stripe omits it); the handler
    //    reads them from Stripe, finds the refund the board already recorded, and does nothing.
    const echo = { id: 'evt_refund', type: 'charge.refunded', data: { object: { id: CHARGE, payment_intent: pi, amount_refunded: made.totalCents } } }
    expect(await deliver(acct, echo)).toMatchObject({ ok: true, outcome: 'handled' })
    expect(w.fake.calls).toContain('listChargeRefunds')
    expect(w.ledgerCents).toBe(0)
    expect(w.adjustments.size).toBe(1)
    expect(w.notices).toEqual({ resident: 1, board: 1 })

    // 7. And the replay of that echo is a duplicate too.
    expect(await deliver(acct, echo)).toMatchObject({ ok: true, outcome: 'duplicate' })
    expect(w.fake.calls.filter((c) => c === 'listChargeRefunds')).toHaveLength(1)
  })

  it('a refund made on the Stripe dashboard reaches the books through the listed refunds', async () => {
    const { acct, pi, made } = await connectAndPay()
    await deliver(acct, succeeded(pi))
    w.fake.refundsByCharge.set(CHARGE, [{ id: 're_dash1', amountCents: made.totalCents, status: 'succeeded' }])
    const echo = { id: 'evt_dash', type: 'charge.refunded', data: { object: { id: CHARGE, payment_intent: pi, amount_refunded: made.totalCents } } }
    expect(await deliver(acct, echo)).toMatchObject({ ok: true, outcome: 'handled' })
    expect(w.ledgerCents).toBe(0)
    expect(w.attempt!.status).toBe('refunded')
  })

  it('Stripe being unreachable on charge.refunded answers 500 and records nothing, so Stripe redelivers', async () => {
    const { acct, pi, made } = await connectAndPay()
    await deliver(acct, succeeded(pi))
    w.fake.failListRefunds = true
    const echo = { id: 'evt_down', type: 'charge.refunded', data: { object: { id: CHARGE, payment_intent: pi, amount_refunded: made.totalCents } } }
    const res = await deliver(acct, echo)
    expect(res).toMatchObject({ ok: false, status: 500 })
    expect(w.seenEvents.has('evt_down')).toBe(false)
    expect(w.ledgerCents).toBe(25000)

    // Redelivery after Stripe is back finishes the job.
    w.fake.failListRefunds = false
    w.fake.refundsByCharge.set(CHARGE, [{ id: 're_late', amountCents: made.totalCents, status: 'succeeded' }])
    expect(await deliver(acct, echo)).toMatchObject({ ok: true, outcome: 'handled' })
    expect(w.ledgerCents).toBe(0)
  })

  it('an event for a different connected account never touches this payment', async () => {
    const { acct, pi } = await connectAndPay()
    const other = 'acct_fake99999999'
    const store = webhookStore(acct)
    const body = JSON.stringify({ id: 'evt_x', type: 'payment_intent.succeeded', created: 1, livemode: false, account: other, data: { object: { id: pi, latest_charge: CHARGE } } })
    const res = await processConnectWebhook(
      { rawBody: body, signatureHeader: fakeSignature(body, SECRET), webhookSecret: SECRET, platformLive: false },
      { stripe: w.fake, store: { ...store, findAccountByStripeId: async () => accountRow(other) } },
    )
    // Recorded as handled (a permanent mismatch must not make Stripe retry), but nothing posted.
    expect(res).toMatchObject({ ok: true })
    expect(w.postings).toBe(0)
    expect(w.ledgerCents).toBe(0)
  })
})
