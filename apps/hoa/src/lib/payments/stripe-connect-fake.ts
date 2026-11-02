/**
 * In-memory StripeConnect for tests. Never touches the network. Signatures:
 * `constructEvent` accepts only `fakeSignature(rawBody, secret)`, so a
 * bad-signature test is one wrong string.
 */
import type { ConnectAccountState, CreatePaymentIntentInput, StripeConnect, StripeEvent } from './stripe-connect'

export function fakeSignature(rawBody: string, secret: string): string {
  return `fake:${secret}:${rawBody.length}`
}

export interface FakeStripeConnect extends StripeConnect {
  accounts: Map<string, ConnectAccountState>
  paymentIntents: CreatePaymentIntentInput[]
  calls: string[]
}

export function createFakeStripeConnect(): FakeStripeConnect {
  const accounts = new Map<string, ConnectAccountState>()
  const paymentIntents: CreatePaymentIntentInput[] = []
  const calls: string[] = []
  const byKey = new Map<string, string>()
  let n = 0
  return {
    isFake: true,
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
      return { id: `pi_fake${n}`, clientSecret: `pi_fake${n}_secret`, status: 'requires_payment_method' }
    },
    async retrievePaymentIntent(_acct, id) {
      calls.push('retrievePaymentIntent')
      return { id, status: 'requires_payment_method', amountCents: 0, applicationFeeCents: 0, metadata: {} }
    },
    async createRefund(i) {
      calls.push('createRefund')
      n += 1
      return { id: `re_fake${n}`, status: 'succeeded', amountCents: i.amountCents ?? 0 }
    },
  }
}
