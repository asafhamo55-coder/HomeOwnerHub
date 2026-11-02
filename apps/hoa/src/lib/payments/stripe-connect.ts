/**
 * The thin Stripe Connect interface for online dues payments (BL-035).
 *
 * Every payments module (onboarding, create-attempt, ACH, refunds, payouts)
 * talks to Stripe ONLY through `StripeConnect`, so tests inject
 * `createFakeStripeConnect()` (./stripe-connect-fake.ts) and nothing in the
 * test suite or in M8-dark code can reach live Stripe.
 *
 * Direct charges: every call about money or customers is made ON the
 * association's connected account, so those methods take `stripeAccount`
 * (sent as the `Stripe-Account` header). Platform-level calls (creating the
 * account, an account link, verifying a webhook) do not.
 *
 * Amounts are integer cents. Ids and counts only in logs.
 */
import type Stripe from 'stripe'
import { getStripe } from '@homeowner-portal/billing'
import type { PaymentMethodSummary } from '@/lib/online-payments/saved-methods'
import type { PayoutBalanceLine } from '@/lib/online-payments/payouts'
import { toSummary } from '@/lib/online-payments/saved-methods-stripe'

export type StripeEvent = Stripe.Event

/** What we mirror from an account (the fields account.updated carries). */
export interface ConnectAccountState {
  id: string
  detailsSubmitted: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  /** currently_due + past_due requirement codes only. */
  requirementsDue: string[]
  disabledReason: string | null
}

export interface CreateAccountInput {
  /** Association id; stored as metadata so a Stripe-side search can find it. */
  associationId: string
  /** Prefill only. */
  name: string
  state: string | null
  /** Makes a retry of the same click return the same account. */
  idempotencyKey: string
}

export interface CreatePaymentIntentInput {
  stripeAccount: string
  amountCents: number
  applicationFeeCents: number
  paymentMethodTypes: Array<'card' | 'us_bank_account'>
  /** ids only: { online_payment_id, unit_id } */
  metadata: Record<string, string>
  statementDescriptorSuffix?: string
  /** Bank debit: instant login through Financial Connections first, microdeposits as Stripe's fallback. */
  achInstantVerification?: boolean
  customerId?: string
  paymentMethodId?: string
  idempotencyKey: string
}

/** What every PaymentIntent call hands back; Stripe's own status string, untouched. */
export interface IntentView {
  id: string
  status: string
  clientSecret: string | null
  /** ACH by microdeposit: Stripe's hosted page where the resident types the two small amounts. */
  microdepositUrl: string | null
  /** Latest charge id, once there is one. */
  chargeId: string | null
}

export interface CreateRefundInput {
  stripeAccount: string
  paymentIntentId: string
  /** Omit for a full refund. */
  amountCents?: number
  refundApplicationFee: boolean
  idempotencyKey: string
}

/** One refund on a charge, as Stripe lists it. */
export interface ChargeRefund {
  id: string
  amountCents: number
  status: string | null
}

export interface OffSessionChargeInput {
  stripeAccount: string
  customerId: string
  paymentMethodId: string
  amountCents: number
  applicationFeeCents: number
  /** Stripe's Idempotency-Key: the same key never charges twice. */
  idempotencyKey: string
  /** ids only */
  metadata: Record<string, string>
}

export interface OffSessionChargeResult {
  status: 'succeeded' | 'processing' | 'requires_action' | 'failed'
  paymentIntentId: string | null
  /** Stripe's decline or error code when status is failed. */
  failureCode: string | null
}

export interface StripeConnect {
  /** True for the fake. */
  readonly isFake: boolean

  // Platform level
  /** POST /v1/accounts: Standard account, country US. */
  createAccount(input: CreateAccountInput): Promise<ConnectAccountState>
  /** POST /v1/account_links, type account_onboarding. Returns the hosted url. */
  createAccountLink(input: { stripeAccount: string; returnUrl: string; refreshUrl: string }): Promise<{ url: string }>
  /** GET /v1/accounts/:id */
  retrieveAccount(stripeAccount: string): Promise<ConnectAccountState>
  /**
   * Verifies the signature against the RAW body and returns the event.
   * Throws on a bad signature (the webhook route maps that to 400).
   */
  constructEvent(rawBody: string, signatureHeader: string, secret: string): StripeEvent

  // On the connected account (Stripe-Account header)
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<IntentView>
  retrievePaymentIntent(
    stripeAccount: string,
    paymentIntentId: string,
  ): Promise<
    IntentView & {
      amountCents: number
      applicationFeeCents: number
      metadata: Record<string, string>
    }
  >
  createRefund(input: CreateRefundInput): Promise<{ id: string; status: string; amountCents: number }>
  /**
   * Every refund on a charge. A charge.refunded event does NOT carry them:
   * Stripe's Charge object returns `refunds` only when expanded, so the
   * handler asks here. Throws when Stripe cannot be reached (the webhook then
   * answers 500 and Stripe redelivers).
   */
  listChargeRefunds(stripeAccount: string, chargeId: string): Promise<ChargeRefund[]>
  /** Balance transactions paid out in one payout (fees per charge), for reconciliation. */
  listPayoutBalanceLines(stripeAccount: string, payoutId: string): Promise<PayoutBalanceLine[]>
  /** A saved card or bank account, summarised (never a full number). Null when Stripe no longer has it. */
  retrievePaymentMethod(stripeAccount: string, paymentMethodId: string): Promise<PaymentMethodSummary | null>
  /**
   * Autopay: charge a saved method with the owner away. Declines come back as
   * `failed` with a code, not as a throw; anything else (network, our bug)
   * throws and the daily run counts it as a failed attempt.
   */
  chargeOffSession(input: OffSessionChargeInput): Promise<OffSessionChargeResult>
}

/** Env var holding the Connect endpoint's signing secret (OA-45). */
export const CONNECT_WEBHOOK_SECRET_ENV = 'STRIPE_CONNECT_WEBHOOK_SECRET'

/** Maps an Account object (also an `account.updated` payload) to the state we mirror. */
export function connectStateFromAccount(a: Stripe.Account): ConnectAccountState {
  const req = a.requirements
  return {
    id: a.id,
    detailsSubmitted: Boolean(a.details_submitted),
    chargesEnabled: Boolean(a.charges_enabled),
    payoutsEnabled: Boolean(a.payouts_enabled),
    requirementsDue: [...(req?.currently_due ?? []), ...(req?.past_due ?? [])],
    disabledReason: req?.disabled_reason ?? null,
  }
}

/** Maps a PaymentIntent to what callers read. */
export function intentViewFrom(pi: Stripe.PaymentIntent): IntentView {
  const charge = pi.latest_charge
  const next = pi.next_action
  return {
    id: pi.id,
    status: pi.status,
    clientSecret: pi.client_secret ?? null,
    microdepositUrl:
      next?.type === 'verify_with_microdeposits' ? (next.verify_with_microdeposits?.hosted_verification_url ?? null) : null,
    chargeId: typeof charge === 'string' ? charge : (charge?.id ?? null),
  }
}

/** The real implementation, or null when STRIPE_SECRET_KEY is not set. */
export function getStripeConnect(): StripeConnect | null {
  const stripe = getStripe()
  if (!stripe) return null
  return {
    isFake: false,
    async createAccount(i) {
      const a = await stripe.accounts.create(
        {
          type: 'standard',
          country: 'US',
          company: { name: i.name, address: i.state ? { state: i.state } : undefined },
          metadata: { association_id: i.associationId },
        },
        { idempotencyKey: i.idempotencyKey },
      )
      return connectStateFromAccount(a)
    },
    async createAccountLink(i) {
      const l = await stripe.accountLinks.create({
        account: i.stripeAccount,
        type: 'account_onboarding',
        return_url: i.returnUrl,
        refresh_url: i.refreshUrl,
      })
      return { url: l.url }
    },
    async retrieveAccount(id) {
      return connectStateFromAccount(await stripe.accounts.retrieve(id))
    },
    constructEvent(rawBody, sig, secret) {
      return stripe.webhooks.constructEvent(rawBody, sig, secret)
    },
    async createPaymentIntent(i) {
      const pi = await stripe.paymentIntents.create(
        {
          amount: i.amountCents,
          currency: 'usd',
          ...(i.applicationFeeCents > 0 ? { application_fee_amount: i.applicationFeeCents } : {}),
          payment_method_types: i.paymentMethodTypes,
          metadata: i.metadata,
          ...(i.statementDescriptorSuffix ? { statement_descriptor_suffix: i.statementDescriptorSuffix } : {}),
          customer: i.customerId,
          payment_method: i.paymentMethodId,
          ...(i.achInstantVerification
            ? {
                payment_method_options: {
                  us_bank_account: {
                    financial_connections: { permissions: ['payment_method' as const] },
                    verification_method: 'automatic' as const,
                  },
                },
              }
            : {}),
        },
        { stripeAccount: i.stripeAccount, idempotencyKey: i.idempotencyKey },
      )
      return intentViewFrom(pi)
    },
    async retrievePaymentIntent(acct, id) {
      const pi = await stripe.paymentIntents.retrieve(id, {}, { stripeAccount: acct })
      return {
        ...intentViewFrom(pi),
        amountCents: pi.amount,
        applicationFeeCents: pi.application_fee_amount ?? 0,
        metadata: (pi.metadata ?? {}) as Record<string, string>,
      }
    },
    async createRefund(i) {
      const r = await stripe.refunds.create(
        {
          payment_intent: i.paymentIntentId,
          amount: i.amountCents,
          refund_application_fee: i.refundApplicationFee,
        },
        { stripeAccount: i.stripeAccount, idempotencyKey: i.idempotencyKey },
      )
      return { id: r.id, status: r.status ?? 'pending', amountCents: r.amount }
    },
    async listChargeRefunds(acct, chargeId) {
      const rows = await stripe.refunds.list({ charge: chargeId, limit: 100 }, { stripeAccount: acct }).autoPagingToArray({ limit: 1000 })
      return rows.map((r) => ({ id: r.id, amountCents: r.amount, status: r.status ?? null }))
    },
    async listPayoutBalanceLines(acct, payoutId) {
      const rows = await stripe.balanceTransactions
        .list({ payout: payoutId, limit: 100 }, { stripeAccount: acct })
        .autoPagingToArray({ limit: 10_000 })
      return rows.map((t) => ({
        type: t.type,
        chargeId: typeof t.source === 'string' && t.source.startsWith('ch_') ? t.source : null,
        // Stripe's fee plus our application fee: both left this balance.
        feeCents: t.fee,
      }))
    },
    async retrievePaymentMethod(acct, pmId) {
      try {
        return toSummary(await stripe.paymentMethods.retrieve(pmId, { stripeAccount: acct }))
      } catch (err) {
        if ((err as { code?: string }).code === 'resource_missing') return null
        throw err
      }
    },
    async chargeOffSession(i) {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: i.amountCents,
            currency: 'usd',
            customer: i.customerId,
            payment_method: i.paymentMethodId,
            off_session: true,
            confirm: true,
            metadata: i.metadata,
            ...(i.applicationFeeCents > 0 ? { application_fee_amount: i.applicationFeeCents } : {}),
          },
          { stripeAccount: i.stripeAccount, idempotencyKey: i.idempotencyKey },
        )
        if (pi.status === 'succeeded' || pi.status === 'processing') {
          return { status: pi.status, paymentIntentId: pi.id, failureCode: null }
        }
        if (pi.status === 'requires_action') return { status: 'requires_action', paymentIntentId: pi.id, failureCode: null }
        return { status: 'failed', paymentIntentId: pi.id, failureCode: pi.last_payment_error?.code ?? pi.status }
      } catch (err) {
        const e = err as { type?: string; code?: string; payment_intent?: { id?: string } }
        // A declined card (or a bank that needs the owner) is an outcome, not a crash.
        if (e.type === 'StripeCardError') {
          const paymentIntentId = e.payment_intent?.id ?? null
          if (e.code === 'authentication_required') return { status: 'requires_action', paymentIntentId, failureCode: e.code }
          return { status: 'failed', paymentIntentId, failureCode: e.code ?? 'card_declined' }
        }
        throw err
      }
    },
  }
}
