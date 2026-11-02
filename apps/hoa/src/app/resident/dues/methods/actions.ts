'use server'

// BL-035 PR 7: manage saved payment methods (dark behind M8_APPLIED).
// A person manages only their own methods. Reads on the page go through RLS;
// writes here use the service role, always scoped by user_id = the caller.
// An admin viewing as a resident (impersonation) cannot change anything.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { deps } from '@/lib/online-payments/saved-methods-deps'
import { addMethodLimitMessage, checkAndRecordAddMethod } from '@/lib/online-payments/method-rate-limit'

const NOT_YET = 'Saved payment methods aren’t available yet.'
const READ_ONLY = 'You are viewing as this homeowner, so nothing can be changed.'
const Id = z.string().uuid()

export type MethodActionResult = { ok: true } | { ok: false; error: string }
export type AddMethodResult =
  | { ok: true; clientSecret: string; stripeAccount: string }
  | { ok: false; error: string }

async function caller(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const actor = await getResidentActor()
  if (actor.impersonating) return { ok: false, error: READ_ONLY }
  if (!actor.id) return { ok: false, error: 'Please sign in again.' }
  return { ok: true, userId: actor.id }
}

/** Start saving a new card or bank account. The method is stored when Stripe confirms it (webhook). */
export async function startAddMethod(): Promise<AddMethodResult> {
  if (!M8_APPLIED) return { ok: false, error: NOT_YET }
  const who = await caller()
  if (!who.ok) return who
  const port = deps.port()
  if (!port) return { ok: false, error: NOT_YET }

  const units = await getResidentUnits()
  const assocId = units.find((u) => u.association_id)?.association_id
  if (!assocId) return { ok: false, error: 'No home is linked to your account yet.' }

  const db = deps.db()
  const { data: acct } = (await db
    .from('association_stripe_accounts')
    .select('organization_id, stripe_account_id, online_payments_enabled, charges_enabled')
    .eq('association_id', assocId)
    .maybeSingle()) as { data: { organization_id: string; stripe_account_id: string; online_payments_enabled: boolean; charges_enabled: boolean } | null }
  if (!acct || !acct.online_payments_enabled || !acct.charges_enabled) {
    return { ok: false, error: 'Your association hasn’t turned on online payments yet.' }
  }

  // Card-testing guard (design 6.6), counted before Stripe is called.
  const limit = await checkAndRecordAddMethod(db, { orgId: acct.organization_id, userId: who.userId })
  if (!limit.ok) {
    if (limit.unavailable) return { ok: false, error: 'Couldn’t start that right now. Nothing was saved. Try again in a minute.' }
    return { ok: false, error: addMethodLimitMessage(limit.retryAfterSeconds) }
  }

  try {
    const { data: prior } = (await db
      .from('online_payment_methods')
      .select('stripe_customer_id')
      .eq('stripe_account_id', acct.stripe_account_id)
      .eq('user_id', who.userId)
      .limit(1)
      .maybeSingle()) as { data: { stripe_customer_id: string } | null }
    const meta = { organization_id: acct.organization_id, association_id: assocId, user_id: who.userId }
    const customerId = prior?.stripe_customer_id ?? (await port.createCustomer(acct.stripe_account_id, { metadata: meta })).id
    const si = await port.createSetupIntent(acct.stripe_account_id, { customerId, usage: 'on_session', metadata: meta })
    return { ok: true, clientSecret: si.clientSecret, stripeAccount: acct.stripe_account_id }
  } catch (err) {
    console.error('[saved-methods] start failed', { error: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Couldn’t start that. Nothing was saved. Try again.' }
  }
}

/** Remove one of my methods. Autopay that uses it must be changed first. */
export async function removeMethod(input: { id: string }): Promise<MethodActionResult> {
  if (!M8_APPLIED) return { ok: false, error: NOT_YET }
  const parsed = Id.safeParse(input?.id)
  if (!parsed.success) return { ok: false, error: 'That payment method wasn’t found.' }
  const who = await caller()
  if (!who.ok) return who
  const port = deps.port()
  if (!port) return { ok: false, error: NOT_YET }

  const db = deps.db()
  const { data: row } = (await db
    .from('online_payment_methods')
    .select('id, organization_id, stripe_account_id, stripe_payment_method_id')
    .eq('id', parsed.data)
    .eq('user_id', who.userId)
    .eq('is_active', true)
    .maybeSingle()) as { data: { id: string; organization_id: string; stripe_account_id: string; stripe_payment_method_id: string } | null }
  if (!row) return { ok: false, error: 'That payment method wasn’t found.' }

  const { data: using } = (await db
    .from('autopay_enrollments')
    .select('id')
    .eq('payment_method_id', row.id)
    .eq('user_id', who.userId)
    .in('status', ['active', 'paused'])
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null }
  if (using) return { ok: false, error: 'Autopay uses this one. Turn autopay off or pick another method first.' }

  try {
    await port.detachPaymentMethod(row.stripe_account_id, row.stripe_payment_method_id)
  } catch (err) {
    console.error('[saved-methods] detach failed', { methodId: row.id, error: err instanceof Error ? err.name : 'unknown' })
    return { ok: false, error: 'Couldn’t remove it. Nothing was changed. Try again.' }
  }
  // Removing the default leaves no default; the person picks again (design doc 7).
  const { error } = await db
    .from('online_payment_methods')
    .update({ is_active: false, is_default: false })
    .eq('id', row.id)
    .eq('user_id', who.userId)
  if (error) {
    console.error('[saved-methods] deactivate failed', { methodId: row.id, code: error.code ?? null })
    return { ok: false, error: 'Couldn’t remove it. Try again.' }
  }
  await db.from('audit_log').insert({
    org_id: row.organization_id,
    user_id: who.userId,
    action: 'payment_method.removed',
    entity_type: 'online_payment_method',
    entity_id: row.id,
    metadata: {},
  })
  revalidatePath('/resident/dues/methods')
  return { ok: true }
}

/** Make one of my active methods the default. */
export async function makeDefaultMethod(input: { id: string }): Promise<MethodActionResult> {
  if (!M8_APPLIED) return { ok: false, error: NOT_YET }
  const parsed = Id.safeParse(input?.id)
  if (!parsed.success) return { ok: false, error: 'That payment method wasn’t found.' }
  const who = await caller()
  if (!who.ok) return who

  const db = deps.db()
  const { data: row } = (await db
    .from('online_payment_methods')
    .select('id, association_id')
    .eq('id', parsed.data)
    .eq('user_id', who.userId)
    .eq('is_active', true)
    .maybeSingle()) as { data: { id: string; association_id: string } | null }
  if (!row) return { ok: false, error: 'That payment method wasn’t found.' }

  // One default per person per association (unique index): clear, then set.
  const cleared = await db
    .from('online_payment_methods')
    .update({ is_default: false })
    .eq('user_id', who.userId)
    .eq('association_id', row.association_id)
    .eq('is_default', true)
  if (cleared.error) return { ok: false, error: 'Couldn’t change that. Try again.' }
  const set = await db.from('online_payment_methods').update({ is_default: true }).eq('id', row.id).eq('user_id', who.userId)
  if (set.error) {
    console.error('[saved-methods] default failed', { methodId: row.id, code: set.error.code ?? null })
    return { ok: false, error: 'Couldn’t change that. Try again.' }
  }
  revalidatePath('/resident/dues/methods')
  return { ok: true }
}
