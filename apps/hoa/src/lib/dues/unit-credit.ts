import type { SupabaseClient } from '@supabase/supabase-js'
import { loadUnappliedCredits } from '@/lib/resident-ledger'

/**
 * Round-8 #4: unapplied credit per unit for the board's /dues list.
 *
 * ONE batched read for every distinct unit on the page (never per row), gated
 * by M7_APPLIED inside loadUnappliedCredits. A failed read returns an empty
 * map so the badges simply do not render; the page never breaks.
 */
export async function loadCreditByUnit(db: SupabaseClient, unitIds: Array<string | null | undefined>): Promise<Map<string, number>> {
  const ids = Array.from(new Set(unitIds.filter((x): x is string => !!x)))
  const out = new Map<string, number>()
  if (ids.length === 0) return out
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await loadUnappliedCredits(db as any, ids)
    if (!res.ok) return out
    for (const c of res.credits) {
      if (!(c.remaining > 0)) continue
      out.set(c.unit_id, (out.get(c.unit_id) ?? 0) + c.remaining)
    }
  } catch {
    return new Map()
  }
  return out
}
