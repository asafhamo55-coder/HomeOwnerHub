/**
 * BL-137 reads (dues_rates, migration 0069; M5_APPLIED).
 *
 * Flag off: returns [] WITHOUT touching the database — the table may not
 * exist yet. Flag on: reads with the caller's own client (board/admin RLS;
 * a resident would see only the current rate), scoped to the association.
 *
 * Not a server action (no 'use server'); called from server components and
 * server actions. Ids and error codes only in logs.
 */

import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { DUES_RATES_TABLE, DUES_RATE_COLUMNS, rateFromRow, sortRates, type DuesRate } from './model'

// dues_rates is not in the generated types until gen:types runs after prod
// has 0069 (CLAUDE.md footgun 3).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = { from: (table: string) => any }

/** The association's schedule, newest first. [] with the flag off; null on a failed read. */
export async function loadDuesRates(db: LooseDb, associationId: string, live: boolean = M5_APPLIED): Promise<DuesRate[] | null> {
  if (!live) return []
  const { data, error } = (await db
    .from(DUES_RATES_TABLE)
    .select(DUES_RATE_COLUMNS)
    .eq('association_id', associationId)
    .order('effective_from', { ascending: false })
    .range(0, 199)) as { data: Record<string, unknown>[] | null; error: { code?: string } | null }
  if (error) {
    console.error('[dues-rates] read failed', { associationId, code: error.code ?? null })
    return null
  }
  return sortRates((data ?? []).map(rateFromRow).filter((r): r is DuesRate => r !== null))
}
