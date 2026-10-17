import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllResult } from '@/lib/supabase/read-all'
import { sanitizeSearch, type PropertyListParams } from './list-params'
import { isIncompleteRecord, selectPropertyView, type PropertyFilterCounts } from './list-view'
import { effectiveSeverityRank } from './severity'

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
  /** Missing owner or tenure (not the unit link — see list-view.ts).
   *  Independent of needsAttention; a property can be both. */
  isIncomplete: boolean
  /** Holds an open ('waiting') lease_waiting_list entry. Added to the view
   *  in 0051 rather than looked up per page, because the filter must cover
   *  the whole roster, not the ~50 visible rows. */
  onWaitingList: boolean
}

export interface PropertyListResult {
  rows: PropertyListRow[]
  /** Rows matching the filter and search, across all pages. */
  total: number
  /** Every filter's count for the same search, so the chips describe what
   *  the search found rather than the whole association. */
  counts: PropertyFilterCounts
}

// The view is new in 0039 and is not in the generated Database types until
// the next `supabase gen types` pass, so the table name and column
// references are cast. Drop the casts once types are regenerated —
// aa78fc1 did exactly that for 0037's tables.
const VIEW = 'hoa_property_list_v'

const LIST_COLUMNS =
  'id, address, unit_number, owner_name, owner_email, owner_phone, tenure, unit_id, balance, oldest_due_date, days_overdue, open_violations, violations_past_cure, threads_needing_reply, has_owner, has_tenure, has_unit_link, severity_rank, needs_attention, on_waiting_list'

export interface PropertyRecordRow extends PropertyListRow {
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
}

type PageResult = PromiseLike<{
  data: Record<string, unknown>[] | null
  error: { code?: string; message?: string } | null
}>

/**
 * Every home in the org matching `search` (address, unit, owner name or
 * email), read to the end past PostgREST's 1000-row cap. Filtering,
 * counting, natural-order sorting and paging happen in list-view.ts — see
 * the note there for why. Throws on any failed page; never a partial
 * roster.
 */
export async function readPropertyRows(
  supabase: SupabaseClient,
  orgId: string,
  search: string,
): Promise<PropertyListRow[]>
export async function readPropertyRows(
  supabase: SupabaseClient,
  orgId: string,
  search: string,
  opts: { recordFields: true },
): Promise<PropertyRecordRow[]>
export async function readPropertyRows(
  supabase: SupabaseClient,
  orgId: string,
  search: string,
  opts: { recordFields?: boolean } = {},
): Promise<PropertyListRow[] | PropertyRecordRow[]> {
  const columns = opts.recordFields ? `${LIST_COLUMNS}, notes, created_at, updated_at` : LIST_COLUMNS
  const safe = search.length > 0 ? sanitizeSearch(search) : ''
  const { data, error } = await readAllResult<Record<string, unknown>>((from, to) => {
    let query = supabase
      .from(VIEW as never)
      .select(columns)
      .eq('org_id' as never, orgId)
    if (safe) {
      query = query.or(
        `address.ilike.%${safe}%,unit_number.ilike.%${safe}%,owner_name.ilike.%${safe}%,owner_email.ilike.%${safe}%`,
      )
    }
    // `id` keeps pages from overlapping; display order is list-view's job.
    return query.order('id' as never, { ascending: true }).range(from, to) as unknown as PageResult
  })
  if (error) throw new Error(error.message ?? 'property list read failed')
  const raw = data ?? []
  if (!opts.recordFields) return raw.map(toRow)
  return raw.map((r) => ({
    ...toRow(r),
    notes: (r.notes as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
  }))
}

function toRow(r: Record<string, unknown>): PropertyListRow {
  const hasOwner = Boolean(r.has_owner)
  const hasTenure = Boolean(r.has_tenure)
  return {
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
    hasOwner,
    hasTenure,
    hasUnitLink: Boolean(r.has_unit_link),
    severityRank: effectiveSeverityRank(Number(r.severity_rank ?? 6), { hasOwner, hasTenure }),
    needsAttention: Boolean(r.needs_attention),
    // Recomputed rather than read from the view's is_incomplete, which also
    // counts the unit link (see list-view.ts).
    isIncomplete: isIncompleteRecord({ hasOwner, hasTenure }),
    onWaitingList: Boolean(r.on_waiting_list),
  }
}

/** One read drives the page, the total and every chip count. */
export async function listProperties(
  supabase: SupabaseClient,
  orgId: string,
  params: PropertyListParams,
): Promise<PropertyListResult> {
  const rows = await readPropertyRows(supabase, orgId, params.search)
  return selectPropertyView(rows, params)
}
