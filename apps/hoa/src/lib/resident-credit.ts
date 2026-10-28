// Credit on account for the resident Dues and Pay screens (backlog round-8 #1).
//
// Read with the actor's client: migration 0072's unapplied_credits_resident_select
// policy limits a resident to rows whose unit_id is in auth_resident_unit_ids(),
// so RLS (not the unit filter here) keeps a neighbour's credit out. The unit
// filter is a narrowing. No 'use server', no Next imports.
//
// Informational only: nothing here reduces what the resident is asked to pay.
// The board applies a credit to a charge (apply_unapplied_credit); checkout
// has no credit-application path.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { loadUnappliedCredits } from './resident-ledger'

export interface ResidentCredit {
  /** Total unapplied credit across the resident's own units, in dollars. */
  total: number
  /** Unit ids that carry a credit. */
  unitIds: string[]
}

/**
 * The resident's credit on account, or null when there is nothing to show:
 * zero credit, M7 not applied (no query is made), or a failed read. A failed
 * read hides the card; it never throws and never blocks the page.
 */
export async function loadResidentCredit(
  db: SupabaseClient<Database>,
  unitIds: string[],
  orgId: string | null,
): Promise<ResidentCredit | null> {
  try {
    const res = await loadUnappliedCredits(db, unitIds, orgId)
    if (!res.ok) return null
    const own = new Set(unitIds)
    const mine = res.credits.filter((c) => own.has(c.unit_id) && Number.isFinite(c.remaining) && c.remaining > 0)
    const cents = mine.reduce((sum, c) => sum + Math.round(c.remaining * 100), 0)
    if (cents <= 0) return null
    return { total: cents / 100, unitIds: [...new Set(mine.map((c) => c.unit_id))] }
  } catch {
    return null
  }
}
