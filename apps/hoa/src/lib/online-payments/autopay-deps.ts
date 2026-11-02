import { createAdminClient } from '@homeowner-portal/db'
import type { AutopayDeps, AutopayEnrollment, AutopayFeeQuote } from '@homeowner-portal/jobs'
import { sendEmail, appUrl } from '@/lib/email'
import { allocationMode } from '@/lib/collections/ga-payment-order'
import { DEFAULT_FEE_POLICY, computeOnlinePaymentFees, type FeePolicy } from './fees'

/**
 * BL-036 autopay wiring. Fee quote reuses the one fee engine. The Stripe
 * charge port is not wired yet: the shared Stripe interface (PR 3/4) is not
 * in this branch, so `charger` returns null and the daily run sends notices
 * but takes no money. PR 4's off-session adapter replaces this one line.
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

export const autopayDeps: AutopayDeps = {
  charger: () => null,
  quote: autopayQuote,
  sendEmail: (input, opts) => sendEmail(input, opts),
  appUrl,
}
