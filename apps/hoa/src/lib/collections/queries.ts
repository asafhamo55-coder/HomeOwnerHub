import type { SupabaseClient } from '@supabase/supabase-js'
import { M7_APPLIED } from '@homeowner-portal/db/m7'
import type { CollectionEventType, CollectionStatus } from './statuses'
import type { MailMethod, MailRecord } from './mail-tracking'
import { readAll, chunk } from '@/lib/supabase/read-all'
import { asPropertyId, asUnitId, propertyIdsForUnits } from '@/lib/properties/resolve'
import { latestMailDelivery, sortOpenCases, withDays, type OpenCaseInput, type OpenCaseRow } from './open-cases'

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
  /** BL-166 (M7_APPLIED): present only when the mail columns were read. */
  mailMethod?: MailMethod | null
  trackingNumber?: string | null
  mailedOn?: string | null
  deliveredOn?: string | null
  /** The earlier event this one delivers (a delivery event), or null. */
  deliveryForEventId?: string | null
}

export const CASE_COLUMNS =
  'id, unit_id, status, attorney_firm, attorney_reference, opened_on, closed_on, closed_reason'

export const EVENT_COLUMNS =
  'id, event_type, occurred_on, note, amount, actor_initials, communication_id, created_at'

/** BL-166: columns 0072 adds. Read only after M7_APPLIED (before it they do not exist). */
export const MAIL_EVENT_COLUMNS = 'mail_method, tracking_number, mailed_on, delivered_on, delivery_for_event_id'

/** The event columns to select: the mail columns join them once 0072 is applied. */
export function eventColumns(): string {
  return M7_APPLIED ? `${EVENT_COLUMNS}, ${MAIL_EVENT_COLUMNS}` : EVENT_COLUMNS
}

export function toCase(r: Record<string, unknown>): CollectionCase {
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
    .select(eventColumns())
    .eq('collection_case_id', caseId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`collections: event list failed: ${error.message}`)

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEvent)
}

/** A collection_events row (EVENT_COLUMNS) in the shape the UI reads. */
export function toEvent(r: Record<string, unknown>): CollectionEvent {
  return {
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
    ...('mail_method' in r
      ? {
          mailMethod: (r.mail_method as MailMethod | null) ?? null,
          trackingNumber: (r.tracking_number as string | null) ?? null,
          mailedOn: (r.mailed_on as string | null) ?? null,
          deliveredOn: (r.delivered_on as string | null) ?? null,
          deliveryForEventId: (r.delivery_for_event_id as string | null) ?? null,
        }
      : {}),
  }
}

/** Newest first, as listEventsForCase orders them (occurred_on, then created_at). */
export function sortEventsNewestFirst(events: CollectionEvent[]): CollectionEvent[] {
  return [...events].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt))
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

export interface OpenCasesPage {
  rows: OpenCaseRow[]
  /** Every open case in the org, before the page slice. */
  total: number
}

/**
 * Every open case in an org for the board overview, longest since the last
 * event first, then sliced to one page.
 *
 * Org-scoped on collection_cases.organization_id (and RLS on top). The sort
 * key is derived from events, so the whole open set is read, sorted, and
 * only then cut to `limit`/`offset`; open cases are few, and each read goes
 * through readAll so nothing is capped at 1000. Throws on any failed read.
 */
export async function listOpenCases(
  supabase: SupabaseClient,
  orgId: string,
  today: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<OpenCasesPage> {
  const { limit = 50, offset = 0 } = opts
  const fail = (what: string) => (e: { message?: string }) => new Error(`collections: ${what} failed: ${e.message ?? 'unknown'}`)

  const cases = await readAll<Record<string, unknown>>(
    (from, to) =>
      supabase
        .from('collection_cases')
        .select(CASE_COLUMNS)
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .not('status', 'in', '("resolved","written_off")')
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
    fail('open case list'),
  )
  if (cases.length === 0) return { rows: [], total: 0 }

  const eventCols = M7_APPLIED
    ? `collection_case_id, event_type, occurred_on, created_at, ${MAIL_EVENT_COLUMNS}`
    : 'collection_case_id, event_type, occurred_on, created_at'
  const events: Record<string, unknown>[] = []
  for (const ids of chunk(cases.map((c) => String(c.id)))) {
    events.push(
      ...(await readAll<Record<string, unknown>>(
        (from, to) =>
          supabase
            .from('collection_events')
            .select(eventCols)
            .eq('organization_id', orgId)
            .in('collection_case_id', ids)
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
        fail('event list'),
      )),
    )
  }
  const eventsByCase = new Map<string, Record<string, unknown>[]>()
  for (const e of events) {
    const k = String(e.collection_case_id)
    const list = eventsByCase.get(k)
    if (list) list.push(e)
    else eventsByCase.set(k, [e])
  }

  const units = new Map<string, { label: string; propertyId: string | null }>()
  const caseUnitIds = [...new Set(cases.map((c) => String(c.unit_id)))]
  // Unit → property goes through the resolver (bridge ratchet), never a
  // direct read of units.legacy_hoa_property_id.
  const propertyByUnit = await propertyIdsForUnits(supabase as never, orgId, caseUnitIds)
  for (const ids of chunk(caseUnitIds)) {
    const rows = await readAll<Record<string, unknown>>(
      (from, to) =>
        supabase
          .from('units')
          .select('id, unit_number, address_line1')
          .eq('organization_id', orgId)
          .in('id', ids)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
      fail('unit lookup'),
    )
    for (const u of rows) {
      const number = (u.unit_number as string | null)?.trim()
      units.set(String(u.id), {
        label: number || (u.address_line1 as string | null) || 'Unnamed unit',
        propertyId: propertyByUnit.get(String(u.id) as never) ?? null,
      })
    }
  }

  const all = cases.map((r) => {
    const c = toCase(r)
    const evs = eventsByCase.get(c.id) ?? []
    // Newest by the action date a human typed, then by when it was recorded.
    const newest = [...evs].sort(
      (a, b) =>
        String(b.occurred_on).localeCompare(String(a.occurred_on)) || String(b.created_at).localeCompare(String(a.created_at)),
    )[0]
    const unit = units.get(c.unitId)
    const input: OpenCaseInput = {
      caseId: c.id,
      unitId: c.unitId,
      linkId: unit?.propertyId ? asPropertyId(unit.propertyId) : asUnitId(c.unitId),
      unitLabel: unit?.label ?? 'Unknown unit',
      status: c.status,
      attorneyFirm: c.attorneyFirm,
      openedOn: c.openedOn,
      lastEventOn: newest ? String(newest.occurred_on) : null,
      lastEventType: newest ? (newest.event_type as CollectionEventType) : null,
      mailDeliveredOn: M7_APPLIED ? latestMailDelivery(evs.map(toMailRecord)) : null,
    }
    return withDays(input, today)
  })

  const sorted = sortOpenCases(all)
  return { rows: sorted.slice(offset, offset + limit), total: sorted.length }
}

function toMailRecord(e: Record<string, unknown>): MailRecord {
  return {
    method: (e.mail_method as MailMethod | null) ?? null,
    trackingNumber: (e.tracking_number as string | null) ?? null,
    mailedOn: (e.mailed_on as string | null) ?? null,
    deliveredOn: (e.delivered_on as string | null) ?? null,
  }
}
