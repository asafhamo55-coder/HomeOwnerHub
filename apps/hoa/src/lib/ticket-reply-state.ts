// Who spoke last on a ticket, for the board's /tickets list.
// Not a 'use server' file: tickets.ts can export only async server actions.

import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllResult } from '@/lib/supabase/read-all'

export type ReplyState = 'resident' | 'board'

export interface LatestMessageRow {
  ticket_id: string
  author_role: string
  created_at: string
}

export const REPLY_CHIP_LABEL: Record<ReplyState, string> = {
  resident: 'Resident replied',
  board: 'Waiting on resident',
}

/** Ids per `.in()` request, to keep the URL short. */
const ID_CHUNK = 100

/**
 * The latest non-internal message's author per ticket. The caller passes the
 * non-internal rows only; the newest per ticket wins, whatever the row order.
 * A ticket with no messages gets no entry (no chip).
 */
export function deriveReplyStates(rows: readonly LatestMessageRow[]): Map<string, ReplyState> {
  const newest = new Map<string, LatestMessageRow>()
  for (const r of rows) {
    const cur = newest.get(r.ticket_id)
    if (!cur || r.created_at > cur.created_at) newest.set(r.ticket_id, r)
  }
  const out = new Map<string, ReplyState>()
  for (const [id, r] of newest) {
    out.set(id, r.author_role === 'resident' ? 'resident' : 'board')
  }
  return out
}

/**
 * One paged, org-scoped read of the non-internal messages for these tickets,
 * reduced to who spoke last. Returns null when any read fails, so a caller
 * shows no chips rather than wrong ones. ticket_messages carries no org
 * column, so the scope is the inner join on the ticket's organization.
 */
export async function loadReplyStates(
  supabase: SupabaseClient,
  organizationId: string,
  ticketIds: readonly string[],
): Promise<Map<string, ReplyState> | null> {
  if (ticketIds.length === 0) return new Map()
  const all: LatestMessageRow[] = []
  for (let i = 0; i < ticketIds.length; i += ID_CHUNK) {
    const chunk = ticketIds.slice(i, i + ID_CHUNK)
    const res = await readAllResult<LatestMessageRow>((from, to) =>
      supabase
        .from('ticket_messages' as never)
        .select('ticket_id, author_role, created_at, ticket:tickets!inner(organization_id)')
        .eq('ticket.organization_id' as never, organizationId)
        .eq('internal', false)
        .in('ticket_id', chunk)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to) as never,
    )
    if (res.error) return null
    all.push(...((res.data ?? []) as LatestMessageRow[]))
  }
  return deriveReplyStates(all)
}
