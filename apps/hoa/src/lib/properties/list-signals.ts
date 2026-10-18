import type { SupabaseClient } from '@supabase/supabase-js'
import { readAll } from '@/lib/supabase/read-all'
import { unitPropertyIndex } from './resolve'

/**
 * The two list columns hoa_property_list_v doesn't carry — open ARC and
 * last activity — computed for every home at once, with no migration.
 *
 * Six reads, all in parallel and each paged past the 1000-row cap
 * (readAll), whatever the roster size: the unit → home index, every ARC
 * application, and the dated rows of the last ACTIVITY_WINDOW_DAYS from
 * history events, violations, mail and payments. The window keeps the
 * reads bounded as an association ages; a home with nothing in it shows
 * no last activity rather than a guess.
 *
 * Throws if any source fails. The caller shows "Couldn't load" for both
 * columns — a partial read would show a quiet home that isn't.
 */

export const ACTIVITY_WINDOW_DAYS = 365

export type ActivityKind = 'history' | 'violation' | 'arc' | 'mail' | 'payment'

export interface PropertySignals {
  /** ARC applications awaiting a decision (submitted or in review). */
  openArc: number
  /** Newest dated row at the home inside the window, or null. */
  lastActivityAt: string | null
  lastActivityKind: ActivityKind | null
}

/** Same "open" as the ARC queue and the property page: awaiting a decision. */
export const OPEN_ARC_STATUSES = ['submitted', 'in_review'] as const

type Page<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>

const fail = (what: string) => (e: { code?: string }) => new Error(`list signals: ${what} read failed (${e.code ?? 'no code'})`)

export async function readListSignals(
  db: SupabaseClient,
  orgId: string,
  now: Date = new Date(),
): Promise<Map<string, PropertySignals>> {
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000).toISOString()

  const [unitIndex, arc, events, violations, threads, payments] = await Promise.all([
    unitPropertyIndex(db as never, orgId),
    readAll<{ unit_id: string | null; status: string; submitted_at: string | null; board_response_at: string | null }>(
      (from, to) =>
        db
          .from('arc_requests')
          .select('id, unit_id, status, submitted_at, board_response_at')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to) as unknown as Page<never>,
      fail('ARC'),
    ),
    readAll<{ property_id: string; occurred_at: string }>(
      (from, to) =>
        db
          .from('property_events' as never)
          .select('id, property_id, occurred_at')
          .eq('organization_id' as never, orgId)
          .gte('occurred_at' as never, since)
          .order('id' as never, { ascending: true })
          .range(from, to) as unknown as Page<never>,
      fail('history'),
    ),
    readAll<{ property_id: string | null; created_at: string | null }>(
      (from, to) =>
        db
          .from('hoa_violations')
          .select('id, property_id, created_at')
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .gte('created_at', since)
          .order('id', { ascending: true })
          .range(from, to) as unknown as Page<never>,
      fail('violations'),
    ),
    readAll<{ unit_id: string | null; last_message_at: string | null }>(
      (from, to) =>
        db
          .from('inbox_threads')
          .select('id, unit_id, last_message_at')
          .eq('organization_id', orgId)
          .not('unit_id', 'is', null)
          .gte('last_message_at', since)
          .order('id', { ascending: true })
          .range(from, to) as unknown as Page<never>,
      fail('mail'),
    ),
    readAll<{ unit_id: string | null; paid_at: string }>(
      (from, to) =>
        db
          .from('payments')
          .select('id, unit_id, paid_at')
          .eq('organization_id', orgId)
          .not('unit_id', 'is', null)
          .gte('paid_at', since)
          .order('id', { ascending: true })
          .range(from, to) as unknown as Page<never>,
      fail('payments'),
    ),
  ])

  const out = new Map<string, PropertySignals>()
  const entry = (propertyId: string) => {
    let e = out.get(propertyId)
    if (!e) {
      e = { openArc: 0, lastActivityAt: null, lastActivityKind: null }
      out.set(propertyId, e)
    }
    return e
  }
  const touch = (propertyId: string | null | undefined, at: string | null | undefined, kind: ActivityKind) => {
    if (!propertyId || !at || at < since) return
    const e = entry(propertyId)
    if (!e.lastActivityAt || Date.parse(at) > Date.parse(e.lastActivityAt)) {
      e.lastActivityAt = at
      e.lastActivityKind = kind
    }
  }
  const home = (unitId: string | null) => (unitId ? (unitIndex.get(unitId as never) ?? null) : null)

  for (const a of arc) {
    const pid = home(a.unit_id)
    if (!pid) continue
    if ((OPEN_ARC_STATUSES as readonly string[]).includes(a.status)) entry(pid).openArc++
    else entry(pid)
    touch(pid, a.submitted_at, 'arc')
    touch(pid, a.board_response_at, 'arc')
  }
  for (const e of events) touch(e.property_id, e.occurred_at, 'history')
  for (const v of violations) touch(v.property_id, v.created_at, 'violation')
  for (const t of threads) touch(home(t.unit_id), t.last_message_at, 'mail')
  for (const p of payments) touch(home(p.unit_id), p.paid_at, 'payment')
  return out
}
