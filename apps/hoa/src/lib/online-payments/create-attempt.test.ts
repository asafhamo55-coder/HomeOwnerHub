import { describe, expect, it, vi, beforeEach } from 'vitest'

const flag = vi.hoisted(() => ({ on: true }))
vi.mock('@homeowner-portal/db/m8', () => ({
  get M8_APPLIED() {
    return flag.on
  },
}))

import {
  createOnlinePaymentAttempt,
  previewPayNow,
  type AttemptRow,
  type AttemptStore,
  type NewAttempt,
  type PayContext,
} from './create-attempt'
import type { CreateIntentInput, OnlinePaymentsStripePort } from './stripe-port'
import { statementDescriptorSuffix } from './stripe-port'

const UNIT = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const KEY = 'key-aaaaaaaaaaaaaaaa'

function ctx(over: Partial<PayContext> = {}): PayContext {
  return {
    organizationId: 'org',
    associationId: 'assoc',
    associationName: 'Maple Grove HOA',
    state: 'GA',
    today: '2026-11-02',
    sandbox: false,
    charges: [
      { id: 'late', type: 'late_fee', dueDate: '2026-09-01', remainingCents: 2500 },
      { id: 'dues-old', type: 'regular', dueDate: '2026-10-01', remainingCents: 25000 },
      { id: 'dues-new', type: 'regular', dueDate: '2026-11-01', remainingCents: 25000 },
    ],
    account: {
      stripeAccountId: 'acct_12345678',
      chargesEnabled: true,
      payoutsEnabled: true,
      onlinePaymentsEnabled: true,
      achFeePayer: 'association',
      cardFeePayer: 'homeowner',
      cardFeeAcknowledged: true,
    },
    ...over,
  }
}

function fakes(context: PayContext | null = ctx()) {
  const rows = new Map<string, AttemptRow>()
  const inserted: NewAttempt[] = []
  const store: AttemptStore = {
    loadContext: vi.fn(async () => context),
    findByKey: vi.fn(async (_a, key) => rows.get(key) ?? null),
    insert: vi.fn(async (row) => {
      inserted.push(row)
      const r: AttemptRow = {
        id: `att-${inserted.length}`,
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
      }
      rows.set(row.idempotency_key, r)
      return r
    }),
    setIntent: vi.fn(async (id, pi) => {
      for (const r of rows.values()) if (r.id === id) r.stripe_payment_intent_id = pi
    }),
  }
  const created: CreateIntentInput[] = []
  const stripe: OnlinePaymentsStripePort = {
    createPaymentIntent: vi.fn(async (i) => {
      created.push(i)
      return { id: 'pi_test1', status: 'requires_payment_method', clientSecret: 'pi_test1_secret_x', microdepositUrl: null, chargeId: null }
    }),
    retrievePaymentIntent: vi.fn(async () => ({
      id: 'pi_test1',
      status: 'requires_payment_method',
      clientSecret: 'pi_test1_secret_x',
      microdepositUrl: null,
      chargeId: null,
    })),
  }
  return { store, stripe, inserted, created }
}

const input = (over: Record<string, unknown> = {}) => ({
  userId: USER,
  residentUnitIds: [UNIT],
  impersonating: false,
  unitId: UNIT,
  method: 'card' as const,
  idempotencyKey: KEY,
  ...over,
})

beforeEach(() => {
  flag.on = true
})

describe('createOnlinePaymentAttempt', () => {
  it('is dark while M8_APPLIED is false', async () => {
    flag.on = false
    const f = fakes()
    const r = await createOnlinePaymentAttempt(f, input())
    expect(r).toMatchObject({ ok: false, code: 'not_available' })
    expect(f.store.loadContext).not.toHaveBeenCalled()
    expect(f.stripe.createPaymentIntent).not.toHaveBeenCalled()
  })

  it('refuses a home the resident does not own, and impersonation', async () => {
    const f = fakes()
    expect(await createOnlinePaymentAttempt(f, input({ residentUnitIds: ['other'] }))).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await createOnlinePaymentAttempt(f, input({ impersonating: true }))).toMatchObject({ ok: false, code: 'forbidden' })
    expect(f.stripe.createPaymentIntent).not.toHaveBeenCalled()
  })

  it('refuses a sandbox org and an association that is not ready', async () => {
    for (const c of [
      ctx({ sandbox: true }),
      ctx({ account: null }),
      ctx({ account: { ...ctx().account!, chargesEnabled: false } }),
      ctx({ account: { ...ctx().account!, onlinePaymentsEnabled: false } }),
    ]) {
      const f = fakes(c)
      expect(await createOnlinePaymentAttempt(f, input())).toMatchObject({ ok: false, code: 'not_available' })
      expect(f.stripe.createPaymentIntent).not.toHaveBeenCalled()
    }
  })

  it('pays everything due by default, oldest first before 2027', async () => {
    const f = fakes()
    const r = await createOnlinePaymentAttempt(f, input({ method: 'ach' }))
    expect(r.ok).toBe(true)
    expect(f.inserted[0]!.allocation_mode).toBe('oldest_first')
    expect(f.inserted[0]!.dues_cents).toBe(52500)
    expect(f.inserted[0]!.allocation.map((a) => a.assessment_id)).toEqual(['late', 'dues-old', 'dues-new'])
  })

  it('applies the Georgia order from 2027-01-01: regular dues before the late fee, future charges untouched', async () => {
    const georgia = ctx({
      today: '2027-02-01',
      charges: [
        { id: 'late', type: 'late_fee', dueDate: '2026-12-01', remainingCents: 2500 },
        { id: 'dues', type: 'regular', dueDate: '2027-01-01', remainingCents: 25000 },
        { id: 'future', type: 'regular', dueDate: '2027-03-01', remainingCents: 25000 },
      ],
    })
    const f = fakes(georgia)
    expect((await createOnlinePaymentAttempt(f, input({ method: 'ach', amountCents: 20000 }))).ok).toBe(true)
    expect(f.inserted[0]!.allocation_mode).toBe('ga_statutory')
    expect(f.inserted[0]!.allocation).toEqual([{ assessment_id: 'dues', cents: 20000 }])
    // paying everything never reaches the not-yet-due charge
    const g = fakes(georgia)
    await createOnlinePaymentAttempt(g, input({ method: 'ach' }))
    expect(g.inserted[0]!.dues_cents).toBe(27500)
    expect(g.inserted[0]!.allocation.map((a) => a.assessment_id)).toEqual(['dues', 'late'])
  })

  it('a non-Georgia association pays oldest first even after 2027', async () => {
    const f = fakes(ctx({ state: 'FL', today: '2027-02-01' }))
    await createOnlinePaymentAttempt(f, input({ method: 'ach', amountCents: 100 }))
    expect(f.inserted[0]!.allocation_mode).toBe('oldest_first')
    expect(f.inserted[0]!.allocation[0]!.assessment_id).toBe('late')
  })

  it('accepts a partial amount and refuses more than is due', async () => {
    const f = fakes()
    expect((await createOnlinePaymentAttempt(f, input({ amountCents: 10000 }))).ok).toBe(true)
    expect(f.inserted[0]!.dues_cents).toBe(10000)
    const g = fakes()
    expect(await createOnlinePaymentAttempt(g, input({ amountCents: 52501 }))).toMatchObject({ ok: false, code: 'too_much' })
    expect(await createOnlinePaymentAttempt(g, input({ amountCents: 0 }))).toMatchObject({ ok: false, code: 'bad_input' })
    expect(await createOnlinePaymentAttempt(g, input({ amountCents: 10.5 }))).toMatchObject({ ok: false, code: 'bad_input' })
    expect(g.stripe.createPaymentIntent).not.toHaveBeenCalled()
  })

  it('prices the card fee on the server, clamped to 3%, and sends it to Stripe on the connected account', async () => {
    const f = fakes(ctx({ charges: [{ id: 'a', type: 'regular', dueDate: '2026-10-01', remainingCents: 25000 }] }))
    const r = await createOnlinePaymentAttempt(f, input())
    expect(r).toMatchObject({ ok: true, feeCents: 750, feePayer: 'homeowner', totalCents: 25750, stripeAccountId: 'acct_12345678' })
    expect(f.created[0]).toMatchObject({
      accountId: 'acct_12345678',
      amountCents: 25750,
      applicationFeeCents: 0,
      idempotencyKey: KEY,
      descriptorSuffix: 'MAPLE GROVE HOA',
      metadata: { online_payment_id: 'att-1', unit_id: UNIT },
    })
  })

  it('bank payment: association pays the fee, so the charge equals the dues', async () => {
    const f = fakes(ctx({ charges: [{ id: 'a', type: 'regular', dueDate: '2026-10-01', remainingCents: 25000 }] }))
    const r = await createOnlinePaymentAttempt(f, input({ method: 'ach' }))
    expect(r).toMatchObject({ ok: true, feePayer: 'association', totalCents: 25000 })
  })

  it('a double tap returns the same row and one Stripe intent', async () => {
    const f = fakes()
    const a = await createOnlinePaymentAttempt(f, input())
    const b = await createOnlinePaymentAttempt(f, input())
    expect(a.ok && b.ok && a.attemptId === b.attemptId).toBe(true)
    expect(f.inserted).toHaveLength(1)
    expect(f.stripe.createPaymentIntent).toHaveBeenCalledTimes(1)
    expect(f.stripe.retrievePaymentIntent).toHaveBeenCalledTimes(1)
  })

  it('reusing a key for another person or method is refused', async () => {
    const f = fakes()
    await createOnlinePaymentAttempt(f, input())
    expect(await createOnlinePaymentAttempt(f, input({ userId: 'someone-else' }))).toMatchObject({ ok: false, code: 'key_reused' })
    expect(await createOnlinePaymentAttempt(f, input({ method: 'ach' }))).toMatchObject({ ok: false, code: 'key_reused' })
  })

  it('a Stripe failure leaves the row, and the retry reuses it with the same key', async () => {
    const f = fakes()
    vi.mocked(f.stripe.createPaymentIntent).mockRejectedValueOnce(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await createOnlinePaymentAttempt(f, input())).toMatchObject({ ok: false, code: 'stripe_failed' })
    const again = await createOnlinePaymentAttempt(f, input())
    expect(again.ok).toBe(true)
    expect(f.inserted).toHaveLength(1)
  })

  it('an attempt that already moved on is not restarted', async () => {
    const f = fakes()
    await createOnlinePaymentAttempt(f, input())
    const row = (await f.store.findByKey('assoc', KEY))!
    row.status = 'processing'
    expect(await createOnlinePaymentAttempt(f, input())).toMatchObject({ ok: false, code: 'already_started' })
  })

  it('refuses charges that are not on this home', async () => {
    const f = fakes()
    expect(await createOnlinePaymentAttempt(f, input({ chargeIds: ['nope'] }))).toMatchObject({ ok: false, code: 'bad_input' })
  })
})

describe('previewPayNow', () => {
  it('shows both methods priced by the same engine, and hides when not ready', () => {
    const p = previewPayNow(UNIT, ctx({ charges: [{ id: 'a', type: 'regular', dueDate: '2026-10-01', remainingCents: 25000 }] }))
    expect(p?.methods.find((m) => m.method === 'card')).toMatchObject({ feeCents: 750, totalCents: 25750 })
    expect(p?.methods.find((m) => m.method === 'ach')).toMatchObject({ feePayer: 'association', totalCents: 25000 })
    expect(previewPayNow(UNIT, ctx({ sandbox: true }))).toBeNull()
    expect(previewPayNow(UNIT, null)).toBeNull()
    flag.on = false
    expect(previewPayNow(UNIT, ctx())).toBeNull()
  })
})

describe('statementDescriptorSuffix', () => {
  it('keeps letters, digits and spaces, at most 22 characters', () => {
    expect(statementDescriptorSuffix("O'Neil <Estates> * HOA, Inc. of Greater Atlanta")).toBe('ONEIL ESTATES HOA INC')
    expect(statementDescriptorSuffix('12345')).toBeNull()
    expect(statementDescriptorSuffix(null)).toBeNull()
  })
})
