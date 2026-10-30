import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllResult } from '@/lib/supabase/read-all'

/**
 * Every live violation's status (plus the notice date and cure days), for the
 * /violations filter-chip counts and summary strip.
 *
 * Paged to the end (BL-047): a single read stopped at PostgREST's 1000-row
 * cap, so "All (1000)" at an association with more. Resolves `{ data,
 * error }` for `loadOrFail`; any failed page is an error, never a partial
 * list, so the chips hide their counts rather than show smaller ones.
 */
export function readViolationStatusRows(db: SupabaseClient, orgId: string, propertyId: string | null = null) {
  return readAllResult<{ id: string; status: string; notice_sent_at: string | null; cure_period_days: number | null }>((from, to) => {
    let q = db.from('hoa_violations').select('id, status, notice_sent_at, cure_period_days').eq('org_id', orgId).is('deleted_at', null)
    // `?property=` on /violations: the chips count that home only.
    if (propertyId) q = q.eq('property_id', propertyId)
    return q.order('id', { ascending: true }).range(from, to) as never
  })
}
