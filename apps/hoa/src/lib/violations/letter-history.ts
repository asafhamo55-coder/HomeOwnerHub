// Server loader for the property page's "Letter history" card.
// Same queries and org scoping as violations/[id]/page.tsx: the home's
// violations by org_id and property_id, then the W3 follow-up runs for them
// (ai_runs is org-scoped by organization_id and readable by board users).

import { FOLLOW_UP_AWAITING_SAVE_PATH } from '../violation-follow-up'
import { loadOrFail, type LoadResult } from '../load-or-fail'
import { buildLetterHistory, type HistoryRun, type HistoryViolation, type LetterHistoryRow } from './letter-history-core'

export interface LetterHistoryPage {
  rows: LetterHistoryRow[]
  total: number
  hasMore: boolean
}

const MAX_VIOLATIONS = 200
const MAX_RUNS = 500

export async function loadLetterHistory(
  db: unknown,
  opts: { orgId: string; propertyId: string; limit?: number; offset?: number },
): Promise<LoadResult<LetterHistoryPage>> {
  const supabase = db as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const limit = Math.max(1, opts.limit ?? 20)
  const offset = Math.max(0, opts.offset ?? 0)

  const vres = await loadOrFail<HistoryViolation[]>(
    'letter history violations',
    supabase
      .from('hoa_violations')
      .select('id, description, violation_type, notice_sent_at, approved_at')
      .eq('org_id', opts.orgId)
      .eq('property_id', opts.propertyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(0, MAX_VIOLATIONS - 1),
  )
  if (!vres.ok) return { ok: false }
  const violations = vres.data ?? []

  let runs: HistoryRun[] = []
  if (violations.length > 0) {
    const rres = await loadOrFail<HistoryRun[]>(
      'letter history follow-ups',
      supabase
        .from('ai_runs')
        .select('id, human_approved, approved_at, created_at, input')
        .eq('organization_id', opts.orgId)
        .eq('workflow_id', 'W3')
        .in('input->followUp->>violationId', violations.map((v) => v.id))
        .is(FOLLOW_UP_AWAITING_SAVE_PATH, null)
        .order('created_at', { ascending: false })
        .range(0, MAX_RUNS - 1),
    )
    if (!rres.ok) return { ok: false }
    runs = rres.data ?? []
  }

  const all = buildLetterHistory(violations, runs)
  const rows = all.slice(offset, offset + limit)
  return { ok: true, data: { rows, total: all.length, hasMore: offset + rows.length < all.length }, count: null }
}
