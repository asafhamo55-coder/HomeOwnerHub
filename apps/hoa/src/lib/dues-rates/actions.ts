'use server'

// BL-137: the board adds or removes a dues rate on the schedule
// (dues_rates, migration 0069; M5_APPLIED).
//
// Board/admin only: every action re-checks the role first
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint. Writes go through the caller's own client, so RLS (board/admin
// of the org) is the second wall, and the 0069 triggers refuse another
// org's association or another association's budget (23503) and set
// created_by to the caller.
//
// A rate that has already started stays: bills were made at it. Only a
// rate that starts after today can be removed. One audit_log row per write
// (best effort), ids and amounts only.
//
// Flag off: nothing is read or written; the board is told why.

import { revalidatePath } from 'next/cache'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { DUES_RATES_NOT_LIVE, DUES_RATES_TABLE, validateRate, type RateInput } from './model'
import type { LooseDb } from './queries'

export type DuesRateActionResult = { ok: true; id?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function audit(
  db: LooseDb & { auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } },
  orgId: string,
  action: string,
  rateId: string,
  metadata: Record<string, unknown>,
) {
  try {
    const {
      data: { user },
    } = await db.auth.getUser()
    const { error } = await db.from('audit_log').insert({
      org_id: orgId,
      user_id: user?.id ?? null,
      action,
      entity_type: 'dues_rate',
      entity_id: rateId,
      metadata,
    })
    if (error) console.error('[dues-rates] audit failed', { rateId, code: error.code ?? null })
  } catch {
    console.error('[dues-rates] audit failed', { rateId, code: 'thrown' })
  }
}

export async function saveDuesRate(input: RateInput): Promise<DuesRateActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M5_APPLIED) return { ok: false, error: DUES_RATES_NOT_LIVE }

  const v = validateRate(input ?? ({} as RateInput))
  if (!v.ok) return { ok: false, error: 'Some fields need attention.', fieldErrors: v.fieldErrors }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'Set up an association first.' }

  const supabase = await getSupabaseServerClient()
  const db = supabase as unknown as Parameters<typeof audit>[0]
  const { data, error } = (await db
    .from(DUES_RATES_TABLE)
    .insert({
      organization_id: gate.orgId,
      association_id: assoc.id,
      effective_from: v.value.effectiveFrom,
      basis: 'per_home',
      amount_cents: v.value.amountCents,
      frequency: v.value.frequency,
      budget_id: v.value.budgetId,
      notes: v.value.notes,
    })
    .select('id')
    .single()) as { data: { id: string } | null; error: { code?: string } | null }
  if (error || !data) {
    const code = error?.code ?? 'no_row'
    console.error('[dues-rates] save failed', { associationId: assoc.id, code })
    if (code === '23505') return { ok: false, error: 'A rate already starts on that day.', fieldErrors: { effectiveFrom: 'A rate already starts on that day. Pick another day or remove that rate first.' } }
    if (code === '23503') return { ok: false, error: 'That budget isn’t part of your association.' }
    if (code === '42501') return { ok: false, error: BOARD_ONLY_DENIED }
    return { ok: false, error: 'Couldn’t save the rate. Try again.' }
  }

  await audit(db, gate.orgId, 'dues_rate.created', data.id, {
    association_id: assoc.id,
    effective_from: v.value.effectiveFrom,
    amount_cents: v.value.amountCents,
    frequency: v.value.frequency,
    budget_id: v.value.budgetId,
    actor_role: gate.role,
  })

  revalidatePath('/dues/rates')
  revalidatePath('/dues')
  return { ok: true, id: data.id }
}

export async function deleteDuesRate(rateId: string): Promise<DuesRateActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M5_APPLIED) return { ok: false, error: DUES_RATES_NOT_LIVE }
  if (typeof rateId !== 'string' || !UUID.test(rateId)) return { ok: false, error: 'That rate isn’t valid.' }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'Set up an association first.' }
  const today = todayIn(assoc.timeZone)

  const supabase = await getSupabaseServerClient()
  const db = supabase as unknown as Parameters<typeof audit>[0]
  const { data: row, error: readErr } = (await db
    .from(DUES_RATES_TABLE)
    .select('id, effective_from')
    .eq('id', rateId)
    .eq('association_id', assoc.id)
    .maybeSingle()) as { data: { id: string; effective_from: string } | null; error: { code?: string } | null }
  if (readErr) {
    console.error('[dues-rates] read before delete failed', { rateId, code: readErr.code ?? null })
    return { ok: false, error: 'Couldn’t load that rate. Try again.' }
  }
  if (!row) return { ok: false, error: 'That rate isn’t part of your association.' }
  if (row.effective_from <= today) {
    return { ok: false, error: 'This rate has already started, so it stays on the schedule. Add a new rate to change dues from a later day.' }
  }

  const { data, error } = (await db
    .from(DUES_RATES_TABLE)
    .delete()
    .eq('id', rateId)
    .eq('association_id', assoc.id)
    .select('id')) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
  if (error || !data || data.length === 0) {
    console.error('[dues-rates] delete failed', { rateId, code: error?.code ?? 'no_rows' })
    return { ok: false, error: 'Couldn’t remove the rate. Try again.' }
  }

  await audit(db, gate.orgId, 'dues_rate.deleted', rateId, {
    association_id: assoc.id,
    effective_from: row.effective_from,
    actor_role: gate.role,
  })

  revalidatePath('/dues/rates')
  revalidatePath('/dues')
  return { ok: true }
}
