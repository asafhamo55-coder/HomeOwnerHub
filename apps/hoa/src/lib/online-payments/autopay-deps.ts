import { createAdminClient } from '@homeowner-portal/db'
import type { AutopayChargePort, AutopayDeps, AutopayEnrollment, AutopayFeeQuote } from '@homeowner-portal/jobs'
import { sendEmail, appUrl } from '@/lib/email'
import { allocationMode } from '@/lib/collections/ga-payment-order'
import { getStripeConnect, type StripeConnect } from '@/lib/payments/stripe-connect'
import { DEFAULT_FEE_POLICY, computeOnlinePaymentFees, type FeePolicy } from './fees'

/**
 * BL-036 autopay wiring. Fee quote reuses the one fee engine. The charge is
 * an off-session PaymentIntent on the association's connected account (direct
 * charge) through the shared StripeConnect interface. The run's idempotency
 * key (`autopay:<enrollment>:<day>`) goes to Stripe as the Idempotency-Key, so
 * a retried run can never charge twice. `charger` is null when Stripe is not
 * configured: the daily run then sends notices but takes no money.
 * Card funding is unknown for a saved card, so it is priced as a credit card
 * (the higher fee), which the owner's maximum is checked against.
 */
export async function autopayQuote(e: AutopayEnrollment, duesCents: number): Promise<AutopayFeeQuote> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const [{ data: acct }, { data: assoc }] = await Promise.all([
    db
      .from('association_stripe_accounts')
      .select('ach_fee_payer, card_fee_payer, card_fee_acknowledged_at')
      .eq('association_id', e.associationId)
      .maybeSingle(),
    db.from('associations').select('state, governing_law_state').eq('id', e.associationId).maybeSingle(),
  ])
  const state = ((assoc?.governing_law_state ?? assoc?.state ?? '') as string).trim().toUpperCase() || null
  const policy: FeePolicy = acct
    ? {
        achFeePayer: acct.ach_fee_payer,
        cardFeePayer: acct.card_fee_payer,
        cardFeeAcknowledged: acct.card_fee_acknowledged_at != null,
        state,
      }
    : { ...DEFAULT_FEE_POLICY, state }
  const fees = computeOnlinePaymentFees(e.method.type === 'ach' ? 'ach' : 'credit_card', duesCents, policy)
  return {
    feeCents: fees.feeCents,
    feeChargedCents: fees.feeChargedToPayerCents,
    applicationFeeCents: fees.applicationFeeCents,
    allocationMode: allocationMode(state, e.today),
  }
}

/** The off-session charge on the connected account, over any StripeConnect (a fake in tests). */
export function autopayChargePort(stripe: StripeConnect): AutopayChargePort {
  return {
    async chargeOffSession(i) {
      const r = await stripe.chargeOffSession({
        stripeAccount: i.stripeAccountId,
        customerId: i.customerId,
        paymentMethodId: i.paymentMethodId,
        amountCents: i.amountCents,
        applicationFeeCents: i.applicationFeeCents,
        idempotencyKey: i.idempotencyKey,
        metadata: { online_payment_id: i.metadata.attempt_id, enrollment_id: i.metadata.enrollment_id },
      })
      if (r.status === 'failed') return { status: 'failed', failureCode: r.failureCode, paymentIntentId: r.paymentIntentId }
      // Every other status carries the intent id Stripe made.
      if (!r.paymentIntentId) throw new Error('autopay charge returned no payment intent')
      return { status: r.status, paymentIntentId: r.paymentIntentId }
    },
    async findCharge(i) {
      // Search first (cheap), then the strongly consistent list: only both saying nothing means nothing.
      const sinceUnix = Math.floor((Date.parse(i.attemptCreatedAt) - 60 * 60 * 1000) / 1000)
      const r =
        (await stripe.findOffSessionCharge(i.stripeAccountId, i.attemptId)) ??
        (await stripe.listOffSessionCharges(i.stripeAccountId, i.customerId, sinceUnix, i.attemptId))
      if (!r) return null
      if (r.status === 'failed') return { status: 'failed', failureCode: r.failureCode, paymentIntentId: r.paymentIntentId }
      if (!r.paymentIntentId) throw new Error('autopay lookup returned no payment intent')
      return { status: r.status, paymentIntentId: r.paymentIntentId }
    },
  }
}

export const autopayDeps: AutopayDeps = {
  charger: () => {
    const stripe = getStripeConnect()
    return stripe ? autopayChargePort(stripe) : null
  },
  quote: autopayQuote,
  sendEmail: (input, opts) => sendEmail(input, opts),
  appUrl,
}
