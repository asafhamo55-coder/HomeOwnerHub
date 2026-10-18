'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readPrimaryAssociation } from '@/lib/association-setup'
import { todayIn } from '@/lib/association-time'
import { requireBoardOrAdminForAction } from './guard'
import { OPEN_YEAR_ADMIN_ONLY, openNextFiscalYearCore, type OpenNextFiscalYearResult } from './open-next-fiscal-year'

/**
 * BL-076: "Open next fiscal year" on Fiscal periods and on the budget draft.
 * Admin only, like the other book-setup actions (create the association,
 * Open the books): the board gate refuses residents, then a board member is
 * refused too, before any read. Always the org's PRIMARY association (the
 * one the accounting pages show); nothing is taken from the client.
 */
export async function openNextFiscalYear(): Promise<OpenNextFiscalYearResult> {
  const gate = await requireBoardOrAdminForAction(OPEN_YEAR_ADMIN_ONLY)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (gate.role !== 'admin') return { ok: false, error: OPEN_YEAR_ADMIN_ONLY }

  const supabase = await getSupabaseServerClient()
  const assoc = await readPrimaryAssociation(supabase, gate.orgId)
  if (!assoc.ok) return { ok: false, error: 'We couldn’t check your association just now. Try again.' }
  if (!assoc.data) return { ok: false, error: 'Your HOA has no association yet. Set one up first.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const res = await openNextFiscalYearCore(supabase, {
    orgId: gate.orgId,
    associationId: assoc.data.id,
    userId: user?.id ?? null,
    // "Next" is relative to the association's day, not the server's.
    today: todayIn(assoc.data.timeZone),
  })
  if (res.ok && res.created > 0) revalidatePath('/accounting', 'layout')
  return res
}
