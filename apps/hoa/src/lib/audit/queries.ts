// BL-115 — reads behind /settings/activity and its CSV export.
//
// SECURITY. audit_log is read with the caller's RLS-bound server client,
// never the service role. 0063 (audit_log_select) lets board/admin read
// their org's rows and nobody else; before 0063 the 0000 org_access policy
// let any org member read them. Either way the pages and the export route
// gate on board/admin first, and every query is pinned to the gate's org.
//
// The one service-role read is board members' display names
// (`loadActorDirectory`): profiles RLS only lets a user read their own row,
// the same reason lib/members.ts listMembers uses it. It reads names for
// board/admin members only — a resident is shown as "A resident", never by
// name — and it runs after the caller's board gate.

import { createAdminClient } from '@homeowner-portal/db'
import { z } from 'zod'
import { addCalendarDays, instantAtLocalTime } from '@/lib/association-time'
import { zDateOnly, zUuid } from '@/lib/api/schemas'
import {
  ACTIVITY_AREAS,
  ACTIVITY_AREA_LABEL,
  AI_LEDGER_EXACT,
  AI_LEDGER_PREFIXES,
  actionArea,
  actionDetail,
  actionLabel,
  actionsInArea,
  entityHref,
  entityLabel,
  prefixesInArea,
  type ActivityArea,
} from './labels'

export const ACTIVITY_PAGE_SIZE = 50
/** The most rows one CSV export carries; past it the board narrows the dates. */
export const ACTIVITY_EXPORT_MAX = 20_000

export const ACTIVITY_COLUMNS = 'id, user_id, action, entity_type, entity_id, metadata, created_at'

export interface ActivityFilters {
  person: string | null
  area: ActivityArea | null
  from: string | null
  to: string | null
}

export const EMPTY_FILTERS: ActivityFilters = { person: null, area: null, from: null, to: null }

const AreaSchema = z.enum(ACTIVITY_AREAS as unknown as [ActivityArea, ...ActivityArea[]])

/** Query-string shape for the export route (parseQuery → 400 on a bad value). */
export const ActivityQuery = z
  .object({
    person: zUuid.optional(),
    area: AreaSchema.optional(),
    from: zDateOnly.optional(),
    to: zDateOnly.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'The start date is after the end date.', path: ['to'] })

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : undefined
}

/**
 * The page's filters from its search params. A bad value is dropped (and
 * named in `invalid` so the page can say so) rather than failing the page.
 */
export function parseActivityFilters(sp: Record<string, string | string[] | undefined>): {
  filters: ActivityFilters
  invalid: Array<keyof ActivityFilters>
} {
  const invalid: Array<keyof ActivityFilters> = []
  const pick = <T>(key: keyof ActivityFilters, schema: z.ZodType<T>): T | null => {
    const raw = first(sp[key])
    if (raw === undefined) return null
    const r = schema.safeParse(raw)
    if (!r.success) {
      invalid.push(key)
      return null
    }
    return r.data
  }
  const filters: ActivityFilters = {
    person: pick('person', zUuid),
    area: pick('area', AreaSchema),
    from: pick('from', zDateOnly),
    to: pick('to', zDateOnly),
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    invalid.push('to')
    filters.to = null
  }
  return { filters, invalid }
}

export function filtersToSearch(filters: ActivityFilters): URLSearchParams {
  const q = new URLSearchParams()
  if (filters.person) q.set('person', filters.person)
  if (filters.area) q.set('area', filters.area)
  if (filters.from) q.set('from', filters.from)
  if (filters.to) q.set('to', filters.to)
  return q
}

export function isFiltered(f: ActivityFilters): boolean {
  return Boolean(f.person || f.area || f.from || f.to)
}

// ── Query building ───────────────────────────────────────────────────

/** The slice of a PostgREST builder these reads use. */
export interface AuditQuery<R = unknown> extends PromiseLike<R> {
  select(cols: string, opts?: { count?: 'exact'; head?: boolean }): AuditQuery<R>
  eq(col: string, value: unknown): AuditQuery<R>
  gte(col: string, value: unknown): AuditQuery<R>
  lt(col: string, value: unknown): AuditQuery<R>
  or(filter: string): AuditQuery<R>
  not(col: string, op: string, value: unknown): AuditQuery<R>
  order(col: string, opts: { ascending: boolean }): AuditQuery<R>
  range(from: number, to: number): AuditQuery<R>
}

export interface AuditClient {
  from(table: 'audit_log'): AuditQuery<{
    data: AuditRow[] | null
    error: { code?: string; message?: string } | null
    count?: number | null
  }>
}

export interface AuditRow {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: unknown
  created_at: string | null
}

/** Quote a value for a PostgREST in-list / or() filter (action names hold dots). */
function q(v: string): string {
  return `"${v.replace(/["\\]/g, '')}"`
}

/** Escape LIKE wildcards in a fixed prefix, then add the trailing wildcard. */
function likePrefix(prefix: string): string {
  return `${prefix.replace(/[%_\\]/g, '\\$&')}*`
}

/**
 * Org, person, area and date filters on an audit_log query. Dates are the
 * association's days: `from` is that day's local midnight, `to` is
 * inclusive (before the next day's local midnight).
 */
export function applyActivityFilters<Q extends AuditQuery>(
  query: Q,
  orgId: string,
  filters: ActivityFilters,
  timeZone: string,
): Q {
  let qb = query.eq('org_id', orgId) as Q
  if (filters.person) qb = qb.eq('user_id', filters.person) as Q
  if (filters.area) {
    const exact = actionsInArea(filters.area)
    const prefixes = prefixesInArea(filters.area)
    const parts = [
      ...(exact.length ? [`action.in.(${exact.map(q).join(',')})`] : []),
      ...prefixes.map((p) => `action.like.${likePrefix(p)}`),
    ]
    // An area with no actions matches nothing (never "everything").
    qb = qb.or(parts.length ? parts.join(',') : 'action.is.null') as Q
  } else {
    // The default view leaves out the AI usage ledger (one row per AI call).
    qb = qb.not('action', 'in', `(${AI_LEDGER_EXACT.map(q).join(',')})`) as Q
    for (const p of AI_LEDGER_PREFIXES) qb = qb.not('action', 'like', `${p.replace(/[%_\\]/g, '\\$&')}%`) as Q
  }
  if (filters.from) qb = qb.gte('created_at', instantAtLocalTime(filters.from, 0, timeZone).toISOString()) as Q
  if (filters.to) qb = qb.lt('created_at', instantAtLocalTime(addCalendarDays(filters.to, 1), 0, timeZone).toISOString()) as Q
  return qb
}

export async function loadActivityPage(
  db: AuditClient,
  orgId: string,
  filters: ActivityFilters,
  timeZone: string,
  range: { from: number; to: number },
): Promise<{ rows: AuditRow[]; total: number }> {
  const query = applyActivityFilters(
    db.from('audit_log').select(ACTIVITY_COLUMNS, { count: 'exact' }),
    orgId,
    filters,
    timeZone,
  )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(range.from, range.to)
  const { data, error, count } = await query
  if (error) throw new Error(`audit_log read failed (${error.code ?? 'no code'})`)
  const rows = data ?? []
  return { rows, total: count ?? rows.length }
}

/** Count-only, for the export's size check. */
export async function countActivity(
  db: AuditClient,
  orgId: string,
  filters: ActivityFilters,
  timeZone: string,
): Promise<{ count: number | null; error: { code?: string } | null }> {
  const { count, error } = await applyActivityFilters(
    db.from('audit_log').select('id', { count: 'exact', head: true }),
    orgId,
    filters,
    timeZone,
  )
  return { count: count ?? null, error }
}

/** Page builder for readAll: a fresh query per page, with a stable order. */
export function activityExportPage(db: AuditClient, orgId: string, filters: ActivityFilters, timeZone: string) {
  return (from: number, to: number) =>
    applyActivityFilters(db.from('audit_log').select(ACTIVITY_COLUMNS), orgId, filters, timeZone)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
}

// ── Actors ───────────────────────────────────────────────────────────

export interface ActorDirectory {
  /** user_id → display name, board/admin members only. */
  board: Map<string, string>
  /** user_ids of current resident members (shown as "A resident"). */
  residents: Set<string>
  /** BL-168: user_id → "CPA" / "Attorney" for outside professionals; never a resident. */
  professionals?: Map<string, string>
}

export const EMPTY_DIRECTORY: ActorDirectory = { board: new Map(), residents: new Set() }

interface MemberRow {
  user_id: string
  role: string
  profile: { full_name: string | null } | null
}

/**
 * Board/admin display names for the org. Call ONLY after the caller's
 * board/admin gate. Names only — never emails or phones.
 */
export async function loadActorDirectory(orgId: string): Promise<ActorDirectory> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('org_members')
    .select('user_id, role, profile:profiles(full_name)')
    .eq('org_id', orgId)
  if (error) throw new Error(`org_members read failed (${error.code ?? 'no code'})`)
  return buildActorDirectory((data ?? []) as unknown as MemberRow[])
}

export function buildActorDirectory(rows: MemberRow[]): ActorDirectory {
  const board = new Map<string, string>()
  const residents = new Set<string>()
  const professionals = new Map<string, string>()
  for (const r of rows) {
    if (r.role === 'admin' || r.role === 'board') {
      const name = r.profile?.full_name?.trim()
      board.set(r.user_id, name || (r.role === 'admin' ? 'Board admin' : 'Board member'))
    } else if (r.role === 'cpa' || r.role === 'attorney') {
      professionals.set(r.user_id, r.role === 'cpa' ? 'The CPA' : 'The attorney')
    } else {
      residents.add(r.user_id)
    }
  }
  return { board, residents, professionals }
}

export function actorName(userId: string | null, dir: ActorDirectory): string {
  if (!userId) return 'System'
  const name = dir.board.get(userId)
  if (name) return name
  const pro = dir.professionals?.get(userId)
  if (pro) return pro
  if (dir.residents.has(userId)) return 'A resident'
  return 'Former member'
}

/** Board members for the person filter, sorted by name. */
export function boardPeople(dir: ActorDirectory): Array<{ id: string; name: string }> {
  return [...dir.board.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── View model ───────────────────────────────────────────────────────

export interface ActivityView {
  id: string
  at: string | null
  actor: string
  action: string
  area: string
  detail: string | null
  entity: string | null
  href: string | null
}

export function activityView(row: AuditRow, dir: ActorDirectory): ActivityView {
  return {
    id: row.id,
    at: row.created_at,
    actor: actorName(row.user_id, dir),
    action: actionLabel(row.action),
    area: ACTIVITY_AREA_LABEL[actionArea(row.action)],
    detail: actionDetail(row.action, row.metadata as Record<string, unknown> | null),
    entity: entityLabel(row.entity_type),
    href: entityHref(row.entity_type, row.entity_id),
  }
}

/** "2026-10-20 14:05" in the association's zone (CSV and the page's title attribute). */
export function localStamp(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

export const ACTIVITY_CSV_HEADER = ['When', 'Person', 'Action', 'Area', 'Details', 'Record', 'Link'] as const

/**
 * One CSV row. Exactly what the page shows: no metadata JSON, no entity
 * ids beyond the in-app link path, no resident names.
 */
export function activityCsvRow(v: ActivityView, timeZone: string): string[] {
  return [localStamp(v.at, timeZone), v.actor, v.action, v.area, v.detail ?? '', v.entity ?? '', v.href ?? '']
}
