// BL-035 PR 7: webhook handlers for saved methods. The route (owned by the
// webhook PR) calls savedMethodEventHandlers(port)[event.type] after verifying
// the signature and the event's account. Each handler is idempotent:
// redelivery changes nothing the second time. They run on the service role,
// so every query is scoped by the connected account and our own ids.
//
// Events: setup_intent.succeeded, payment_method.detached, mandate.updated.
// Logs carry ids and counts only.

import { createAdminClient } from '@homeowner-portal/db'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import type { PaymentMethodSummary, SavedMethodsStripePort, SetupIntentLike } from './saved-methods'

/** The only Stripe call the webhook handlers make. */
export type SavedMethodsReader = Pick<SavedMethodsStripePort, 'retrievePaymentMethod'>

/** The slice of Stripe.Event the handlers read; the route passes the real event. */
export interface ConnectEventLike {
  id: string
  type: string
  account?: string | null
  data: { object: unknown }
}

type Row = Record<string, unknown>
type Result = { data: unknown; error: { code?: string } | null }
interface Query extends PromiseLike<Result> {
  select(cols?: string): Query
  insert(row: Row): Query
  update(row: Row): Query
  eq(col: string, v: unknown): Query
  in(col: string, v: unknown[]): Query
  limit(n: number): Query
  maybeSingle(): PromiseLike<Result>
}
/** Service-role client, loosely typed: the M8 tables are not in the generated types yet. */
export interface HandlerDb {
  from(table: string): Query
}

export type HandlerOutcome = 'applied' | 'duplicate' | 'ignored'

const defaultDb = (): HandlerDb => createAdminClient() as unknown as HandlerDb

async function audit(db: HandlerDb, row: { org: string; user: string | null; action: string; entity: string; id: string }) {
  const { error } = await db.from('audit_log').insert({
    org_id: row.org,
    user_id: row.user,
    action: row.action,
    entity_type: row.entity,
    entity_id: row.id,
    metadata: {},
  })
  if (error) console.error('[saved-methods] audit failed', { action: row.action, code: error.code ?? null })
}

/** Pause the live autopay enrollment that charges `methodRowId`, if any. */
async function pauseAutopayFor(db: HandlerDb, methodRowId: string, orgId: string, userId: string): Promise<void> {
  const { data, error } = await db
    .from('autopay_enrollments')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('payment_method_id', methodRowId)
    .eq('status', 'active')
    .select('id')
  if (error) throw new Error(`autopay pause failed: ${error.code ?? 'unknown'}`)
  for (const r of (data as Array<{ id: string }> | null) ?? []) {
    await audit(db, { org: orgId, user: userId, action: 'autopay.paused', entity: 'autopay_enrollment', id: r.id })
  }
}

/**
 * setup_intent.succeeded: attach the new method to the person who started the
 * setup. Our ids ride in the SetupIntent metadata (set by the add-method
 * action). The event's account must be the association's own Stripe account.
 */
export async function handleSetupIntentSucceeded(
  event: ConnectEventLike,
  deps: { stripe: SavedMethodsReader; db?: HandlerDb },
): Promise<HandlerOutcome> {
  if (!M8_APPLIED) return 'ignored'
  const db = deps.db ?? defaultDb()
  const si = event.data.object as SetupIntentLike
  const account = event.account ?? ''
  const meta = si.metadata ?? {}
  const orgId = meta.organization_id
  const assocId = meta.association_id
  const userId = meta.user_id
  if (!account || !si.customer || !si.payment_method || !orgId || !assocId || !userId) return 'ignored'

  const { data: acct } = await db
    .from('association_stripe_accounts')
    .select('id')
    .eq('association_id', assocId)
    .eq('organization_id', orgId)
    .eq('stripe_account_id', account)
    .maybeSingle()
  if (!acct) {
    console.error('[saved-methods] setup for unknown account', { eventId: event.id, assocId })
    return 'ignored'
  }

  const { data: existing } = await db
    .from('online_payment_methods')
    .select('id')
    .eq('stripe_account_id', account)
    .eq('stripe_payment_method_id', si.payment_method)
    .maybeSingle()
  if (existing) return 'duplicate'

  const pm: PaymentMethodSummary | null = await deps.stripe.retrievePaymentMethod(account, si.payment_method)
  if (!pm) return 'ignored'

  // The first method a person saves becomes their default.
  const { data: hasDefault } = await db
    .from('online_payment_methods')
    .select('id')
    .eq('association_id', assocId)
    .eq('user_id', userId)
    .eq('is_default', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const { data: inserted, error } = await db
    .from('online_payment_methods')
    .insert({
      organization_id: orgId,
      association_id: assocId,
      user_id: userId,
      stripe_account_id: account,
      stripe_customer_id: si.customer,
      stripe_payment_method_id: si.payment_method,
      method_type: pm.type,
      brand: pm.brand,
      last4: pm.last4,
      exp_month: pm.expMonth,
      exp_year: pm.expYear,
      verification: pm.type === 'ach' ? 'financial_connections' : null,
      stripe_mandate_id: pm.type === 'ach' ? (si.mandate ?? null) : null,
      is_default: !hasDefault,
    })
    .select('id')
    .maybeSingle()
  // 23505: a concurrent redelivery won the race; same result as 'duplicate'.
  if (error?.code === '23505') return 'duplicate'
  if (error) throw new Error(`method insert failed: ${error.code ?? 'unknown'}`)
  const id = (inserted as { id?: string } | null)?.id
  if (id) await audit(db, { org: orgId, user: userId, action: 'payment_method.saved', entity: 'online_payment_method', id })
  return 'applied'
}

/** Mark the methods matching `col = value` inactive and pause any autopay that used them. */
async function deactivate(
  db: HandlerDb,
  account: string,
  col: 'stripe_payment_method_id' | 'stripe_mandate_id',
  value: string,
  action: string,
): Promise<HandlerOutcome> {
  const { data, error } = await db
    .from('online_payment_methods')
    .update({ is_active: false, is_default: false })
    .eq('stripe_account_id', account)
    .eq(col, value)
    .eq('is_active', true)
    .select('id, organization_id, user_id')
  if (error) throw new Error(`method deactivate failed: ${error.code ?? 'unknown'}`)
  const rows = (data as Array<{ id: string; organization_id: string; user_id: string }> | null) ?? []
  if (rows.length === 0) return 'duplicate'
  for (const r of rows) {
    await pauseAutopayFor(db, r.id, r.organization_id, r.user_id)
    await audit(db, { org: r.organization_id, user: r.user_id, action, entity: 'online_payment_method', id: r.id })
  }
  return 'applied'
}

/** payment_method.detached: Stripe no longer has it (we removed it, or the bank or the person did). */
export async function handlePaymentMethodDetached(event: ConnectEventLike, deps: { db?: HandlerDb } = {}): Promise<HandlerOutcome> {
  if (!M8_APPLIED) return 'ignored'
  const pm = event.data.object as { id?: string }
  if (!event.account || !pm.id) return 'ignored'
  return deactivate(deps.db ?? defaultDb(), event.account, 'stripe_payment_method_id', pm.id, 'payment_method.detached')
}

/** mandate.updated: an inactive mandate means the bank account can no longer be debited. */
export async function handleMandateUpdated(event: ConnectEventLike, deps: { db?: HandlerDb } = {}): Promise<HandlerOutcome> {
  if (!M8_APPLIED) return 'ignored'
  const m = event.data.object as { id?: string; status?: string }
  if (!event.account || !m.id || m.status !== 'inactive') return 'ignored'
  return deactivate(deps.db ?? defaultDb(), event.account, 'stripe_mandate_id', m.id, 'payment_method.mandate_ended')
}

/**
 * The one registration for the webhook route's event switch:
 *   const h = savedMethodEventHandlers(port)[event.type]; if (h) await h(event)
 */
export function savedMethodEventHandlers(
  stripe: SavedMethodsReader,
  db?: HandlerDb,
): Record<string, (e: ConnectEventLike) => Promise<HandlerOutcome>> {
  return {
    'setup_intent.succeeded': (e) => handleSetupIntentSucceeded(e, { stripe, db }),
    'payment_method.detached': (e) => handlePaymentMethodDetached(e, { db }),
    'mandate.updated': (e) => handleMandateUpdated(e, { db }),
  }
}
