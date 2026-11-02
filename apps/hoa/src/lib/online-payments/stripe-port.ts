/**
 * The only Stripe surface the online-payment code touches (BL-035, PRs 4 and 5).
 * A thin interface so every unit test uses a fake and nothing here ever calls
 * live Stripe. The real adapter is `stripe-port-live.ts`.
 *
 * Direct charges: every call names the association's connected account, and
 * the PaymentIntent lives on that account, not on ours.
 *
 * Pure types: safe to import anywhere.
 */

export type PayMethodKind = 'ach' | 'card'

export interface CreateIntentInput {
  /** The association's own Stripe account (acct_...). */
  accountId: string
  /** Whole cents; the full charge (dues, plus the fee when the homeowner pays it). */
  amountCents: number
  /** Our Connect application_fee_amount, whole cents, never above amountCents. */
  applicationFeeCents: number
  method: PayMethodKind
  /** Also sent to Stripe as the Idempotency-Key, so a retry returns the same intent. */
  idempotencyKey: string
  /** Ids only: never names, addresses or amounts a person could be read from. */
  metadata: { online_payment_id: string; unit_id: string }
  /** Already sanitised by `statementDescriptorSuffix`; cards only. */
  descriptorSuffix: string | null
}

export interface IntentSnapshot {
  id: string
  /** Stripe's own status string, passed through untouched. */
  status: string
  clientSecret: string | null
  /** ACH by microdeposit: Stripe's hosted page where the resident types the two small amounts. */
  microdepositUrl: string | null
  /** Latest charge id, once there is one. */
  chargeId: string | null
}

export interface OnlinePaymentsStripePort {
  createPaymentIntent(input: CreateIntentInput): Promise<IntentSnapshot>
  retrievePaymentIntent(accountId: string, intentId: string): Promise<IntentSnapshot>
}

/**
 * What the card statement shows after the account's own descriptor: letters,
 * digits and spaces only, at most 22 characters (Stripe rejects `< > \ ' " *`
 * and anything longer), and at least one letter. Null when nothing usable is left.
 */
export function statementDescriptorSuffix(associationName: string | null | undefined): string | null {
  const cleaned = (associationName ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 22)
    .trim()
  return /[A-Za-z]/.test(cleaned) ? cleaned.toUpperCase() : null
}
