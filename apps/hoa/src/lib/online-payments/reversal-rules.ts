/**
 * BL-035 PR 6: pure rules for failed bank payments, refunds and disputes.
 * Integer cents, no I/O, no flag checks, safe to import anywhere.
 *
 * Owner decisions (docs/decisions/2026-11-01-online-payment-fee-decisions.md):
 *   4. Our fee is returned on a full refund and kept on a partial one.
 *   5. The returned payment fee is off by default; a board may set one,
 *      capped at $30 pending counsel.
 */

/** Hard ceiling on the returned payment fee, in cents (decision 5). */
export const RETURNED_FEE_CAP_CENTS = 3000

/**
 * The fee to charge the home when a bank payment comes back. The board's
 * setting, or nothing. Unset, zero, negative or not a whole number means no
 * fee; anything above the cap is cut to the cap.
 */
export function effectiveReturnedFeeCents(configured: number | null | undefined): number {
  if (typeof configured !== 'number' || !Number.isInteger(configured) || configured <= 0) return 0
  return Math.min(configured, RETURNED_FEE_CAP_CENTS)
}

export interface RefundShape {
  /** What the board is giving back, in cents of dues. */
  refundCents: number
  /** Dues posted by this payment. */
  postedCents: number
  /** Dues already given back by earlier refunds, failures or lost disputes. */
  reversedCents: number
}

/** The part of the payment that can still be given back. */
export function refundableCents(postedCents: number, reversedCents: number): number {
  return Math.max(0, postedCents - reversedCents)
}

/** A full refund is one refund that returns the whole payment in one go. */
export function isFullRefund(r: RefundShape): boolean {
  return r.reversedCents === 0 && r.refundCents === r.postedCents
}

/** Decision 4: our application fee goes back only on a full refund. */
export function shouldReturnApplicationFee(r: RefundShape): boolean {
  return isFullRefund(r)
}

/**
 * What Stripe is asked to send back to the payer. A full refund also returns
 * a fee the homeowner paid on top of the dues; a partial refund returns only
 * the dues amount asked for.
 */
export function stripeRefundCents(
  r: RefundShape,
  payment: { feePayer: 'association' | 'homeowner'; feeCents: number },
): number {
  if (isFullRefund(r) && payment.feePayer === 'homeowner') return r.refundCents + payment.feeCents
  return r.refundCents
}

/**
 * A refund seen from Stripe's side (dashboard refund, or the echo of ours) is
 * capped to the dues still on the books. The fee a homeowner paid is not in
 * the ledger, so it is not reversed there.
 */
export function ledgerCentsForStripeRefund(stripeRefundAmount: number, postedCents: number, reversedCents: number): number {
  return Math.max(0, Math.min(stripeRefundAmount, refundableCents(postedCents, reversedCents)))
}

/** Dollars and cents for a notice, from integer cents. */
export function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  const d = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}$${d}.${String(abs % 100).padStart(2, '0')}`
}
