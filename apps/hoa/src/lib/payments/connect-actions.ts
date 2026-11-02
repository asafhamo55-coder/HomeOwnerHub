'use server'

// Board server actions for Stripe Connect onboarding and the online-payment
// fee settings (BL-035, PR 3). Dark behind M8_APPLIED. Writes go through the
// service role after the role gate; every change writes an audit_log row
// (ids only). The webhook (connect-account-events.ts) is the only writer of
// onboarding state after creation, apart from the manual "check again".

import { revalidatePath } from 'next/cache'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSignedInUser } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { appUrl } from '@/lib/app-origin'
import { ACCOUNT_COLUMNS, adminDb, getAccountForAssociation, rowFromDb, writeAccountState, type UntypedDb } from './connect-store'
import { validateFeeSettings, type ConnectAccountRow } from './connect-account'
import { getStripeConnect, type StripeConnect } from './stripe-connect'
import { ensureOnlinePaymentAccounts } from '@/lib/online-payments/payouts-store'

export type ConnectActionResult = { ok: true; url?: string } | { ok: false; error: string }

const NOT_AVAILABLE = 'Online payments are not available yet.'
const FAILED = 'We could not do that just now. Please try again in a moment.'
const SETTINGS_PATH = '/settings/online-payments'

export interface ConnectActionDeps {
  stripe?: StripeConnect | null
  db?: UntypedDb
  /** Creates chart accounts 1015 and 6150; tests pass a fake. */
  ensureAccounts?: (db: never, organizationId: string, associationId: string) => Promise<boolean>
}

interface Scope {
  orgId: string
  userId: string
  association: { id: string; name: string; state: string }
}

async function loadScope(): Promise<{ ok: true; scope: Scope } | { ok: false; error: string }> {
  if (!M8_APPLIED) return { ok: false, error: NOT_AVAILABLE }
  // Board or admin. A treasurer is a board member; residents are refused.
  const gate = await requireBoardOrAdminForAction('Only board members and admins can set up online payments.')
  if (!gate.ok) return { ok: false, error: gate.error }
  const user = await getSignedInUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('associations')
    .select('id, name, state')
    .eq('organization_id', gate.orgId)
    .order('name', { ascending: true })
    .limit(1)
  if (error) return { ok: false, error: FAILED }
  const a = data?.[0]
  if (!a) return { ok: false, error: 'Add your association first, then set up online payments.' }
  return { ok: true, scope: { orgId: gate.orgId, userId: user.id, association: a } }
}

async function audit(db: UntypedDb, s: Scope, action: string, metadata: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({
    org_id: s.orgId,
    user_id: s.userId,
    action,
    entity_type: 'association',
    entity_id: s.association.id,
    metadata,
  })
  if (error) console.error('connect audit failed', { associationId: s.association.id, code: error.code })
}

/**
 * Creates the Standard account on first use, then returns a fresh Stripe
 * onboarding link. Safe to call again to resume (Account Links are one use).
 */
export async function startConnectOnboarding(deps: ConnectActionDeps = {}): Promise<ConnectActionResult> {
  const sc = await loadScope()
  if (!sc.ok) return sc
  const { scope } = sc
  const stripe = deps.stripe === undefined ? getStripeConnect() : deps.stripe
  if (!stripe) return { ok: false, error: 'Online payments are not switched on for this server yet.' }
  const db = deps.db ?? adminDb()
  try {
    let row = await getAccountForAssociation(db, scope.association.id)
    if (!row) {
      const created = await stripe.createAccount({
        associationId: scope.association.id,
        name: scope.association.name,
        state: scope.association.state || null,
        // One association, one account: a double click returns the same account.
        idempotencyKey: `connect-account:${scope.association.id}`,
      })
      const { data, error } = await db
        .from('association_stripe_accounts')
        .upsert(
          {
            organization_id: scope.orgId,
            association_id: scope.association.id,
            stripe_account_id: created.id,
            details_submitted: created.detailsSubmitted,
            charges_enabled: created.chargesEnabled,
            payouts_enabled: created.payoutsEnabled,
            requirements_due: created.requirementsDue,
            disabled_reason: created.disabledReason,
            started_by: scope.userId,
          },
          { onConflict: 'association_id', ignoreDuplicates: true },
        )
        .select(ACCOUNT_COLUMNS)
        .maybeSingle()
      if (error) {
        console.error('connect insert failed', { associationId: scope.association.id, code: error.code })
        return { ok: false, error: FAILED }
      }
      row = data ? rowFromDb(data as Record<string, unknown>) : await getAccountForAssociation(db, scope.association.id)
      if (!row) return { ok: false, error: FAILED }
      await audit(db, scope, 'connect.started', { stripe_account_id: row.stripeAccountId })
    }
    const link = await stripe.createAccountLink({
      stripeAccount: row.stripeAccountId,
      returnUrl: appUrl(`${SETTINGS_PATH}?from=stripe`),
      refreshUrl: appUrl(`${SETTINGS_PATH}?refresh=1`),
    })
    return { ok: true, url: link.url }
  } catch (err) {
    console.error('connect onboarding failed', { associationId: scope.association.id, name: (err as Error)?.name })
    return { ok: false, error: FAILED }
  }
}

/** "Check again": re-reads the account from Stripe. The page also updates through the webhook. */
export async function refreshConnectStatus(deps: ConnectActionDeps = {}): Promise<ConnectActionResult> {
  const sc = await loadScope()
  if (!sc.ok) return sc
  const stripe = deps.stripe === undefined ? getStripeConnect() : deps.stripe
  if (!stripe) return { ok: false, error: FAILED }
  const db = deps.db ?? adminDb()
  try {
    const row = await getAccountForAssociation(db, sc.scope.association.id)
    if (!row) return { ok: false, error: 'Online payments have not been started yet.' }
    await writeAccountState(db, row.stripeAccountId, await stripe.retrieveAccount(row.stripeAccountId))
    revalidatePath(SETTINGS_PATH)
    return { ok: true }
  } catch {
    return { ok: false, error: FAILED }
  }
}

export interface SaveSettingsInput {
  onlinePaymentsEnabled: boolean
  achFeePayer: unknown
  cardFeePayer: unknown
  returnedPaymentFeeCents: unknown
  acknowledgeCardFee: unknown
}

/** The board's switch and fee choices. Take effect for future payments only. */
export async function saveOnlinePaymentSettings(
  input: SaveSettingsInput,
  deps: ConnectActionDeps = {},
): Promise<ConnectActionResult> {
  const sc = await loadScope()
  if (!sc.ok) return sc
  const { scope } = sc
  const db = deps.db ?? adminDb()
  let row: ConnectAccountRow | null
  try {
    row = await getAccountForAssociation(db, scope.association.id)
  } catch {
    return { ok: false, error: FAILED }
  }
  if (!row) return { ok: false, error: 'Set up online payments with Stripe first.' }

  const valid = validateFeeSettings(input, {
    associationState: scope.association.state,
    alreadyAcknowledged: row.cardFeeAcknowledgedAt !== null,
  })
  if (!valid.ok) return valid
  const wantOn = input.onlinePaymentsEnabled === true
  if (wantOn && !(row.chargesEnabled && row.payoutsEnabled)) {
    return { ok: false, error: 'Stripe has to finish checking your account before you can turn payments on.' }
  }

  // First enable: the books need 1015 (clearing) and 6150 (fees) before any
  // payment can post (design 1.3 step 6). Safe to repeat. Without them (no
  // OPERATING fund yet) the switch stays off, so nothing can be taken that the
  // ledger has nowhere to put.
  if (wantOn) {
    try {
      const ensure = deps.ensureAccounts ?? ensureOnlinePaymentAccounts
      const ready = await ensure(db as never, scope.orgId, scope.association.id)
      if (!ready) return { ok: false, error: 'Set up your books first, then turn online payments on.' }
    } catch {
      return { ok: false, error: FAILED }
    }
  }

  const v = valid.value
  const patch: Record<string, unknown> = {
    online_payments_enabled: wantOn,
    ach_fee_payer: v.achFeePayer,
    card_fee_payer: v.cardFeePayer,
    returned_payment_fee_cents: v.returnedPaymentFeeCents,
    updated_at: new Date().toISOString(),
  }
  if (v.recordAcknowledgement) {
    patch.card_fee_acknowledged_at = new Date().toISOString()
    patch.card_fee_acknowledged_by = scope.userId
  }
  const { error } = await db
    .from('association_stripe_accounts')
    .update(patch)
    .eq('association_id', scope.association.id)
    .eq('organization_id', scope.orgId)
  if (error) {
    console.error('connect settings save failed', { associationId: scope.association.id, code: error.code })
    return { ok: false, error: FAILED }
  }
  await audit(db, scope, 'connect.settings_changed', {
    online_payments_enabled: wantOn,
    ach_fee_payer: v.achFeePayer,
    card_fee_payer: v.cardFeePayer,
    returned_payment_fee_cents: v.returnedPaymentFeeCents,
    card_fee_acknowledged: v.recordAcknowledgement,
  })
  revalidatePath(SETTINGS_PATH)
  return { ok: true }
}
