/**
 * The digest's deterministic half.
 *
 * Division of labour with the tiles: the TILES own current numbers, the
 * DIGEST owns what changed and what to do first. Bulleting "32 emails need
 * a reply" directly above a tile reading "Needs a reply 32" is the
 * duplication this redesign exists to remove, so none of these bullets
 * restates a tile.
 *
 * Both change-bullets are computed LIVE rather than by subtracting stored
 * counts. A net subtraction reports "0 new" on a day when three arrived and
 * three were answered, which is false. The snapshot table exists for
 * point-in-time comparison the live data cannot reconstruct — "down 4 from
 * yesterday" and, later, trend arrows.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { ACTIVE_STATUSES } from './triage'

type Db = SupabaseClient<Database>

/**
 * Declared as a `type`, not an `interface`, on purpose: this is stored in
 * a jsonb column, and Supabase's generated `Json` type is
 * `{ [key: string]: Json | undefined } | …`. An interface is not assignable
 * to that — interfaces get no implicit index signature — so an interface
 * here would force a cast at the insert and give up type checking on the
 * very shape we care about.
 */
export type DigestCounts = {
  needsReply: number
  oldestWaitingDays: number | null
  untriaged: number
  approvalsPending: number
  /** Whole US dollars — the unit getDashboardKpis already returns. */
  duesOutstandingUsd: number
}

export interface DigestFacts {
  bullets: string[]
  counts: DigestCounts
}

export interface BulletInput {
  /** Null when no prior-day snapshot exists — the bullet is then omitted. */
  newSinceBaseline: number | null
  waitingOverThree: number
  /** Pre-formatted by `formatNextMeeting`, or null to omit. */
  nextMeeting: string | null
}

export function buildBullets(input: BulletInput): string[] {
  const bullets: string[] = []

  // Omitted rather than shown as "0 new": with no baseline there is
  // nothing to compare against, and claiming zero would be a claim we
  // cannot support.
  if (input.newSinceBaseline !== null && input.newSinceBaseline > 0) {
    bullets.push(
      input.newSinceBaseline === 1
        ? '1 new resident email since yesterday'
        : `${input.newSinceBaseline} new resident emails since yesterday`,
    )
  }

  if (input.waitingOverThree > 0) {
    bullets.push(
      input.waitingOverThree === 1
        ? '1 has now waited over 3 days'
        : `${input.waitingOverThree} have now waited over 3 days`,
    )
  }

  if (input.nextMeeting !== null) {
    bullets.push(input.nextMeeting)
  }

  return bullets
}

/**
 * `getNextMeeting` returns `{ id, meetingDate, meetingType, daysUntil,
 * status }` and falls back to the most recent PAST meeting when nothing is
 * upcoming, so `daysUntil` can be negative. A past meeting is dropped —
 * "Next meeting: 5 days ago" is nonsense on a card about today.
 */
export function formatNextMeeting(
  meeting: { meetingType: string | null; daysUntil: number } | null,
): string | null {
  if (meeting === null) return null
  if (meeting.daysUntil < 0) return null

  const type = meeting.meetingType ? `${meeting.meetingType} ` : ''
  if (meeting.daysUntil === 0) return `Next meeting: ${type}today`
  if (meeting.daysUntil === 1) return `Next meeting: ${type}tomorrow`
  return `Next meeting: ${type}in ${meeting.daysUntil} days`
}

/**
 * A snapshot is a valid delta baseline only if it was captured on an
 * EARLIER day. Same-day rows are rejected so the card's own refreshes
 * cannot walk the baseline forward and flatten the delta to zero.
 *
 * Both arguments are ISO date strings (YYYY-MM-DD), which compare
 * correctly with `<` lexicographically — no Date parsing, no timezone.
 */
export function isBaselineRow(capturedOn: string, today: string): boolean {
  return capturedOn < today
}

// ─── Snapshot IO ─────────────────────────────────────────────────────

function logDbError(fn: string, error: PostgrestError): void {
  console.error(`${fn} failed`, { code: error.code, message: error.message })
}


/** Today as YYYY-MM-DD, the form `captured_on` stores. */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * The most recent snapshot from an EARLIER day, or null if none exists.
 * Same-day rows are filtered out in SQL so a mid-day refresh cannot walk
 * the baseline forward.
 */
export async function readBaseline(
  db: Db,
  orgId: string,
  today: string,
): Promise<{ capturedAt: string; counts: DigestCounts } | null> {
  const { data, error } = await db
    .from('dashboard_daily_snapshots')
    .select('captured_on, captured_at, counts')
    .eq('organization_id', orgId)
    .lt('captured_on', today)
    .order('captured_on', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logDbError('readBaseline', error)
    return null
  }
  if (!data) return null

  const row = data as unknown as {
    captured_on: string
    captured_at: string
    counts: DigestCounts
  }
  if (!isBaselineRow(row.captured_on, today)) return null

  return { capturedAt: row.captured_at, counts: row.counts }
}

/**
 * One row per org per day, first write wins. A failure is logged and
 * swallowed — telemetry must never block the page.
 */
export async function writeSnapshot(
  db: Db,
  orgId: string,
  today: string,
  counts: DigestCounts,
): Promise<void> {
  const { error } = await db
    .from('dashboard_daily_snapshots')
    .upsert(
      { organization_id: orgId, captured_on: today, counts },
      { onConflict: 'organization_id,captured_on', ignoreDuplicates: true },
    )
  if (error) logDbError('writeSnapshot', error)
}

/**
 * Resident mail that arrived since the baseline instant. Computed live, not
 * by subtracting stored counts — a subtraction reports "0 new" on a day
 * when three arrived and three were answered.
 *
 * Returns null on failure so the bullet is omitted rather than shown as 0.
 */
export async function countNewSince(
  db: Db,
  orgId: string,
  since: string,
): Promise<number | null> {
  const { count, error } = await db
    .from('inbox_threads')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .not('unit_id', 'is', null)
    .eq('last_direction', 'inbound')
    .in('status', ACTIVE_STATUSES)
    .gte('last_message_at', since)

  if (error) {
    logDbError('countNewSince', error)
    return null
  }
  return count ?? 0
}
