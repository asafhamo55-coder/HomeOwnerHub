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
  customerId?: string
  paymentMethodId?: string
  idempotencyKey: string
}

export interface CreateRefundInput {
  stripeAccount: string
  paymentIntentId: string
  /** Omit for a full refund. */
  amountCents?: number
  refundApplicationFee: boolean
  idempotencyKey: string
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
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<{
    id: string
    clientSecret: string | null
    status: string
  }>
  retrievePaymentIntent(
    stripeAccount: string,
    paymentIntentId: string,
  ): Promise<{
    id: string
    status: string
    amountCents: number
    applicationFeeCents: number
    metadata: Record<string, string>
  }>
  createRefund(input: CreateRefundInput): Promise<{ id: string; status: string; amountCents: number }>
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
          application_fee_amount: i.applicationFeeCents,
          payment_method_types: i.paymentMethodTypes,
          metadata: i.metadata,
          statement_descriptor_suffix: i.statementDescriptorSuffix,
          customer: i.customerId,
          payment_method: i.paymentMethodId,
        },
        { stripeAccount: i.stripeAccount, idempotencyKey: i.idempotencyKey },
      )
      return { id: pi.id, clientSecret: pi.client_secret, status: pi.status }
    },
    async retrievePaymentIntent(acct, id) {
      const pi = await stripe.paymentIntents.retrieve(id, {}, { stripeAccount: acct })
      return {
        id: pi.id,
        status: pi.status,
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
  }
}
