'use server'

// BL-138: the budget adoption kit's one write — link the adoption meeting,
// flag special assessments, record the adoption date, or record when the
// owner budget notice went out. Storage and signing: ./store.ts.
//
// Board/admin only: every call re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint. The budget must be the caller's primary association's and the
// meeting the caller's org's. Nothing is sent to anyone.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { todayIn } from '@/lib/association-time'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { readAdoptionAssociation, readMeeting, type LooseDb } from './load'
import type { AdoptionRecord } from './model'
import { UUID, isValidDay, readAdoption, signAdoption, withAdoption } from './store'

export type AdoptionChange =
  | { kind: 'meeting'; meetingId: string | null }
  | { kind: 'special'; value: boolean }
  | { kind: 'adopted'; on: string | null }
  | { kind: 'owner_notice'; on: string | null }

export type UpdateAdoptionResult = { ok: true; record: AdoptionRecord } | { ok: false; error: string }

function validChange(c: unknown): c is AdoptionChange {
  if (typeof c !== 'object' || c === null) return false
  const v = c as Record<string, unknown>
  switch (v.kind) {
    case 'meeting':
      return v.meetingId === null || (typeof v.meetingId === 'string' && UUID.test(v.meetingId))
    case 'special':
      return typeof v.value === 'boolean'
    case 'adopted':
    case 'owner_notice':
      return v.on === null || isValidDay(v.on)
    default:
      return false
  }
}

export async function updateBudgetAdoption(budgetId: string, change: AdoptionChange): Promise<UpdateAdoptionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof budgetId !== 'string' || !UUID.test(budgetId) || !validChange(change)) {
    return { ok: false, error: 'Invalid input.' }
  }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'The adoption kit can’t be saved on this server yet. Contact support.' }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'Set up an association first.' }
  const today = todayIn(assoc.timeZone)

  const supabase = await getSupabaseServerClient()
  const db = supabase as unknown as LooseDb
  const { data: budget, error: budgetErr } = await db
    .from('budgets')
    .select('id, status')
    .eq('id', budgetId)
    .eq('association_id', assoc.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (budgetErr) {
    console.error('[budget-adoption] budget read failed', { code: budgetErr.code ?? 'unknown' })
    return { ok: false, error: 'Couldn’t load this budget. Try again.' }
  }
  if (!budget) return { ok: false, error: 'That budget isn’t part of your association.' }
  const status = (budget as { status: string }).status

  if (change.kind === 'meeting' && change.meetingId) {
    const m = await readMeeting(db, gate.orgId, change.meetingId)
    if (!m.ok) return { ok: false, error: 'Couldn’t check that meeting. Try again.' }
    if (!m.meeting) return { ok: false, error: 'That meeting isn’t part of your organization.' }
  }
  if ((change.kind === 'adopted' || change.kind === 'owner_notice') && change.on !== null) {
    if (status !== 'approved') return { ok: false, error: 'Approve the budget first.' }
    if (change.on > today) return { ok: false, error: 'The date can’t be in the future.' }
  }

  const a = await readAdoptionAssociation(db, assoc.id)
  if (!a.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  if (!a.row) return { ok: false, error: 'Set up an association first.' }

  // An unverified record reads as empty, so this write replaces it.
  const current = readAdoption(assoc.id, budgetId, a.row.compliance_settings, secret).record
  const next: AdoptionRecord =
    change.kind === 'meeting'
      ? { ...current, meetingId: change.meetingId }
      : change.kind === 'special'
        ? { ...current, special: change.value }
        : change.kind === 'adopted'
          ? { ...current, adoptedOn: change.on }
          : { ...current, ownerNoticeOn: change.on }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  let stored
  try {
    stored = signAdoption(assoc.id, budgetId, next, { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null }, secret)
  } catch {
    return { ok: false, error: 'Invalid input.' }
  }
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withAdoption(a.row.compliance_settings, budgetId, stored) as never })
    .eq('id', assoc.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[budget-adoption] save failed', { code: error?.code ?? 'no_rows', budgetId })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }

  revalidatePath(`/accounting/budget/${budgetId}`)
  revalidatePath('/')
  return { ok: true, record: next }
}
