/**
 * Server read for the resident Pay screen (BL-035 PR 4/5). SERVER ONLY, not a
 * 'use server' module. Returns nothing at all until M8_APPLIED is true, so the
 * screen is exactly as it was before.
 */

import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { previewPayNow, type PayNowPreview } from './create-attempt'
import { supabaseAttemptStore } from './attempt-store'
import { adminDb } from './production'
import { getLivePort } from './stripe-port-live'

export interface PaymentOnTheWay {
  id: string
  method: 'ach' | 'card'
  totalCents: number
  /** ACH by microdeposit: where the resident finishes connecting the bank. */
  finishBankUrl: string | null
}

export interface PayScreenState {
  offer: PayNowPreview | null
  publishableKey: string | null
  onTheWay: PaymentOnTheWay[]
}

export const EMPTY_PAY_STATE: PayScreenState = { offer: null, publishableKey: null, onTheWay: [] }

/**
 * `unitId` must already be one of the resident's units (the page passes the
 * resident guard's answer). Any read failure hides Pay now rather than guess.
 */
export async function loadPayScreenState(
  unitId: string,
  chargesFrom: string | null = null,
  /** The person looking at the screen. Payments on the way are theirs only; null shows none. */
  userId: string | null = null,
): Promise<PayScreenState> {
  if (!M8_APPLIED) return EMPTY_PAY_STATE
  try {
    const db = adminDb()
    const ctx = await supabaseAttemptStore(db).loadContext(unitId, { chargesFrom })
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null
    const offer = publishableKey ? previewPayNow(unitId, ctx) : null

    // Only the viewer's own payments, and for a buyer only those started after they took over.
    if (!userId) return { offer, publishableKey, onTheWay: [] }
    let q = db
      .from('online_payments')
      .select('id, method_type, total_cents, status, stripe_account_id, stripe_payment_intent_id')
      .eq('unit_id', unitId)
      .eq('user_id', userId)
      .in('status', ['requires_action', 'processing'])
    if (chargesFrom) q = q.gte('created_at', chargesFrom)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(5)
    if (error) throw new Error(`pay-state: read failed (${error.code ?? 'unknown'})`)
    const stripe = getLivePort()
    const onTheWay: PaymentOnTheWay[] = []
    for (const r of (data ?? []) as Array<{
      id: string
      method_type: 'ach' | 'card'
      total_cents: number
      status: string
      stripe_account_id: string
      stripe_payment_intent_id: string | null
    }>) {
      // A bank payment is "on the way" once the bank has the debit. A card or
      // bank attempt still waiting on the resident is not shown as sent.
      let finishBankUrl: string | null = null
      if (r.status === 'requires_action' && r.method_type === 'ach' && r.stripe_payment_intent_id && stripe) {
        const snap = await stripe.retrievePaymentIntent(r.stripe_account_id, r.stripe_payment_intent_id)
        finishBankUrl = snap.microdepositUrl
        if (!finishBankUrl) continue
      } else if (r.status !== 'processing') {
        continue
      }
      onTheWay.push({ id: r.id, method: r.method_type, totalCents: r.total_cents, finishBankUrl })
    }
    return { offer, publishableKey, onTheWay }
  } catch (err) {
    console.error('[online-payments] pay state failed', { error: err instanceof Error ? err.name : 'unknown' })
    return EMPTY_PAY_STATE
  }
}
