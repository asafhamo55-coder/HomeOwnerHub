/**
 * BL-035 PR 6: the board refund, against small interfaces so it runs with
 * fakes. Order matters: Stripe first (idempotent key), then the books under
 * the same refund id. If the books step fails after Stripe succeeded, the
 * charge.refunded webhook applies the same re_ id, so nothing is lost or
 * doubled. Not a 'use server' file; refund-action.ts is the entry point.
 */

import {
  isFullRefund,
  refundableCents,
  shouldReturnApplicationFee,
  stripeRefundCents,
  type RefundShape,
} from './reversal-rules'
import { notifyRefund, type AttemptView, type ReversalDeps } from './reversals'

export interface RefundGateway {
  createRefund(input: {
    stripeAccountId: string
    paymentIntentId: string
    amountCents: number
    refundApplicationFee: boolean
    idempotencyKey: string
  }): Promise<{ id: string; status?: string | null }>
}

export type RefundResult =
  | { ok: true; refundedCents: number; full: boolean; shortCents: number }
  | { ok: false; error: string }

export async function runBoardRefund(
  deps: ReversalDeps,
  gateway: RefundGateway,
  input: { attempt: AttemptView; paymentIntentId: string; cents: number | null; userId: string },
): Promise<RefundResult> {
  const { attempt } = input
  if (attempt.postedAt === null || !['succeeded', 'partially_refunded'].includes(attempt.status)) {
    return { ok: false, error: 'Only a payment that went through can be refunded.' }
  }
  const left = refundableCents(attempt.postedCents, attempt.reversedCents)
  const cents = input.cents ?? left
  if (!Number.isInteger(cents) || cents <= 0) return { ok: false, error: 'Enter an amount in dollars and cents.' }
  if (cents > left) return { ok: false, error: 'That is more than is left to refund on this payment.' }

  const shape: RefundShape = { refundCents: cents, postedCents: attempt.postedCents, reversedCents: attempt.reversedCents }
  const full = isFullRefund(shape)
  let refund: { id: string; status?: string | null }
  try {
    refund = await gateway.createRefund({
      stripeAccountId: attempt.stripeAccountId,
      paymentIntentId: input.paymentIntentId,
      amountCents: stripeRefundCents(shape, attempt),
      refundApplicationFee: shouldReturnApplicationFee(shape),
      idempotencyKey: `refund:${attempt.id}:${attempt.reversedCents}:${cents}`,
    })
  } catch {
    return { ok: false, error: 'Stripe did not accept the refund. Nothing was changed. Try again.' }
  }

  // Stripe can accept the call and still report the refund as failed or canceled (a closed bank
  // account, a card that cannot take it). The books must never show a reversal for money that
  // did not go back, so only a pending or succeeded refund reaches the ledger.
  if (refund.status && ['failed', 'canceled', 'requires_action'].includes(refund.status)) {
    return { ok: false, error: 'Stripe could not complete the refund. Nothing was changed. Check the payment in Stripe and try again.' }
  }

  try {
    const out = await deps.store.reverse({
      attemptId: attempt.id,
      kind: 'refund',
      ref: refund.id,
      cents,
      reason: 'Refund by the board',
      by: input.userId,
    })
    if (!out.alreadyApplied) await notifyRefund(deps, attempt, out.reversedCents, full, out.shortCents)
    return { ok: true, refundedCents: cents, full, shortCents: out.shortCents }
  } catch {
    // The money is on its way back; Stripe's refund event will finish the books.
    return { ok: false, error: 'The refund was sent, but the account update is still catching up. Check this home again in a few minutes.' }
  }
}
