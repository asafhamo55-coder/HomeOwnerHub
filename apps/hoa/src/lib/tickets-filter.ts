// The board tickets list's status and search filters, in one place so the
// page (listTicketsForBoard) and the CSV export narrow rows the same way.
// Not a 'use server' file: tickets.ts can export only async server actions.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ticketSearchPattern } from '@/lib/tickets-board'

interface Filterable<Q> {
  eq(column: string, value: string): Q
  or(filter: string): Q
}

/**
 * The PostgREST `.or()` clause for a typed search: subject, resident or unit.
 * `{ ok: true, clause: null }` for an empty term. `{ ok: false }` when the
 * resident or unit lookup fails, so a caller never shows an unfiltered list
 * for a filtered request.
 */
export async function ticketSearchClause(
  supabase: SupabaseClient,
  q: string | undefined,
): Promise<{ ok: true; clause: string | null } | { ok: false }> {
  const pattern = ticketSearchPattern(q)
  if (!pattern) return { ok: true, clause: null }
  // Residents and units live in related tables: find their ids first, then
  // OR them with the subject match. Both lookups are capped.
  const [people, units] = await Promise.all([
    supabase
      .from('profiles' as never)
      .select('id')
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(200),
    supabase
      .from('units' as never)
      .select('id')
      .ilike('unit_number' as never, pattern)
      .limit(200),
  ])
  if (people.error || units.error) return { ok: false }
  const idsOf = (rows: unknown) => ((rows ?? []) as { id: string }[]).map((r) => r.id)
  const clauses = [`subject.ilike.${pattern}`]
  const personIds = idsOf(people.data)
  const unitIds = idsOf(units.data)
  if (personIds.length) clauses.push(`submitted_by.in.(${personIds.join(',')})`)
  if (unitIds.length) clauses.push(`unit_id.in.(${unitIds.join(',')})`)
  return { ok: true, clause: clauses.join(',') }
}

/** Adds the status filter and a search clause (from ticketSearchClause) to a tickets query. */
export function withTicketFilters<Q extends Filterable<Q>>(
  query: Q,
  opts: { status?: string; clause: string | null },
): Q {
  let out = query
  if (opts.status) out = out.eq('status', opts.status)
  if (opts.clause) out = out.or(opts.clause)
  return out
}

/** Both steps in one call, for a caller that reads once. */
export async function applyTicketFilters<Q extends Filterable<Q>>(
  supabase: SupabaseClient,
  query: Q,
  opts: { status?: string; q?: string },
): Promise<{ ok: true; query: Q } | { ok: false }> {
  const search = await ticketSearchClause(supabase, opts.q)
  if (!search.ok) return { ok: false }
  return { ok: true, query: withTicketFilters(query, { status: opts.status, clause: search.clause }) }
}
