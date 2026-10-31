'use server'

// The wizard's "This home has N earlier violations" line. Read-only: board
// and admin only, org-scoped from the session, and it returns counts, never
// rows, so no description or owner detail crosses to the browser.

import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { parsePropertyParam } from '@/lib/property-scope'
import { countEarlier, type EarlierCounts } from './earlier-core'
import { loadEarlierViolations } from './earlier'

export type EarlierCountsResult = ({ ok: true } & EarlierCounts) | { ok: false }

export async function loadEarlierViolationCounts(propertyId: string): Promise<EarlierCountsResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false }
  const id = parsePropertyParam(propertyId)
  if (!id) return { ok: false }
  const supabase = await getSupabaseServerClient()
  const res = await loadEarlierViolations(supabase, { orgId: gate.orgId, propertyId: id })
  if (!res.ok) return { ok: false }
  return { ok: true, ...countEarlier(res.data) }
}
