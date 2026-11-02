/**
 * BL-035 PR 4/5: create an online payment attempt (design doc 3.3).
 *
 * Pure orchestration over two ports (a store and Stripe), so it is unit
 * tested with fakes and never touches live Stripe or the database. The
 * 'use server' wrapper (actions.ts) supplies the real store and port.
 *
 * Order of work: authorize, find the money owed, allocate it (Georgia order
 * from 2027-01-01, via allocatePayment), price the fee (fees.ts), FREEZE the
 * allocation in an `online_payments` row, then create the PaymentIntent on the
 * association's connected account with the idempotency key. A double tap
 * returns the same row; a retry after a Stripe failure reuses the row.
 *
 * All money is integer cents.
 */

import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { allocatePayment, allocationMode, type AllocationMode, type OpenCharge } from '@/lib/collections/ga-payment-order'
import { payOptionsFor, type PayOption } from './pay-amount'
import { computeOnlinePaymentFees, type FeePayer, type FeePolicy } from './fees'
import { statementDescriptorSuffix, type OnlinePaymentsStripePort, type PayMethodKind } from './stripe-port'

export interface PayContext {
  organizationId: string
  associationId: string
  associationName: string | null
  /** Governing-law state, two letters, or null. */
  state: string | null
  /** The association's today, yyyy-mm-dd. */
  today: string
  /** The org is in outbound sandbox mode: no real money for these. */
  sandbox: boolean
  /** The home's open charges, remaining cents each. */
  charges: OpenCharge[]
  account: {
    stripeAccountId: string
    chargesEnabled: boolean
    payoutsEnabled: boolean
    onlinePaymentsEnabled: boolean
    achFeePayer: FeePayer
    cardFeePayer: FeePayer
    cardFeeAcknowledged: boolean
  } | null
}

export interface AttemptRow {
  id: string
  user_id: string | null
  unit_id: string
  association_id: string
  method_type: PayMethodKind
  status: string
  dues_cents: number
  fee_cents: number
  fee_payer: FeePayer
  total_cents: number
  application_fee_cents: number
  stripe_account_id: string
  stripe_payment_intent_id: string | null
}

export type NewAttempt = Omit<AttemptRow, 'id' | 'status' | 'stripe_payment_intent_id'> & {
  organization_id: string
  source: 'resident'
  idempotency_key: string
  allocation: Array<{ assessment_id: string; cents: number }>
  allocation_mode: AllocationMode
}

export interface AttemptStore {
  loadContext(unitId: string): Promise<PayContext | null>
  findByKey(associationId: string, idempotencyKey: string): Promise<AttemptRow | null>
  /** Inserts; on a unique-key race returns the row that won. */
  insert(row: NewAttempt): Promise<AttemptRow>
  setIntent(attemptId: string, intentId: string): Promise<void>
}

export interface CreateAttemptInput {
  userId: string
  /** Units the signed-in resident owns (the existing resident guard's answer). */
  residentUnitIds: readonly string[]
  /** An admin impersonating an owner must never move money. */
  impersonating: boolean
  unitId: string
  method: PayMethodKind
  /** Whole cents; omitted means everything currently payable. */
  amountCents?: number
  /** Limit the payment to these charges (assessment ids). */
  chargeIds?: readonly string[]
  idempotencyKey: string
}

export type CreateAttemptCode =
  | 'not_available'
  | 'forbidden'
  | 'nothing_due'
  | 'too_much'
  | 'bad_input'
  | 'already_started'
  | 'key_reused'
  | 'stripe_failed'

export type CreateAttemptResult =
  | {
      ok: true
      attemptId: string
      clientSecret: string
      stripeAccountId: string
      method: PayMethodKind
      duesCents: number
      feeCents: number
      /** Who bears feeCents. */
      feePayer: FeePayer
      totalCents: number
    }
  | { ok: false; code: CreateAttemptCode; error: string }

const fail = (code: CreateAttemptCode, error: string): CreateAttemptResult => ({ ok: false, code, error })

const NOT_AVAILABLE = 'Online payments are not turned on for your community yet.'
const KEY_RE = /^[A-Za-z0-9_-]{16,100}$/

/** The fee method for the price: a card is priced as a credit card (the debit exemption needs the card type, which Stripe only knows after entry). */
const feeMethod = (m: PayMethodKind) => (m === 'ach' ? 'ach' : 'credit_card')

export async function createOnlinePaymentAttempt(
  deps: { store: AttemptStore; stripe: OnlinePaymentsStripePort },
  input: CreateAttemptInput,
): Promise<CreateAttemptResult> {
  if (!M8_APPLIED) return fail('not_available', NOT_AVAILABLE)
  if (input.impersonating) return fail('forbidden', 'You can not pay while viewing as an owner.')
  if (!KEY_RE.test(input.idempotencyKey)) return fail('bad_input', 'Something went wrong. Reload the page and try again.')
  if (input.method !== 'ach' && input.method !== 'card') return fail('bad_input', 'Choose bank account or card.')
  if (!input.residentUnitIds.includes(input.unitId)) return fail('forbidden', 'That home is not on your account.')
  if (
    input.amountCents !== undefined &&
    (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
  ) {
    return fail('bad_input', 'Enter an amount in dollars and cents, more than $0.')
  }

  const ctx = await deps.store.loadContext(input.unitId)
  if (!ctx || !ctx.account) return fail('not_available', NOT_AVAILABLE)
  const acct = ctx.account
  if (ctx.sandbox || !acct.onlinePaymentsEnabled || !acct.chargesEnabled || !acct.payoutsEnabled) {
    return fail('not_available', NOT_AVAILABLE)
  }

  // A double tap or a retry: the same key finds the same row.
  const existing = await deps.store.findByKey(ctx.associationId, input.idempotencyKey)
  if (existing) {
    if (existing.user_id !== input.userId || existing.unit_id !== input.unitId || existing.method_type !== input.method) {
      return fail('key_reused', 'Something went wrong. Reload the page and try again.')
    }
    return finish(deps, existing, ctx.associationName, input.idempotencyKey)
  }

  // Money owed. Only the named charges when the caller limits it.
  let charges = ctx.charges
  if (input.chargeIds && input.chargeIds.length > 0) {
    const wanted = new Set(input.chargeIds)
    charges = charges.filter((c) => wanted.has(c.id))
    if (charges.length !== wanted.size) return fail('bad_input', 'One of those charges is not open any more. Reload the page.')
  }
  const mode = allocationMode(ctx.state, ctx.today)
  const open = charges.filter((c) => c.remainingCents > 0)
  const sum = open.reduce((s, c) => s + c.remainingCents, 0)
  if (sum <= 0) return fail('nothing_due', 'Nothing is due right now.')
  // What can be paid at all: Georgia's order only takes charges already due.
  const payable = allocatePayment({ amountCents: sum, charges: open, mode, today: ctx.today }).appliedCents
  if (payable <= 0) return fail('nothing_due', 'Nothing is due right now.')
  const amount = input.amountCents ?? payable
  // No pay-ahead credit in this release (decision 7: advanced option, hidden by default).
  if (amount > payable) return fail('too_much', 'That is more than you owe right now.')

  const split = allocatePayment({ amountCents: amount, charges: open, mode, today: ctx.today })
  if (split.unappliedCents !== 0 || split.lines.length === 0) return fail('too_much', 'That is more than you owe right now.')

  const policy: FeePolicy = {
    achFeePayer: acct.achFeePayer,
    cardFeePayer: acct.cardFeePayer,
    cardFeeAcknowledged: acct.cardFeeAcknowledged,
    state: ctx.state,
  }
  const fees = computeOnlinePaymentFees(feeMethod(input.method), amount, policy)

  const row = await deps.store.insert({
    organization_id: ctx.organizationId,
    association_id: ctx.associationId,
    unit_id: input.unitId,
    user_id: input.userId,
    source: 'resident',
    method_type: input.method,
    dues_cents: amount,
    fee_cents: fees.feeCents,
    fee_payer: fees.feePayer,
    total_cents: fees.grossCents,
    application_fee_cents: fees.applicationFeeCents,
    stripe_account_id: acct.stripeAccountId,
    idempotency_key: input.idempotencyKey,
    // Frozen: what the resident sees is what posts.
    allocation: split.lines.map((l) => ({ assessment_id: l.chargeId, cents: l.appliedCents })),
    allocation_mode: mode,
  })
  // A race lost to another tap returns the winner's row: it must be ours.
  if (row.user_id !== input.userId || row.unit_id !== input.unitId) {
    return fail('key_reused', 'Something went wrong. Reload the page and try again.')
  }
  return finish(deps, row, ctx.associationName, input.idempotencyKey)
}

export interface PayNowPreview {
  unitId: string
  /** Everything payable right now, cents. */
  payableCents: number
  /** One entry per method the resident can choose, priced by the same engine the server uses. */
  methods: PayOption[]
  /** The fee rules, so the browser can price "pay a different amount" with the same pure engine. The server recomputes. */
  policy: FeePolicy
}

/** What the Pay screen shows before any attempt exists. Null when Pay now must stay hidden. */
export function previewPayNow(unitId: string, ctx: PayContext | null): PayNowPreview | null {
  if (!M8_APPLIED || !ctx || !ctx.account) return null
  const acct = ctx.account
  if (ctx.sandbox || !acct.onlinePaymentsEnabled || !acct.chargesEnabled || !acct.payoutsEnabled) return null
  const open = ctx.charges.filter((c) => c.remainingCents > 0)
  const sum = open.reduce((s, c) => s + c.remainingCents, 0)
  if (sum <= 0) return null
  const mode = allocationMode(ctx.state, ctx.today)
  const payable = allocatePayment({ amountCents: sum, charges: open, mode, today: ctx.today }).appliedCents
  if (payable <= 0) return null
  const policy: FeePolicy = {
    achFeePayer: acct.achFeePayer,
    cardFeePayer: acct.cardFeePayer,
    cardFeeAcknowledged: acct.cardFeeAcknowledged,
    state: ctx.state,
  }
  return { unitId, payableCents: payable, methods: payOptionsFor(payable, policy), policy }
}

async function finish(
  deps: { store: AttemptStore; stripe: OnlinePaymentsStripePort },
  row: AttemptRow,
  associationName: string | null,
  idempotencyKey: string,
): Promise<CreateAttemptResult> {
  if (row.status !== 'created' && row.status !== 'requires_action') {
    return fail('already_started', 'This payment was already started. Go back to your dues page to see it.')
  }
  try {
    const snap = row.stripe_payment_intent_id
      ? await deps.stripe.retrievePaymentIntent(row.stripe_account_id, row.stripe_payment_intent_id)
      : await deps.stripe.createPaymentIntent({
          accountId: row.stripe_account_id,
          amountCents: row.total_cents,
          applicationFeeCents: row.application_fee_cents,
          method: row.method_type,
          idempotencyKey,
          metadata: { online_payment_id: row.id, unit_id: row.unit_id },
          descriptorSuffix: statementDescriptorSuffix(associationName),
        })
    if (!snap.clientSecret) return fail('stripe_failed', 'We could not start your payment. Nothing was taken. Try again.')
    if (!row.stripe_payment_intent_id) await deps.store.setIntent(row.id, snap.id)
    return {
      ok: true,
      attemptId: row.id,
      clientSecret: snap.clientSecret,
      stripeAccountId: row.stripe_account_id,
      method: row.method_type,
      duesCents: row.dues_cents,
      feeCents: row.fee_cents,
      feePayer: row.fee_payer,
      totalCents: row.total_cents,
    }
  } catch (err) {
    // Code only: a Stripe error body can echo request fields.
    console.error('[online-payments] intent failed', { attempt: row.id, error: err instanceof Error ? err.name : 'unknown' })
    return fail('stripe_failed', 'We could not start your payment. Nothing was taken. Try again.')
  }
}
