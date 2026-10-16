import type { SupabaseClient } from '@supabase/supabase-js'
import { readAll } from '@/lib/supabase/read-all'
import { summarizeDelinquency, type DelinquencySummary, type OverdueChargeRow } from './delinquency'

/**
 * Community reads for the board packet (BL-016). Each takes an injected
 * client (the user-bound server client, so RLS keeps them board-only) and
 * THROWS on a query error — `loadPacketSections` turns that into the
 * section's "Couldn't load", never an empty list or a zero.
 *
 * Totals come from full queries, not from a page of rows (UX decision 11).
 * PostgREST silently caps every response at max_rows (1000), so each read
 * a total is computed from goes through `readAll`, which pages until the
 * result is exhausted. Only the printed LISTS are capped (LIST_CAP), and
 * the page says "first N of M" when they are.
 */

/** Rows listed per section on paper. The section's total is always the full count. */
export const LIST_CAP = 50

/** Violations still in play: not resolved, cured, waived or dismissed. */
export const OPEN_VIOLATION_STATUSES = ['open', 'notice_drafted', 'notice_sent', 'fined', 'escalated'] as const
/** ARC applications waiting on the board. */
export const OPEN_ARC_STATUSES = ['submitted', 'in_review'] as const

type QueryError = { code?: string; message?: string }
type Page<T> = PromiseLike<{ data: T[] | null; error: QueryError | null }>

function failed(what: string, error: QueryError): Error {
  return new Error(`board packet: ${what} failed (${error.code ?? 'no code'})`)
}

type StatusRow = { status: string }

/** Every open row's status for `table`, paged to the end. */
function readStatuses(
  db: SupabaseClient,
  table: 'hoa_violations' | 'arc_requests',
  orgColumn: 'org_id' | 'organization_id',
  orgId: string,
  statuses: readonly string[],
): Promise<StatusRow[]> {
  return readAll<StatusRow>(
    (from, to) =>
      db
        .from(table)
        .select('id, status')
        .eq(orgColumn, orgId)
        .is('deleted_at', null)
        .in('status', [...statuses])
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page<StatusRow>,
    (e) => failed(`${table} counts`, e),
  )
}

function tally(rows: StatusRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1
  return out
}

// ─── Delinquency ────────────────────────────────────────────────────

/** Every unpaid charge due before `asOf`, summarised by unit. */
export async function loadDelinquency(
  db: SupabaseClient,
  associationId: string,
  asOf: string,
): Promise<DelinquencySummary> {
  const rows = await readAll<OverdueChargeRow>(
    (from, to) =>
      db
        .from('assessments')
        .select('id, amount, due_date, unit_id, payments(amount), unit:unit_id(unit_number, address_line1)')
        .eq('association_id', associationId)
        .is('deleted_at', null)
        .not('status', 'in', '("paid","waived","written_off")')
        .lt('due_date', asOf)
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page<OverdueChargeRow>,
    (e) => failed('overdue charges', e),
  )
  return summarizeDelinquency(rows, asOf)
}

// ─── Open violations / ARC ──────────────────────────────────────────

export interface OpenItems<T> {
  /** Count over every open row (full query), not `rows.length`. */
  total: number
  byStatus: Record<string, number>
  /** Oldest first, at most LIST_CAP. */
  rows: T[]
}

export interface PacketViolation {
  id: string
  violation_type: string
  status: string
  severity: string | null
  created_at: string | null
  property: { address: string | null; unit_number: string | null } | null
}

export async function loadOpenViolations(db: SupabaseClient, orgId: string): Promise<OpenItems<PacketViolation>> {
  const [statusRows, list] = await Promise.all([
    readStatuses(db, 'hoa_violations', 'org_id', orgId, OPEN_VIOLATION_STATUSES),
    db
      .from('hoa_violations')
      .select('id, violation_type, status, severity, created_at, property:hoa_properties(address, unit_number)')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('status', [...OPEN_VIOLATION_STATUSES])
      .order('created_at', { ascending: true })
      .range(0, LIST_CAP - 1),
  ])
  if (list.error) throw failed('violations', list.error)
  return {
    total: statusRows.length,
    byStatus: tally(statusRows),
    rows: (list.data ?? []) as unknown as PacketViolation[],
  }
}

export interface PacketArc {
  id: string
  category: string
  summary: string
  status: string
  submitted_at: string
  unit: { unit_number: string | null } | null
}

export async function loadOpenArc(db: SupabaseClient, orgId: string): Promise<OpenItems<PacketArc>> {
  const [statusRows, list] = await Promise.all([
    readStatuses(db, 'arc_requests', 'organization_id', orgId, OPEN_ARC_STATUSES),
    db
      .from('arc_requests')
      .select('id, category, summary, status, submitted_at, unit:units(unit_number)')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .in('status', [...OPEN_ARC_STATUSES])
      .order('submitted_at', { ascending: true })
      .range(0, LIST_CAP - 1),
  ])
  if (list.error) throw failed('ARC applications', list.error)
  return {
    total: statusRows.length,
    byStatus: tally(statusRows),
    rows: (list.data ?? []) as unknown as PacketArc[],
  }
}

// ─── Previous meeting's action items ────────────────────────────────

export interface PacketActionItem {
  id: string
  title: string
  assignee_name: string | null
  due_date: string | null
  status: string
}

export interface PreviousMeeting {
  meeting: { id: string; meeting_date: string; meeting_type: string | null } | null
  items: PacketActionItem[]
}

/** The latest meeting dated before `meetingDate`, and all of its action items. */
export async function loadPreviousMeeting(
  db: SupabaseClient,
  orgId: string,
  meetingDate: string,
): Promise<PreviousMeeting> {
  const prev = await db
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .lt('meeting_date', meetingDate)
    .order('meeting_date', { ascending: false })
    .range(0, 0)
  if (prev.error) throw failed('previous meeting', prev.error)
  const meeting = ((prev.data ?? [])[0] ?? null) as PreviousMeeting['meeting']
  if (!meeting) return { meeting: null, items: [] }

  const items = await readAll<PacketActionItem>(
    (from, to) =>
      db
        .from('meeting_action_items')
        .select('id, title, assignee_name, due_date, status')
        .eq('meeting_id', meeting.id)
        .order('status', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page<PacketActionItem>,
    (e) => failed('action items', e),
  )
  return { meeting, items }
}
