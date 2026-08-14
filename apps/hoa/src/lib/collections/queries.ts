import type { SupabaseClient } from '@supabase/supabase-js'
import type { CollectionEventType, CollectionStatus } from './statuses'

/**
 * Reads for the collections system of record.
 *
 * Takes an injected client rather than calling getSupabaseServerClient()
 * itself, so callers on the user-bound client keep RLS (board/admin only,
 * per 0047) and so this module stays free of Next imports.
 */

export interface CollectionCase {
  id: string
  unitId: string
  status: CollectionStatus
  attorneyFirm: string | null
  attorneyReference: string | null
  openedOn: string
  closedOn: string | null
  closedReason: string | null
}

export interface CollectionEvent {
  id: string
  eventType: CollectionEventType
  occurredOn: string
  note: string | null
  amount: number | null
  actorInitials: string | null
  communicationId: string | null
  createdAt: string
}

const CASE_COLUMNS =
  'id, unit_id, status, attorney_firm, attorney_reference, opened_on, closed_on, closed_reason'

const EVENT_COLUMNS =
  'id, event_type, occurred_on, note, amount, actor_initials, communication_id, created_at'

function toCase(r: Record<string, unknown>): CollectionCase {
  return {
    id: String(r.id),
    unitId: String(r.unit_id),
    status: r.status as CollectionStatus,
    attorneyFirm: (r.attorney_firm as string | null) ?? null,
    attorneyReference: (r.attorney_reference as string | null) ?? null,
    openedOn: String(r.opened_on),
    closedOn: (r.closed_on as string | null) ?? null,
    closedReason: (r.closed_reason as string | null) ?? null,
  }
}

/**
 * The live case for a unit, or null.
 *
 * "Live" means not soft-deleted and not terminal — the same predicate as
 * the `collection_cases_one_open_per_unit_idx` partial unique index, which
 * is what guarantees this returns at most one row. Closed cases are history
 * and are read through listCases instead.
 *
 * Throws on a query error rather than returning null: a failed read and
 * "this property has no collections case" are very different facts, and
 * collapsing them would make a broken query look like a clean account.
 */
export async function getOpenCaseForUnit(
  supabase: SupabaseClient,
  unitId: string,
): Promise<CollectionCase | null> {
  const { data, error } = await supabase
    .from('collection_cases')
    .select(CASE_COLUMNS)
    .eq('unit_id', unitId)
    .is('deleted_at', null)
    .not('status', 'in', '("resolved","written_off")')
    .maybeSingle()

  if (error) throw new Error(`collections: open case lookup failed: ${error.message}`)
  return data ? toCase(data as Record<string, unknown>) : null
}

/** Every case for a unit, newest first — open and closed. */
export async function listCasesForUnit(
  supabase: SupabaseClient,
  unitId: string,
): Promise<CollectionCase[]> {
  const { data, error } = await supabase
    .from('collection_cases')
    .select(CASE_COLUMNS)
    .eq('unit_id', unitId)
    .is('deleted_at', null)
    .order('opened_on', { ascending: false })

  if (error) throw new Error(`collections: case list failed: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(toCase)
}

/**
 * The dated trail for a case, newest first.
 *
 * Ordered by occurred_on then created_at: occurred_on is the action date a
 * human typed and several events routinely share one, so created_at breaks
 * the tie and keeps paging stable. Matches
 * collection_events_case_occurred_idx.
 */
export async function listEventsForCase(
  supabase: SupabaseClient,
  caseId: string,
  limit = 100,
): Promise<CollectionEvent[]> {
  const { data, error } = await supabase
    .from('collection_events')
    .select(EVENT_COLUMNS)
    .eq('collection_case_id', caseId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`collections: event list failed: ${error.message}`)

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    eventType: r.event_type as CollectionEventType,
    occurredOn: String(r.occurred_on),
    note: (r.note as string | null) ?? null,
    // numeric(12,2) arrives as a string over PostgREST; Number() here keeps
    // the boundary in one place rather than in every consumer.
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    actorInitials: (r.actor_initials as string | null) ?? null,
    communicationId: (r.communication_id as string | null) ?? null,
    createdAt: String(r.created_at),
  }))
}

/**
 * Open-case status for many units at once, for list surfaces.
 *
 * One round trip rather than one per row — the properties list and the dues
 * WhoOwesPanel both render tens of rows and would otherwise fan out.
 */
export async function getOpenCaseStatusByUnit(
  supabase: SupabaseClient,
  unitIds: string[],
): Promise<Map<string, CollectionStatus>> {
  const out = new Map<string, CollectionStatus>()
  if (unitIds.length === 0) return out

  const { data, error } = await supabase
    .from('collection_cases')
    .select('unit_id, status')
    .in('unit_id', unitIds)
    .is('deleted_at', null)
    .not('status', 'in', '("resolved","written_off")')

  if (error) throw new Error(`collections: status lookup failed: ${error.message}`)

  for (const r of (data ?? []) as Array<{ unit_id: string; status: string }>) {
    out.set(r.unit_id, r.status as CollectionStatus)
  }
  return out
}
