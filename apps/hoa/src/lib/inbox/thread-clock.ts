/**
 * BL-134 (inbox plan B1) — a thread's reply clock and snooze, read from
 * the inbox_threads columns migration 0067 adds (first_inbound_at,
 * first_response_at, snoozed_until; the clock is maintained by 0067's
 * inbox_messages_reply_clock trigger).
 *
 * Inert until M3_APPLIED: with the flag off `loadThreadClock` returns null
 * without a query (the columns may not exist yet), and the thread page
 * renders exactly as before. A failed read also returns null (logged by
 * code): the clock is enrichment, never page-defining.
 *
 * No 'use server': read from the thread page with the board's RLS client.
 * Ids and codes only in logs.
 */

import { M3_APPLIED } from '@homeowner-portal/db/m3'

export interface ThreadClock {
  firstInboundAt: string | null
  firstResponseAt: string | null
  snoozedUntil: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

export async function loadThreadClock(
  db: LooseDb,
  orgId: string,
  threadId: string,
  live: boolean = M3_APPLIED,
): Promise<ThreadClock | null> {
  if (!live) return null
  const { data, error } = (await db
    .from('inbox_threads')
    .select('first_inbound_at, first_response_at, snoozed_until')
    .eq('organization_id', orgId)
    .eq('id', threadId)
    .maybeSingle()) as {
    data: { first_inbound_at: string | null; first_response_at: string | null; snoozed_until: string | null } | null
    error: { code?: string } | null
  }
  if (error) {
    console.error('loadThreadClock: read failed', { orgId, threadId, code: error.code ?? null })
    return null
  }
  if (!data) return null
  return {
    firstInboundAt: data.first_inbound_at ?? null,
    firstResponseAt: data.first_response_at ?? null,
    snoozedUntil: data.snoozed_until ?? null,
  }
}

const HOUR_MS = 60 * 60 * 1000

function span(ms: number): string {
  const hours = ms / HOUR_MS
  if (hours < 1) return 'under an hour'
  if (hours < 48) return `${Math.floor(hours)}h`
  return `${Math.floor(hours / 24)}d`
}

/**
 * "First reply after 5h" once answered; "No reply yet · 2d since the first
 * message" while not; null when the thread has no inbound message (the
 * board started it) or the clock is unknown.
 */
export function replyClockLabel(clock: ThreadClock | null, now: number): string | null {
  if (!clock?.firstInboundAt) return null
  const first = Date.parse(clock.firstInboundAt)
  if (!Number.isFinite(first)) return null
  if (clock.firstResponseAt) {
    const replied = Date.parse(clock.firstResponseAt)
    if (!Number.isFinite(replied)) return null
    return `First reply after ${span(Math.max(0, replied - first))}`
  }
  return `No reply yet · ${span(Math.max(0, now - first))} since the first message`
}
