'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readPrimaryAssociation } from '@/lib/association-setup'
import { requireBoardOrAdminForAction } from '../guard'
import { proposeOpeningCore, type ProposeOpeningResult } from './core'

/**
 * BL-126: send opening balances to /approvals. Board or admin only — the
 * gate runs before any client exists. The association is always the org's
 * PRIMARY one (the one the accounting pages show); the figures are rebuilt
 * on the server against the books, and nothing is posted here.
 */
export async function proposeOpeningBalances(raw: unknown): Promise<ProposeOpeningResult> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return { ok: false, error: gate.error }

  const supabase = await getSupabaseServerClient()
  const assoc = await readPrimaryAssociation(supabase, gate.orgId)
  if (!assoc.ok) return { ok: false, error: 'We couldn’t check your association just now. Try again.' }
  if (!assoc.data) return { ok: false, error: 'Your HOA has no association yet. Set one up first.' }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Service role only to INSERT the proposal: approval_requests has no
  // user write policy (0060), so a user can never edit what is approved.
  const res = await proposeOpeningCore(supabase, createAdminClient(), { orgId: gate.orgId, associationId: assoc.data.id, userId: user?.id ?? null }, raw)
  if (res.ok) {
    revalidatePath('/accounting/opening-balances')
    revalidatePath('/approvals')
    revalidatePath('/', 'layout')
  }
  return res
}
