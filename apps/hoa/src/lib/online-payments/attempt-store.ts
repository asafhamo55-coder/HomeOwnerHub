/**
 * Supabase side of the online-payment attempt and webhook ports. SERVER ONLY,
 * not a 'use server' module. Uses the service-role client: online_payments
 * is written only by the server (migration 0073 RLS). Reads and writes throw
 * with the error code only, never row values.
 *
 * M8 tables are not in database.types.ts yet, so the client is reached
 * through a narrow cast; every caller checks M8_APPLIED first.
 */

import { associationTimeZone, todayIn } from '@/lib/association-time'
import { toCents } from '@/lib/payments/lump-payment'
import { loadInstallments } from '@homeowner-portal/workflows/payment-plans'
import type { OpenCharge } from '@/lib/collections/ga-payment-order'
import type { AttemptRow, AttemptStore, NewAttempt, PayContext } from './create-attempt'
import type { WebhookStore } from './webhook-handlers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }

function fail(what: string, error: { code?: string } | null): Error {
  return new Error(`online-payments: ${what} failed (${error?.code ?? 'unknown'})`)
}

const ATTEMPT_COLS =
  'id, user_id, unit_id, association_id, method_type, status, dues_cents, fee_cents, fee_payer, total_cents, application_fee_cents, stripe_account_id, stripe_payment_intent_id'

export function supabaseAttemptStore(db: Db): AttemptStore {
  return {
    async loadContext(unitId): Promise<PayContext | null> {
      const { data: unit, error: ue } = await db.from('units').select('id, organization_id, association_id').eq('id', unitId).maybeSingle()
      if (ue) throw fail('unit read', ue)
      if (!unit) return null
      const { data: assoc, error: ae } = await db
        .from('associations')
        .select('id, name, state, governing_law_state, compliance_settings')
        .eq('id', unit.association_id)
        .maybeSingle()
      if (ae) throw fail('association read', ae)
      if (!assoc) return null
      const { data: acct, error: se } = await db
        .from('association_stripe_accounts')
        .select('stripe_account_id, charges_enabled, payouts_enabled, online_payments_enabled, ach_fee_payer, card_fee_payer, card_fee_acknowledged_at')
        .eq('association_id', unit.association_id)
        .maybeSingle()
      if (se) throw fail('account read', se)
      const { data: rows, error: ce } = await db
        .from('assessments')
        .select('id, assessment_type, due_date, amount, payments(amount)')
        .eq('association_id', unit.association_id)
        .eq('unit_id', unitId)
        .in('status', ['open', 'partial'])
        .is('deleted_at', null)
        .order('due_date', { ascending: true })
        .order('id', { ascending: true })
        .range(0, 999)
      if (ce) throw fail('charges read', ce)
      type R = { id: string; assessment_type: string; due_date: string; amount: number; payments: Array<{ amount: number }> | null }
      const list = (rows ?? []) as R[]
      // A capped read would split a payment over part of the account: refuse.
      if (list.length >= 1000) return null
      // Payment-plan installments are stored as 'special' but rank last and are
      // flagged, exactly as in the board's lump-payment flow, so the same money
      // is applied the same way. A failed read throws; it never guesses.
      let installmentIds: Set<string>
      try {
        installmentIds = new Set((await loadInstallments(db as never, unit.association_id)).map((i) => i.assessmentId))
      } catch {
        throw new Error('online-payments: installment read failed')
      }
      const charges: OpenCharge[] = list.map((r) => ({
        id: r.id,
        type: r.assessment_type,
        dueDate: r.due_date,
        remainingCents: Math.max(0, toCents(r.amount) - (r.payments ?? []).reduce((s, p) => s + toCents(p.amount), 0)),
        planInstallment: installmentIds.has(r.id),
      }))
      const state = ((assoc.governing_law_state ?? assoc.state ?? '') as string).trim().toUpperCase() || null
      const cs = assoc.compliance_settings as Record<string, unknown> | null
      return {
        organizationId: unit.organization_id,
        associationId: unit.association_id,
        associationName: assoc.name ?? null,
        state,
        today: todayIn(associationTimeZone(assoc)),
        sandbox: cs?.outbound_mode === 'sandbox',
        charges,
        account: acct
          ? {
              stripeAccountId: acct.stripe_account_id,
              chargesEnabled: acct.charges_enabled,
              payoutsEnabled: acct.payouts_enabled,
              onlinePaymentsEnabled: acct.online_payments_enabled,
              achFeePayer: acct.ach_fee_payer,
              cardFeePayer: acct.card_fee_payer,
              cardFeeAcknowledged: acct.card_fee_acknowledged_at != null,
            }
          : null,
      }
    },

    async findByKey(associationId, key) {
      const { data, error } = await db
        .from('online_payments')
        .select(ATTEMPT_COLS)
        .eq('association_id', associationId)
        .eq('idempotency_key', key)
        .maybeSingle()
      if (error) throw fail('attempt read', error)
      return (data as AttemptRow | null) ?? null
    },

    async insert(row: NewAttempt) {
      const { data, error } = await db.from('online_payments').insert(row).select(ATTEMPT_COLS).single()
      if (!error) return data as AttemptRow
      if (error.code === '23505') {
        const won = await this.findByKey(row.association_id, row.idempotency_key)
        if (won) return won
      }
      throw fail('attempt insert', error)
    },

    async setIntent(attemptId, intentId) {
      const { error } = await db
        .from('online_payments')
        .update({ stripe_payment_intent_id: intentId, status: 'requires_action' })
        .eq('id', attemptId)
        .is('stripe_payment_intent_id', null)
        .in('status', ['created'])
      if (error) throw fail('attempt update', error)
    },
  }
}

export function supabaseWebhookStore(db: Db): WebhookStore {
  return {
    async findByIntent(intentId) {
      const { data, error } = await db
        .from('online_payments')
        .select('id, stripe_account_id, status, association_id')
        .eq('stripe_payment_intent_id', intentId)
        .maybeSingle()
      if (error) throw fail('attempt read', error)
      return data ?? null
    },
    async transition(attemptId, to, from, failureCode) {
      const patch: Record<string, unknown> = { status: to }
      if (failureCode !== undefined) patch.failure_code = failureCode
      const { data, error } = await db.from('online_payments').update(patch).eq('id', attemptId).in('status', [...from]).select('id')
      if (error) throw fail('attempt transition', error)
      return Array.isArray(data) && data.length > 0
    },
    async postSuccess(attemptId, paidOn, chargeId) {
      const { data, error } = await db.rpc('record_online_payment_success', {
        p_attempt: attemptId,
        p_paid_on: paidOn,
        p_charge: chargeId,
      })
      if (error) throw fail('post success', error)
      const posted = (data?.posted ?? []) as Array<{ payment_id?: string }>
      return {
        alreadyPosted: data?.already_posted === true,
        paymentIds: posted.map((p) => p.payment_id).filter((x): x is string => typeof x === 'string'),
      }
    },
    async dayFor(associationId, unixSeconds) {
      const { data, error } = await db
        .from('associations')
        .select('state')
        .eq('id', associationId)
        .maybeSingle()
      if (error) throw fail('association read', error)
      return todayIn(associationTimeZone(data ?? {}), new Date(unixSeconds * 1000))
    },
  }
}
