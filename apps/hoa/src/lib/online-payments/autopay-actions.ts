'use server'

// BL-036 autopay: an owner turns autopay on, changes the limit, or turns it
// off. Dark behind M8_APPLIED. The signed-in person only (never an
// impersonating admin: the cookie-bound user is read directly), and only for
// a home they currently own. Writes go through the service role because the
// M8 tables have no write policy; every write re-checks ownership first.
// Audit rows carry ids and cents only.
//
// LEGAL REVIEW NEEDED (OA-48): the authorization text version stored here maps
// to wording in ./autopay.ts that counsel has not reviewed.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { getResidentActor } from '@/lib/impersonation'
import { AUTOPAY_AUTHORIZATION_VERSION, AUTOPAY_MAX_CENTS, AUTOPAY_MIN_CENTS } from './autopay'

export type AutopayActionResult = { ok: true } | { ok: false; error: string }

const OFF = 'Autopay is not available yet.'
const GENERIC = 'Something went wrong. Nothing was changed. Try again.'

const Max = z.number().int().min(AUTOPAY_MIN_CENTS).max(AUTOPAY_MAX_CENTS)
const EnrollSchema = z.object({
  unitId: z.string().uuid(),
  paymentMethodId: z.string().uuid(),
  maxCents: Max,
  includeOtherCharges: z.boolean().default(false),
  agreed: z.literal(true),
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any }

/**
 * The signed-in person, or null. An admin impersonating an owner is refused
 * (null): autopay is the owner's own authorization, never an admin's.
 */
async function signedInUser(): Promise<string | null> {
  const actor = await getResidentActor()
  if (!actor.id || actor.impersonating) return null
  return actor.id
}

async function ownsUnit(db: Db, userId: string, unitId: string): Promise<{ orgId: string; associationId: string } | null> {
  const { data, error } = await db
    .from('ownerships')
    .select('organization_id, unit:units(association_id)')
    .eq('owner_user_id', userId)
    .eq('unit_id', unitId)
    .is('valid_to', null)
    .limit(1)
  const row = (data ?? [])[0] as { organization_id: string; unit: { association_id: string } | null } | undefined
  if (error || !row?.unit) return null
  return { orgId: row.organization_id, associationId: row.unit.association_id }
}

async function audit(db: Db, orgId: string, userId: string, action: string, enrollmentId: string, metadata: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({
    action,
    org_id: orgId,
    user_id: userId,
    entity_type: 'autopay_enrollment',
    entity_id: enrollmentId,
    metadata,
  })
  if (error) console.error('[autopay] audit write failed', { code: error.code ?? null })
}

export async function enrollAutopay(input: unknown): Promise<AutopayActionResult> {
  if (!M8_APPLIED) return { ok: false, error: OFF }
  const parsed = EnrollSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Check the limit and tick the box to agree, then try again.' }
  }
  const userId = await signedInUser()
  if (!userId) return { ok: false, error: 'Please sign in again.' }
  const db = createAdminClient() as unknown as Db
  const own = await ownsUnit(db, userId, parsed.data.unitId)
  if (!own) return { ok: false, error: 'We could not match you to that home.' }

  // The saved method must be this person's own, active, for this association.
  const { data: m } = await db
    .from('online_payment_methods')
    .select('id')
    .eq('id', parsed.data.paymentMethodId)
    .eq('user_id', userId)
    .eq('association_id', own.associationId)
    .eq('is_active', true)
    .maybeSingle()
  if (!m) return { ok: false, error: 'Choose a saved payment method first.' }

  const { data, error } = await db
    .from('autopay_enrollments')
    .insert({
      organization_id: own.orgId,
      association_id: own.associationId,
      unit_id: parsed.data.unitId,
      user_id: userId,
      payment_method_id: parsed.data.paymentMethodId,
      max_cents: parsed.data.maxCents,
      include_other_charges: parsed.data.includeOtherCharges,
      authorization_text_version: AUTOPAY_AUTHORIZATION_VERSION,
    })
    .select('id')
    .single()
  if (error) {
    // 23505: this home already has a live enrollment.
    if (error.code === '23505') return { ok: false, error: 'Autopay is already set up for this home.' }
    console.error('[autopay] enroll failed', { code: error.code ?? null })
    return { ok: false, error: GENERIC }
  }
  await audit(db, own.orgId, userId, 'autopay.enrolled', (data as { id: string }).id, {
    max_cents: parsed.data.maxCents,
    include_other: parsed.data.includeOtherCharges,
    text_version: AUTOPAY_AUTHORIZATION_VERSION,
  })
  revalidatePath('/resident/dues/autopay')
  return { ok: true }
}

const ChangeSchema = z.object({
  enrollmentId: z.string().uuid(),
  maxCents: Max,
  includeOtherCharges: z.boolean(),
  /** Turning a paused autopay back on. */
  resume: z.boolean().default(false),
})

export async function changeAutopay(input: unknown): Promise<AutopayActionResult> {
  if (!M8_APPLIED) return { ok: false, error: OFF }
  const parsed = ChangeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Enter a limit between $1 and $50,000.' }
  const userId = await signedInUser()
  if (!userId) return { ok: false, error: 'Please sign in again.' }
  const db = createAdminClient() as unknown as Db
  const { data: cur } = await db
    .from('autopay_enrollments')
    .select('id, organization_id, status')
    .eq('id', parsed.data.enrollmentId)
    .eq('user_id', userId)
    .in('status', ['active', 'paused'])
    .maybeSingle()
  if (!cur) return { ok: false, error: 'We could not find your autopay.' }
  const patch: Record<string, unknown> = {
    max_cents: parsed.data.maxCents,
    include_other_charges: parsed.data.includeOtherCharges,
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.resume) Object.assign(patch, { status: 'active', consecutive_failures: 0 })
  const { error } = await db.from('autopay_enrollments').update(patch).eq('id', cur.id).eq('user_id', userId)
  if (error) {
    console.error('[autopay] change failed', { code: error.code ?? null })
    return { ok: false, error: GENERIC }
  }
  await audit(db, cur.organization_id, userId, 'autopay.changed', cur.id, {
    max_cents: parsed.data.maxCents,
    include_other: parsed.data.includeOtherCharges,
    resumed: parsed.data.resume,
  })
  revalidatePath('/resident/dues/autopay')
  return { ok: true }
}

export async function cancelAutopay(enrollmentId: string): Promise<AutopayActionResult> {
  if (!M8_APPLIED) return { ok: false, error: OFF }
  if (!z.string().uuid().safeParse(enrollmentId).success) return { ok: false, error: GENERIC }
  const userId = await signedInUser()
  if (!userId) return { ok: false, error: 'Please sign in again.' }
  const db = createAdminClient() as unknown as Db
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('autopay_enrollments')
    .update({ status: 'canceled', canceled_at: now, updated_at: now })
    .eq('id', enrollmentId)
    .eq('user_id', userId)
    .in('status', ['active', 'paused'])
    .select('id, organization_id')
  if (error) {
    console.error('[autopay] cancel failed', { code: error.code ?? null })
    return { ok: false, error: GENERIC }
  }
  const row = ((data ?? []) as Array<{ id: string; organization_id: string }>)[0]
  if (!row) return { ok: false, error: 'Autopay is already off.' }
  await audit(db, row.organization_id, userId, 'autopay.canceled', row.id, { reason: 'owner' })
  revalidatePath('/resident/dues/autopay')
  return { ok: true }
}
