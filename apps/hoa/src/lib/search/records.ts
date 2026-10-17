// BL-022 — record search behind the ⌘K palette.
//
// `ilike` across the org's owners, properties, violations, ARC requests,
// tickets, inbox threads and vendors. No migration: a trigram index can come
// later in a batch if p50 drifts.
//
// SECURITY. The caller passes the *user's* server client (never the service
// role), so every read below is RLS-filtered; `hoa_property_list_v` is
// security_invoker with an auth_is_board_or_admin predicate (0039/0040).
// The route in front of this is board/admin-only (a resident gets 403), and
// every query is additionally pinned to the gate's org id, so a user who
// belongs to several orgs only sees the one they are working in.
//
// Two rounds: properties first (owner name, address, unit), then everything
// else in parallel — a violation or thread is found both by its own text and
// by belonging to a matched property, which is how "Kaur" reaches the
// violation on the Kaurs' lot. Each type fails independently: a type whose
// query errors is listed in `failed` (so the palette can say results are
// incomplete) instead of reading as "no matches".
//
// Logs carry the org id, type and error code only — never the query text or
// a Postgres message, which can embed row values.

import { logRouteFailure } from '@/lib/api/log'
import {
  ARC_STATUS,
  INBOX_THREAD_STATUS,
  TICKET_STATUS,
  VIOLATION_STATUS,
} from '@/lib/status/community'
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
): Promise<RecordSearchResult> {
  const term = searchTerm(rawQuery)
  if (!term) return { groups: [], failed: [] }
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
    vendor: [],
  }

  // ── Round 1: properties / owners ───────────────────────────────────
  const props = await run(
    'properties',
    orgId,
    supabase
      .from('hoa_property_list_v')
      .select('id, address, unit_number, owner_name, unit_id')
      .eq('org_id', orgId)
      .or(ilike(['address', 'unit_number', 'owner_name'], term).join(','))
      .order('address', { ascending: true })
      .limit(PROPERTY_LINK_LIMIT),
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
        href: `/properties/${id}`,
      })
    } else {
      hits.property.push({
        id,
        type: 'property',
        label: address,
        hint: joinHint(unitLabel(unit), str(p.owner_name)),
        href: `/properties/${id}`,
      })
    }
  }
  const propertyIds = propRows.map((p) => String(p.id))
  const unitIds = [...new Set(propRows.map((p) => str(p.unit_id)).filter((u): u is string => !!u))]

  // ── Round 2: everything else, in parallel ─────────────────────────
  const [violations, arcs, tickets, threads, vendors] = await Promise.all([
    run(
      'violation',
      orgId,
      supabase
        .from('hoa_violations')
        .select('id, violation_type, status, property_id')
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
        .select('id, summary, status, unit_id')
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
        .select('id, subject, status, unit_id')
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
        .select('id, subject, status, unit_id')
        .eq('organization_id', orgId)
        .or([...ilike(['subject'], term), ...inList('unit_id', unitIds)].join(','))
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(SEARCH_LIMIT_PER_TYPE),
    ),
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
  ])

  if (violations === null) failed.add('violation')
  for (const v of violations ?? []) {
    const id = String(v.id)
    const pid = str(v.property_id)
    hits.violation.push({
      id,
      type: 'violation',
      label: str(v.violation_type) ?? 'Violation',
      hint: joinHint(pid ? addressById.get(pid) : null, statusLabel(VIOLATION_STATUS.labels, v.status)),
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
      hint: statusLabel(ARC_STATUS.labels, a.status),
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
      hint: statusLabel(TICKET_STATUS.labels, t.status),
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
      hint: statusLabel(INBOX_THREAD_STATUS.labels, t.status),
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
      href: `/vendors/${id}`,
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
