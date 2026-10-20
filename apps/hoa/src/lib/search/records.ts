// BL-022 — record search behind the ⌘K palette.
//
// `ilike` across the org's owners, properties, violations, ARC requests,
// tickets, inbox threads, meetings, documents and vendors. No migration: a trigram index can come
// later in a batch if p50 drifts.
//
// SECURITY. The caller passes the *user's* server client (never the service
// role), so every read below is RLS-filtered; `hoa_property_list_v` is
// security_invoker with an auth_is_board_or_admin predicate (0039/0040).
// The route in front of this is board/admin-only (a resident gets 403), and
// every query is additionally pinned to the gate's org id, so a user who
// belongs to several orgs only sees the one they are working in.
//
// Two rounds: properties first (owner name, address, unit), then the types
// that hang off a lot — a violation or thread is found both by its own text
// and by belonging to a matched property, which is how "Kaur" reaches the
// violation on the Kaurs' lot. Types no property match can widen (vendors,
// documents, meetings) start alongside round 1, so the request costs two
// round-trips rather than two plus the slowest of those (BL-060 latency). Each type fails independently: a type whose
// query errors is listed in `failed` (so the palette can say results are
// incomplete) instead of reading as "no matches".
//
// Logs carry the org id, type and error code only — never the query text or
// a Postgres message, which can embed row values.
//
// BL-060: rows on the same lot (three "Landscaping" violations) used to be
// identical. Each row now carries a `detail` — status and the association's
// day ("Open · Oct 3") — which the palette keeps visible when the label and
// address truncate. Days are the association's day (BL-043), not UTC.

import { logRouteFailure } from '@/lib/api/log'
import { DEFAULT_ASSOCIATION_TIME_ZONE, dayOf, todayIn } from '@/lib/association-time'
import {
  ARC_STATUS,
  INBOX_THREAD_STATUS,
  MEETING_STATUS,
  MEETING_TYPE,
  TICKET_STATUS,
  VIOLATION_STATUS,
} from '@/lib/status/community'
import { DOCUMENT_TYPE_LABELS, GOVERNING_TYPE_LABELS } from '@/lib/status/knowledge'
import {
  RECORD_GROUP_LABEL,
  RECORD_TYPES,
  type RecordHit,
  type RecordSearchResult,
  type RecordType,
} from './types'

export const SEARCH_MIN_LENGTH = 2
export const SEARCH_MAX_LENGTH = 100
/** Per type, not a total — search shows the best few of each. */
export const SEARCH_LIMIT_PER_TYPE = 5
/** Properties fetched to link violations/ARC/tickets/threads; only the first few are shown. */
const PROPERTY_LINK_LIMIT = 20

export {
  RECORD_GROUP_LABEL,
  RECORD_TYPES,
  type RecordGroup,
  type RecordHit,
  type RecordSearchResult,
  type RecordType,
} from './types'

const ORDER = RECORD_TYPES

type QueryResult = { data: unknown[] | null; error: { code?: string } | null }

interface SearchQuery extends PromiseLike<QueryResult> {
  select(cols: string): SearchQuery
  eq(col: string, value: unknown): SearchQuery
  is(col: string, value: null): SearchQuery
  or(filter: string): SearchQuery
  order(col: string, opts: { ascending: boolean; nullsFirst?: boolean }): SearchQuery
  limit(n: number): SearchQuery
}

/** The slice of a Supabase client this module uses. Pass the user's server client. */
export interface SearchClient {
  from(table: string): SearchQuery
}

/**
 * The sanitized term, or null when it is too short to search. Escapes LIKE
 * wildcards, and strips the characters PostgREST gives meaning inside an
 * or() filter (`,` `(` `)`), its `*` wildcard alias and quotes — any of
 * which would otherwise change the query's shape rather than its value.
 */
export function searchTerm(raw: string): string | null {
  const cleaned = raw
    .slice(0, SEARCH_MAX_LENGTH)
    .replace(/[%_\\]/g, '\\$&')
    .replace(/[,()*"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length >= SEARCH_MIN_LENGTH ? cleaned : null
}

function ilike(cols: string[], term: string): string[] {
  return cols.map((c) => `${c}.ilike.%${term}%`)
}

function inList(col: string, ids: string[]): string[] {
  return ids.length > 0 ? [`${col}.in.(${ids.join(',')})`] : []
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

function joinHint(...parts: Array<string | null | undefined>): string | null {
  const s = parts.filter((p): p is string => !!p).join(' · ')
  return s || null
}

function statusLabel(labels: Record<string, string>, status: unknown): string | null {
  const s = str(status)
  return s ? (labels[s] ?? s) : null
}

/** "4B" → "Unit 4B"; data that already says "Unit 4B", "Apt 3" or "#12" is kept as is. */
function unitLabel(unit: string | null): string | null {
  if (!unit) return null
  return /^(?:(?:unit|apt|apartment|suite|ste|lot)\b|#)/i.test(unit.trim()) ? unit.trim() : `Unit ${unit.trim()}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Oct 3" for a day this year, "Nov 20, 2025" otherwise; null for a missing
 * or unparseable value. A timestamp is read as the association's day; a
 * date-only column ('2026-10-03') is taken at face value.
 */
function shortDay(value: unknown, timeZone: string, thisYear: string): string | null {
  const day = typeof value === 'string' ? dayOf(value, timeZone) : null
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null
  if (!m) return null
  const label = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
  return m[1] === thisYear ? label : `${label}, ${m[1]}`
}

export interface SearchOptions {
  /**
   * The org's zone for dating rows (BL-043). A promise is accepted so the
   * route can read it while the search runs. Defaults to America/New_York.
   */
  timeZone?: string | PromiseLike<string>
  /** For tests. */
  now?: Date
  /**
   * Optional per-phase timer (the route passes `perfTimer().time`), so the
   * rounds show up in Server-Timing and the [perf] log. Phase names only;
   * nothing about the query.
   */
  time?: <T>(phase: string, fn: () => PromiseLike<T>) => PromiseLike<T>
}

type Row = Record<string, unknown>

async function run(
  type: RecordType | 'properties',
  orgId: string,
  query: SearchQuery,
): Promise<Row[] | null> {
  const { data, error } = await query
  if (error) {
    logRouteFailure(`search.${type}`, error, { orgId })
    return null
  }
  return (data ?? []) as Row[]
}

function includesCI(value: unknown, needle: string): boolean {
  const s = str(value)
  return !!s && s.toLowerCase().includes(needle)
}

export async function searchRecords(
  supabase: SearchClient,
  orgId: string,
  rawQuery: string,
  options: SearchOptions = {},
): Promise<RecordSearchResult> {
  const term = searchTerm(rawQuery)
  if (!term) return { groups: [], failed: [] }
  // Started now, awaited after the queries — never an extra round-trip.
  const zonePromise = Promise.resolve(options.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE)
  // For deciding which group a property row belongs to (the DB matched it
  // case-insensitively; mirror that with the unescaped text).
  const needle = rawQuery.trim().toLowerCase()

  const failed = new Set<RecordType>()
  const hits: Record<RecordType, RecordHit[]> = {
    owner: [],
    property: [],
    violation: [],
    arc: [],
    ticket: [],
    thread: [],
    meeting: [],
    document: [],
    vendor: [],
  }

  const time = options.time ?? (<T>(_phase: string, fn: () => PromiseLike<T>) => fn())

  // ── Started first: the types no property match can widen ──────────
  const unlinked = Promise.resolve(
    time('search.unlinked', () =>
      Promise.all([
        run(
          'vendor',
          orgId,
          supabase
            .from('vendors')
            .select('id, legal_name, dba, status')
            .eq('organization_id', orgId)
            .is('deleted_at', null)
            .or(ilike(['legal_name', 'dba'], term).join(','))
            .order('legal_name', { ascending: true })
            .limit(SEARCH_LIMIT_PER_TYPE),
        ),
        // Documents: uploaded files and governing documents share one group.
        // Neither table soft-deletes; a superseded governing document is the
        // old version, so only the current one is searched.
        run(
          'document',
          orgId,
          supabase
            .from('hoa_documents')
            .select('id, name, type, created_at')
            .eq('org_id', orgId)
            .or(ilike(['name'], term).join(','))
            .order('created_at', { ascending: false })
            .limit(SEARCH_LIMIT_PER_TYPE),
        ),
        run(
          'document',
          orgId,
          supabase
            .from('governing_documents')
            .select('id, title, type, effective_date, created_at')
            .eq('organization_id', orgId)
            .is('superseded_at', null)
            .or(ilike(['title'], term).join(','))
            .order('created_at', { ascending: false })
            .limit(SEARCH_LIMIT_PER_TYPE),
        ),
        // Meetings have no title: matched on their type and AI summary.
        run(
          'meeting',
          orgId,
          supabase
            .from('hoa_meeting_minutes')
            .select('id, meeting_type, meeting_date, status')
            .eq('org_id', orgId)
            .is('deleted_at', null)
            .or(ilike(['meeting_type', 'ai_summary'], term).join(','))
            .order('meeting_date', { ascending: false })
            .limit(SEARCH_LIMIT_PER_TYPE),
        ),
      ]),
    ),
  )
  // Awaited in round 2; this only keeps a round-1 throw from leaving it unhandled.
  unlinked.catch(() => {})

  // ── Round 1: properties / owners ───────────────────────────────────
  const props = await time('search.properties', () =>
    run(
      'properties',
      orgId,
      supabase
        .from('hoa_property_list_v')
        .select('id, address, unit_number, owner_name, unit_id')
        .eq('org_id', orgId)
        .or(ilike(['address', 'unit_number', 'owner_name'], term).join(','))
        .order('address', { ascending: true })
        .limit(PROPERTY_LINK_LIMIT),
    ),
  )
  if (props === null) {
    failed.add('owner')
    failed.add('property')
  }
  const propRows = props ?? []
  const addressById = new Map<string, string>()
  for (const p of propRows) {
    const id = String(p.id)
    const address = str(p.address) ?? 'Property'
    const unit = str(p.unit_number)
    addressById.set(id, joinHint(address, unitLabel(unit)) ?? address)
    if (includesCI(p.owner_name, needle)) {
      hits.owner.push({
        id,
        type: 'owner',
        label: String(p.owner_name),
        hint: addressById.get(id) ?? null,
        detail: null,
        href: `/properties/${id}`,
      })
    } else {
      hits.property.push({
        id,
        type: 'property',
        label: address,
        hint: joinHint(unitLabel(unit), str(p.owner_name)),
        detail: null,
        href: `/properties/${id}`,
      })
    }
  }
  const propertyIds = propRows.map((p) => String(p.id))
  const unitIds = [...new Set(propRows.map((p) => str(p.unit_id)).filter((u): u is string => !!u))]
  // ARC, tickets and threads hang off units; show the lot they are on.
  const addressByUnit = new Map<string, string>()
  for (const p of propRows) {
    const u = str(p.unit_id)
    const a = addressById.get(String(p.id))
    if (u && a) addressByUnit.set(u, a)
  }

  // ── Round 2: the types linked to a matched lot, in parallel ───────
  const [[violations, arcs, tickets, threads], [vendors, documents, governing, meetings], timeZone] = await Promise.all([
    time('search.linked', () =>
      Promise.all([
        run(
          'violation',
          orgId,
          supabase
            .from('hoa_violations')
            .select('id, violation_type, status, property_id, created_at')
            .eq('org_id', orgId)
            .is('deleted_at', null)
            .or([...ilike(['violation_type', 'description'], term), ...inList('property_id', propertyIds)].join(','))
            .order('created_at', { ascending: false })
            .limit(SEARCH_LIMIT_PER_TYPE),
        ),
        run(
          'arc',
          orgId,
          supabase
            .from('arc_requests')
            .select('id, summary, status, unit_id, submitted_at')
            .eq('organization_id', orgId)
            .is('deleted_at', null)
            .or([...ilike(['summary', 'contractor_name'], term), ...inList('unit_id', unitIds)].join(','))
            .order('submitted_at', { ascending: false })
            .limit(SEARCH_LIMIT_PER_TYPE),
        ),
        run(
          'ticket',
          orgId,
          supabase
            .from('tickets')
            .select('id, subject, status, unit_id, created_at')
            .eq('organization_id', orgId)
            .is('deleted_at', null)
            .or([...ilike(['subject'], term), ...inList('unit_id', unitIds)].join(','))
            .order('created_at', { ascending: false })
            .limit(SEARCH_LIMIT_PER_TYPE),
        ),
        run(
          'thread',
          orgId,
          supabase
            .from('inbox_threads')
            .select('id, subject, status, unit_id, last_message_at')
            .eq('organization_id', orgId)
            .or([...ilike(['subject'], term), ...inList('unit_id', unitIds)].join(','))
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(SEARCH_LIMIT_PER_TYPE),
        ),
      ]),
    ),
    unlinked,
    zonePromise,
  ])

  const thisYear = todayIn(timeZone, options.now ?? new Date()).slice(0, 4)
  const day = (v: unknown) => shortDay(v, timeZone, thisYear)

  const unitAddress = (u: unknown): string | null => {
    const id = str(u)
    return id ? (addressByUnit.get(id) ?? null) : null
  }

  if (violations === null) failed.add('violation')
  for (const v of violations ?? []) {
    const id = String(v.id)
    const pid = str(v.property_id)
    hits.violation.push({
      id,
      type: 'violation',
      label: str(v.violation_type) ?? 'Violation',
      hint: pid ? (addressById.get(pid) ?? null) : null,
      detail: joinHint(statusLabel(VIOLATION_STATUS.labels, v.status), day(v.created_at)),
      href: `/violations/${id}`,
    })
  }

  if (arcs === null) failed.add('arc')
  for (const a of arcs ?? []) {
    const id = String(a.id)
    hits.arc.push({
      id,
      type: 'arc',
      label: str(a.summary) ?? 'ARC request',
      hint: unitAddress(a.unit_id),
      detail: joinHint(statusLabel(ARC_STATUS.labels, a.status), day(a.submitted_at)),
      href: `/arc/${id}`,
    })
  }

  if (tickets === null) failed.add('ticket')
  for (const t of tickets ?? []) {
    const id = String(t.id)
    hits.ticket.push({
      id,
      type: 'ticket',
      label: str(t.subject) ?? 'Ticket',
      hint: unitAddress(t.unit_id),
      detail: joinHint(statusLabel(TICKET_STATUS.labels, t.status), day(t.created_at)),
      href: `/tickets/${id}`,
    })
  }

  if (threads === null) failed.add('thread')
  for (const t of threads ?? []) {
    const id = String(t.id)
    hits.thread.push({
      id,
      type: 'thread',
      label: str(t.subject) ?? '(no subject)',
      hint: unitAddress(t.unit_id),
      detail: joinHint(statusLabel(INBOX_THREAD_STATUS.labels, t.status), day(t.last_message_at)),
      href: `/inbox/${id}`,
    })
  }

  if (vendors === null) failed.add('vendor')
  for (const v of vendors ?? []) {
    const id = String(v.id)
    const legal = str(v.legal_name) ?? 'Vendor'
    const dba = str(v.dba)
    hits.vendor.push({
      id,
      type: 'vendor',
      label: dba ?? legal,
      hint: dba && dba !== legal ? legal : null,
      detail: null,
      href: `/vendors/${id}`,
    })
  }

  if (meetings === null) failed.add('meeting')
  for (const m of meetings ?? []) {
    const id = String(m.id)
    const kind = str(m.meeting_type)
    hits.meeting.push({
      id,
      type: 'meeting',
      label: `${kind ? (MEETING_TYPE[kind] ?? kind) : 'Board'} meeting`,
      hint: null,
      detail: joinHint(day(m.meeting_date), statusLabel(MEETING_STATUS.labels, m.status)),
      href: `/meetings/${id}`,
    })
  }

  if (documents === null || governing === null) failed.add('document')
  for (const d of documents ?? []) {
    const id = String(d.id)
    const kind = str(d.type)
    hits.document.push({
      id,
      type: 'document',
      label: str(d.name) ?? 'Document',
      hint: kind ? (DOCUMENT_TYPE_LABELS[kind] ?? kind) : null,
      detail: day(d.created_at),
      href: `/documents/${id}`,
    })
  }
  for (const g of governing ?? []) {
    const kind = str(g.type)
    const effective = day(g.effective_date)
    hits.document.push({
      id: String(g.id),
      type: 'document',
      label: str(g.title) ?? 'Governing document',
      hint: joinHint('Governing', kind ? (GOVERNING_TYPE_LABELS[kind] ?? kind) : null),
      detail: effective ? `Effective ${effective}` : day(g.created_at),
      // Governing documents have no page of their own; the list is it.
      href: '/documents/governing',
    })
  }

  return {
    groups: ORDER.filter((t) => hits[t].length > 0).map((t) => ({
      type: t,
      label: RECORD_GROUP_LABEL[t],
      items: hits[t].slice(0, SEARCH_LIMIT_PER_TYPE),
    })),
    failed: ORDER.filter((t) => failed.has(t)),
  }
}
