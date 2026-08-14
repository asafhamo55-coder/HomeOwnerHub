import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeSearch, type PropertyListParams } from './list-params'

export interface PropertyListRow {
  id: string
  address: string
  unitNumber: string | null
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  tenure: 'owner_occupied' | 'leased' | 'unknown' | null
  unitId: string | null
  balance: number
  oldestDueDate: string | null
  daysOverdue: number
  openViolations: number
  violationsPastCure: number
  threadsNeedingReply: number
  hasOwner: boolean
  hasTenure: boolean
  hasUnitLink: boolean
  severityRank: number
  /** Ranks 1-4 — something a person must act on. Not `severityRank < 6`:
   *  that also sweeps in rank 5, missing data, which is most of the org. */
  needsAttention: boolean
  /** Missing owner, tenure or unit link. Independent of needsAttention —
   *  a property can be both. */
  isIncomplete: boolean
}

export interface PropertyListResult {
  rows: PropertyListRow[]
  total: number
}

// The view is new in 0039 and is not in the generated Database types until
// the next `supabase gen types` pass, so the table name and column
// references are cast. Drop the casts once types are regenerated —
// aa78fc1 did exactly that for 0037's tables.
const VIEW = 'hoa_property_list_v'

export async function listProperties(
  supabase: SupabaseClient,
  orgId: string,
  params: PropertyListParams,
): Promise<PropertyListResult> {
  let query = supabase
    .from(VIEW as never)
    .select(
      'id, address, unit_number, owner_name, owner_email, owner_phone, tenure, unit_id, balance, oldest_due_date, days_overdue, open_violations, violations_past_cure, threads_needing_reply, has_owner, has_tenure, has_unit_link, severity_rank, needs_attention, is_incomplete',
      { count: 'exact' },
    )
    .eq('org_id' as never, orgId)

  // 'attention' is the work queue: a violation, a past-due balance, or mail
  // awaiting reply. This was `severity_rank < 6`, which also selected rank
  // 5 (missing data) — 116 of 184 properties on live data, so the filter
  // returned 71% of the association and the 15 rows that needed a human
  // were buried in data-entry backlog. Missing data now has its own filter.
  if (params.filter === 'attention') {
    query = query.eq('needs_attention' as never, true)
  } else if (params.filter === 'incomplete') {
    query = query.eq('is_incomplete' as never, true)
  } else if (params.filter === 'unknown') {
    // `tenure` is nullable — a property whose tenure was never recorded has
    // NULL, not the string 'unknown'. `.eq('tenure','unknown')` would
    // silently hide exactly the properties this filter exists to surface,
    // which is also how `has_tenure` is defined in the view.
    query = query.or('tenure.is.null,tenure.eq.unknown')
  } else if (params.filter !== 'all') {
    query = query.eq('tenure' as never, params.filter)
  }

  if (params.search.length > 0) {
    const safe = sanitizeSearch(params.search)
    query = query.or(
      `address.ilike.%${safe}%,unit_number.ilike.%${safe}%,owner_name.ilike.%${safe}%,owner_email.ilike.%${safe}%`,
    )
  }

  // severity_rank ascending puts the worst first; address is the tiebreak
  // in every mode so ordering is stable across pages.
  if (params.sort === 'severity') {
    query = query
      .order('severity_rank' as never, { ascending: true })
      .order('address' as never, { ascending: true })
  } else if (params.sort === 'balance') {
    query = query
      .order('balance' as never, { ascending: false })
      .order('address' as never, { ascending: true })
  } else {
    query = query.order('address' as never, { ascending: true })
  }

  const { data, error, count } = await query.range(
    params.offset,
    params.offset + params.limit - 1,
  )

  if (error) throw new Error(error.message)

  const raw = (data ?? []) as unknown as Array<Record<string, unknown>>

  return {
    rows: raw.map((r) => ({
      id: String(r.id),
      address: String(r.address ?? ''),
      unitNumber: (r.unit_number as string | null) ?? null,
      ownerName: (r.owner_name as string | null) ?? null,
      ownerEmail: (r.owner_email as string | null) ?? null,
      ownerPhone: (r.owner_phone as string | null) ?? null,
      tenure: (r.tenure as PropertyListRow['tenure']) ?? null,
      unitId: (r.unit_id as string | null) ?? null,
      balance: Number(r.balance ?? 0),
      oldestDueDate: (r.oldest_due_date as string | null) ?? null,
      daysOverdue: Number(r.days_overdue ?? 0),
      openViolations: Number(r.open_violations ?? 0),
      violationsPastCure: Number(r.violations_past_cure ?? 0),
      threadsNeedingReply: Number(r.threads_needing_reply ?? 0),
      hasOwner: Boolean(r.has_owner),
      hasTenure: Boolean(r.has_tenure),
      hasUnitLink: Boolean(r.has_unit_link),
      severityRank: Number(r.severity_rank ?? 6),
      needsAttention: Boolean(r.needs_attention),
      isIncomplete: Boolean(r.is_incomplete),
    })),
    total: count ?? 0,
  }
}
