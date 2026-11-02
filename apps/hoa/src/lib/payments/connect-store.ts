/**
 * Supabase persistence for Connect (service role). The M8 tables are not in
 * the generated Database type until the owner applies 0073 and types are
 * regenerated, so this file talks to an untyped client. Every function
 * is dark behind M8_APPLIED at its caller.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@homeowner-portal/db'
import type { ConnectAccountRow } from './connect-account'
import type { ConnectWebhookStore } from './connect-webhook'
import type { ConnectAccountState } from './stripe-connect'

export type UntypedDb = SupabaseClient

export function adminDb(): UntypedDb {
  return createAdminClient() as unknown as UntypedDb
}

export const ACCOUNT_COLUMNS =
  'id, organization_id, association_id, stripe_account_id, details_submitted, charges_enabled, payouts_enabled, requirements_due, disabled_reason, online_payments_enabled, ach_fee_payer, card_fee_payer, card_fee_acknowledged_at, returned_payment_fee_cents'

type Raw = Record<string, unknown>

export function rowFromDb(r: Raw): ConnectAccountRow {
  const due = Array.isArray(r.requirements_due) ? (r.requirements_due as unknown[]).filter((x) => typeof x === 'string') : []
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    associationId: String(r.association_id),
    stripeAccountId: String(r.stripe_account_id),
    detailsSubmitted: r.details_submitted === true,
    chargesEnabled: r.charges_enabled === true,
    payoutsEnabled: r.payouts_enabled === true,
    requirementsDue: due as string[],
    disabledReason: typeof r.disabled_reason === 'string' ? r.disabled_reason : null,
    onlinePaymentsEnabled: r.online_payments_enabled === true,
    achFeePayer: r.ach_fee_payer === 'homeowner' ? 'homeowner' : 'association',
    cardFeePayer: r.card_fee_payer === 'association' ? 'association' : 'homeowner',
    cardFeeAcknowledgedAt: typeof r.card_fee_acknowledged_at === 'string' ? r.card_fee_acknowledged_at : null,
    returnedPaymentFeeCents: typeof r.returned_payment_fee_cents === 'number' ? r.returned_payment_fee_cents : null,
  }
}

export async function getAccountForAssociation(db: UntypedDb, associationId: string): Promise<ConnectAccountRow | null> {
  const { data, error } = await db
    .from('association_stripe_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('association_id', associationId)
    .maybeSingle()
  if (error) throw new Error(`connect_read_failed:${error.code ?? 'unknown'}`)
  return data ? rowFromDb(data as Raw) : null
}

/** Mirrors Stripe's account state into the row. Only the webhook and a manual refresh call this. */
export async function writeAccountState(db: UntypedDb, stripeAccountId: string, s: ConnectAccountState): Promise<void> {
  const { error } = await db
    .from('association_stripe_accounts')
    .update({
      details_submitted: s.detailsSubmitted,
      charges_enabled: s.chargesEnabled,
      payouts_enabled: s.payoutsEnabled,
      requirements_due: s.requirementsDue,
      disabled_reason: s.disabledReason ? s.disabledReason.slice(0, 120) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', stripeAccountId)
  if (error) throw new Error(`connect_write_failed:${error.code ?? 'unknown'}`)
}

export function supabaseWebhookStore(db: UntypedDb = adminDb()): ConnectWebhookStore {
  return {
    async findAccountByStripeId(id) {
      const { data, error } = await db
        .from('association_stripe_accounts')
        .select(ACCOUNT_COLUMNS)
        .eq('stripe_account_id', id)
        .maybeSingle()
      if (error) throw new Error(`connect_read_failed:${error.code ?? 'unknown'}`)
      return data ? rowFromDb(data as Raw) : null
    },
    async eventSeen(eventId) {
      const { data, error } = await db.from('stripe_webhook_events').select('event_id').eq('event_id', eventId).maybeSingle()
      if (error) throw new Error(`connect_read_failed:${error.code ?? 'unknown'}`)
      return Boolean(data)
    },
    async recordEvent(e) {
      const { error } = await db.from('stripe_webhook_events').upsert(
        {
          event_id: e.eventId,
          event_type: e.eventType.slice(0, 255),
          event_created: e.eventCreated.toISOString(),
          object_id: e.objectId,
          org_id: e.orgId,
          outcome: e.outcome,
        },
        { onConflict: 'event_id', ignoreDuplicates: true },
      )
      if (error) throw new Error(`connect_write_failed:${error.code ?? 'unknown'}`)
    },
  }
}
