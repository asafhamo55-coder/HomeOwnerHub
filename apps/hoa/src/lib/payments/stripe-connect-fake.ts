/**
 * In-memory StripeConnect for tests. Never touches the network. Signatures:
 * `constructEvent` accepts only `fakeSignature(rawBody, secret)`, so a
 * bad-signature test is one wrong string.
 */
import type {
  ChargeRefund,
  ConnectAccountState,
  CreatePaymentIntentInput,
  OffSessionChargeInput,
  OffSessionChargeResult,
  StripeConnect,
  StripeEvent,
} from './stripe-connect'
import type { PaymentMethodSummary } from '@/lib/online-payments/saved-methods'
import type { PayoutBalanceLine } from '@/lib/online-payments/payouts'

export function fakeSignature(rawBody: string, secret: string): string {
  return `fake:${secret}:${rawBody.length}`
}

export interface FakeStripeConnect extends StripeConnect {
  accounts: Map<string, ConnectAccountState>
  paymentIntents: CreatePaymentIntentInput[]
  calls: string[]
  /** chargeId -> refunds Stripe would list. */
  refundsByCharge: Map<string, ChargeRefund[]>
  payoutLines: Map<string, PayoutBalanceLine[]>
  paymentMethods: Map<string, PaymentMethodSummary>
  offSessionCharges: OffSessionChargeInput[]
  /** attempt id (metadata.online_payment_id) -> the intent Stripe holds for it. */
  intentsByAttempt: Map<string, OffSessionChargeResult>
  /** What the next off-session charge returns (default: succeeded). */
  nextOffSession: OffSessionChargeResult | Error | null
  /** Make listChargeRefunds fail, as an unreachable Stripe would. */
  failListRefunds: boolean
}

export function createFakeStripeConnect(): FakeStripeConnect {
  const accounts = new Map<string, ConnectAccountState>()
  const paymentIntents: CreatePaymentIntentInput[] = []
  const calls: string[] = []
  const byKey = new Map<string, string>()
  const offKeys = new Map<string, OffSessionChargeResult>()
  let n = 0
  const fake: FakeStripeConnect = {
    isFake: true,
    refundsByCharge: new Map(),
    payoutLines: new Map(),
    paymentMethods: new Map(),
    offSessionCharges: [],
    intentsByAttempt: new Map(),
    nextOffSession: null,
    failListRefunds: false,
    accounts,
    paymentIntents,
    calls,
    async createAccount(i) {
      calls.push('createAccount')
      const prior = byKey.get(i.idempotencyKey)
      if (prior) return accounts.get(prior)!
      n += 1
      const id = `acct_fake${String(n).padStart(8, '0')}`
      const s: ConnectAccountState = {
        id,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsDue: ['external_account'],
        disabledReason: 'requirements.past_due',
      }
      accounts.set(id, s)
      byKey.set(i.idempotencyKey, id)
      return s
    },
    async createAccountLink(i) {
      calls.push('createAccountLink')
      return { url: `https://connect.stripe.test/setup/${i.stripeAccount}` }
    },
    async retrieveAccount(id) {
      calls.push('retrieveAccount')
      const a = accounts.get(id)
      if (!a) throw new Error('no_such_account')
      return a
    },
    constructEvent(rawBody, sig, secret) {
      if (sig !== fakeSignature(rawBody, secret)) throw new Error('bad_signature')
      return JSON.parse(rawBody) as StripeEvent
    },
    async createPaymentIntent(i) {
      calls.push('createPaymentIntent')
      paymentIntents.push(i)
      n += 1
      return {
        id: `pi_fake${n}`,
        clientSecret: `pi_fake${n}_secret`,
        status: 'requires_payment_method',
        microdepositUrl: null,
        chargeId: null,
      }
    },
    async retrievePaymentIntent(_acct, id) {
      calls.push('retrievePaymentIntent')
      return {
        id,
        status: 'requires_payment_method',
        clientSecret: null,
        microdepositUrl: null,
        chargeId: null,
        amountCents: 0,
        applicationFeeCents: 0,
        metadata: {},
      }
    },
    async createRefund(i) {
      calls.push('createRefund')
      n += 1
      return { id: `re_fake${n}`, status: 'succeeded', amountCents: i.amountCents ?? 0 }
    },
    async listChargeRefunds(_acct, chargeId) {
      calls.push('listChargeRefunds')
      if (fake.failListRefunds) throw new Error('stripe_unreachable')
      return fake.refundsByCharge.get(chargeId) ?? []
    },
    async listPayoutBalanceLines(_acct, payoutId) {
      calls.push('listPayoutBalanceLines')
      return fake.payoutLines.get(payoutId) ?? []
    },
    async retrievePaymentMethod(_acct, pmId) {
      calls.push('retrievePaymentMethod')
      return fake.paymentMethods.get(pmId) ?? null
    },
    async findOffSessionCharge(_acct, attemptId) {
      calls.push('findOffSessionCharge')
      return fake.intentsByAttempt.get(attemptId) ?? null
    },
    async chargeOffSession(i) {
      calls.push('chargeOffSession')
      // Same key, same answer: Stripe's idempotency, so a retry never charges twice.
      const prior = offKeys.get(i.idempotencyKey)
      if (prior) return prior
      fake.offSessionCharges.push(i)
      const next = fake.nextOffSession
      if (next instanceof Error) throw next
      n += 1
      const result: OffSessionChargeResult = next ?? { status: 'succeeded', paymentIntentId: `pi_fake${n}`, failureCode: null }
      offKeys.set(i.idempotencyKey, result)
      fake.intentsByAttempt.set(i.metadata.online_payment_id ?? '', result)
      return result
    },
  }
  return fake
}
