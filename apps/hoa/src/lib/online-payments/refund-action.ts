'use server'

// BL-035 PR 6 (M8_APPLIED): the board gives a payment back. Board/admin only;
// re-checked here because a server action is a public endpoint. The payment is
// read through the caller's own client, so another org's id finds nothing.
// Audit rows are written by reverse_online_payment (ids and cents only).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getStripeConnect } from '@/lib/payments/stripe-connect'
import { runBoardRefund, type RefundGateway, type RefundResult } from './refund-core'
import { reversalDeps } from './reversals-deps'

const Schema = z.object({
  paymentId: z.string().uuid(),
  /** Cents of dues to give back; omit for the whole payment. */
  cents: z.number().int().positive().max(100_000_000).optional(),
})

function stripeGateway(): RefundGateway {
  // The one shared Stripe client (pinned API version, same as every other payment call).
  const stripe = getStripeConnect()
  if (!stripe) throw new Error('STRIPE_SECRET_KEY is not set')
  return {
    async createRefund(i) {
      const r = await stripe.createRefund({
        stripeAccount: i.stripeAccountId,
        paymentIntentId: i.paymentIntentId,
        amountCents: i.amountCents,
        refundApplicationFee: i.refundApplicationFee,
        idempotencyKey: i.idempotencyKey,
      })
      return { id: r.id, status: r.status }
    },
  }
}

export async function refundOnlinePayment(input: { paymentId: string; cents?: number }): Promise<RefundResult> {
  if (!M8_APPLIED) return { ok: false, error: 'Online payments aren’t available yet.' }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter an amount in dollars and cents.' }

  const supabase = await getSupabaseServerClient()
  const { data: row } = (await (supabase as unknown as { from: (t: string) => any })
    .from('online_payments')
    .select('id, organization_id, stripe_payment_intent_id')
    .eq('id', parsed.data.paymentId)
    .maybeSingle()) as { data: { id: string; organization_id: string; stripe_payment_intent_id: string | null } | null }
  if (!row || row.organization_id !== gate.orgId || !row.stripe_payment_intent_id) {
    return { ok: false, error: 'We couldn’t find that payment.' }
  }

  const deps = reversalDeps()
  const attempt = await deps.store.findAttempt({ paymentIntentId: row.stripe_payment_intent_id })
  if (!attempt || attempt.organizationId !== gate.orgId) return { ok: false, error: 'We couldn’t find that payment.' }

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, error: BOARD_ONLY_DENIED }

  let gateway: RefundGateway
  try {
    gateway = stripeGateway()
  } catch {
    return { ok: false, error: 'Refunds aren’t set up yet.' }
  }
  const result = await runBoardRefund(deps, gateway, {
    attempt,
    paymentIntentId: row.stripe_payment_intent_id,
    cents: parsed.data.cents ?? null,
    userId: auth.user.id,
  })
  if (result.ok) {
    revalidatePath('/dues')
    revalidatePath('/accounting')
    revalidatePath('/accounting/ledger')
  }
  return result
}
