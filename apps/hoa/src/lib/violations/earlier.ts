// Server loader for "Earlier violations at this home": the home's violations
// in the current org, optionally minus the one being viewed. Same table and
// filters as the property page's violations read (property-360.ts); a failed
// read comes back as { ok: false } so callers render LoadFailed.

import { loadOrFail, type LoadResult } from '../load-or-fail'
import { readAllResult } from '../supabase/read-all'
import type { EarlierViolation } from './earlier-core'

export async function loadEarlierViolations(
  db: unknown,
  opts: { orgId: string; propertyId: string; excludeId?: string },
): Promise<LoadResult<EarlierViolation[]>> {
  const supabase = db as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  return loadOrFail<EarlierViolation[]>(
    'earlier violations',
    readAllResult<EarlierViolation>((from, to) => {
      let q = supabase
        .from('hoa_violations')
        .select('id, violation_type, status, created_at, fine_amount')
        .eq('org_id', opts.orgId)
        .eq('property_id', opts.propertyId)
        .is('deleted_at', null)
      if (opts.excludeId) q = q.neq('id', opts.excludeId)
      return q.order('id', { ascending: true }).range(from, to)
    }),
  )
}
