import type { SupabaseClient } from '@supabase/supabase-js'
import { readAll, readAllResult } from '@/lib/supabase/read-all'
import type { PropertyListParams } from './list-params'
import { isIncompleteRecord, matchesSearch, selectPropertyView, type PropertyFilterCounts } from './list-view'
import { readListSignals, type ActivityKind } from './list-signals'
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
  /** Open ARC applications (list-signals.ts). Null = that read failed. */
  openArc: number | null
  /** Newest dated row at the home in the last year. Null = none, or unknown. */
  lastActivityAt: string | null
  lastActivityKind: ActivityKind | null
}

export interface PropertyListResult {
  rows: PropertyListRow[]
  /** Rows matching the filter and search, across all pages. */
  total: number
  /** Every filter's count for the same search, so the chips describe what
   *  the search found rather than the whole association. */
  counts: PropertyFilterCounts
  /** Homes in the association, unsearched and unfiltered (same read). */
  allCount: number
  /** False when open ARC / last activity could not be read: those columns
   *  say "Couldn't load" and every other column is unaffected. */
  signalsOk: boolean
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
 * Every home in the org matching `search`, read to the end past
 * PostgREST's 1000-row cap. Throws on any failed page; never a partial
 * roster.
 *
 * The search runs here, in JS, over the whole roster (list-view.ts
 * matchesSearch): address, unit, owner name, email and phone (digits
 * only, so any punctuation finds it), plus any current resident's name,
 * email or phone. PostgREST's `ilike` can't strip a phone's punctuation
 * and can't reach residents from the view, and the roster is hundreds of
 * rows, so reading it whole is cheap — and it gives the association's
 * true size from the same read (no second count query).
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
  const { matching } = await readPropertyRoster(supabase, orgId, search, opts)
  return matching
}

async function readPropertyRoster(
  supabase: SupabaseClient,
  orgId: string,
  search: string,
  opts: { recordFields?: boolean } = {},
): Promise<{ all: PropertyRecordRow[] | PropertyListRow[]; matching: PropertyRecordRow[] | PropertyListRow[] }> {
  const columns = opts.recordFields ? `${LIST_COLUMNS}, notes, created_at, updated_at` : LIST_COLUMNS
  const term = search.trim().slice(0, 100)
  const [roster, residentHits] = await Promise.all([
    readAllResult<Record<string, unknown>>((from, to) =>
      supabase
        .from(VIEW as never)
        .select(columns)
        .eq('org_id' as never, orgId)
        // `id` keeps pages from overlapping; display order is list-view's job.
        .order('id' as never, { ascending: true })
        .range(from, to) as unknown as PageResult,
    ),
    term ? residentMatches(supabase, orgId, term) : Promise.resolve(new Set<string>()),
  ])
  if (roster.error) throw new Error(roster.error.message ?? 'property list read failed')
  const raw = roster.data ?? []
  const all = opts.recordFields
    ? raw.map((r) => ({
        ...toRow(r),
        notes: (r.notes as string | null) ?? null,
        createdAt: (r.created_at as string | null) ?? null,
        updatedAt: (r.updated_at as string | null) ?? null,
      }))
    : raw.map(toRow)
  const matching = term ? all.filter((r) => matchesSearch(r, term, residentHits)) : all
  return { all, matching }
}

/** Homes with a CURRENT resident whose name, email or phone matches. */
async function residentMatches(supabase: SupabaseClient, orgId: string, term: string): Promise<Set<string>> {
  const rows = await readAll<{ id: string; property_id: string; full_name: string; email: string | null; phone: string | null }>(
    (from, to) =>
      supabase
        .from('property_residents' as never)
        .select('id, property_id, full_name, email, phone')
        .eq('organization_id' as never, orgId)
        .is('deleted_at' as never, null)
        .is('moved_out_at' as never, null)
        .order('id' as never, { ascending: true })
        .range(from, to) as unknown as PromiseLike<never>,
    (e) => new Error(`resident search read failed (${e.code ?? 'no code'})`),
  )
  const hits = new Set<string>()
  for (const r of rows) {
    const asRow = { id: r.property_id, address: r.full_name, unitNumber: null, ownerName: null, ownerEmail: r.email, ownerPhone: r.phone }
    if (matchesSearch(asRow, term, new Set())) hits.add(r.property_id)
  }
  return hits
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
    // Filled in by listProperties from list-signals.ts.
    openArc: null,
    lastActivityAt: null,
    lastActivityKind: null,
  }
}

/**
 * One roster read drives the page, the total, every chip count and the
 * association size; the ARC / activity signals are read alongside it, in
 * parallel. A failed signal read degrades those two columns only.
 */
export async function listProperties(
  supabase: SupabaseClient,
  orgId: string,
  params: PropertyListParams,
  now: Date = new Date(),
): Promise<PropertyListResult> {
  const [roster, signals] = await Promise.all([
    readPropertyRoster(supabase, orgId, params.search),
    readListSignals(supabase, orgId, now).catch((e: unknown) => {
      // Message only: it carries a table name and an error code, never row values.
      console.error('listProperties: list signals failed', { message: e instanceof Error ? e.message : String(e) })
      return null
    }),
  ])
  const rows = (roster.matching as PropertyListRow[]).map((r) => {
    if (!signals) return r
    const s = signals.get(r.id)
    return { ...r, openArc: s?.openArc ?? 0, lastActivityAt: s?.lastActivityAt ?? null, lastActivityKind: s?.lastActivityKind ?? null }
  })
  return { ...selectPropertyView(rows, params), allCount: roster.all.length, signalsOk: signals !== null }
}
