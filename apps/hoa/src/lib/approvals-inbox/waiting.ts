import { APPROVAL_SOURCES, type SourceCounts } from '@/lib/approvals-inbox/model'
import { countPendingApprovals, type InboxDb } from '@/lib/approvals-inbox/load'

/**
 * What is waiting on the board, in one place. The dashboard's Approvals
 * tile, "Do this next" and the daily digest all read this, and it counts
 * the same sources, with the same predicates, as the /approvals page
 * (countPendingApprovals mirrors each section's query as a head-only count).
 * A count here and the page's "All" total can therefore not drift apart.
 */
export interface BoardWaiting {
  /** Pending per source; null = that source failed to count (unknown, not 0). */
  counts: SourceCounts
  /** Sum of the counts that loaded. A lower bound while `failed` is true. */
  total: number
  /** True when any source could not be counted. */
  failed: boolean
}

/** Pure: fold per-source counts into the tile's numbers. */
export function summarizeWaiting(counts: SourceCounts): BoardWaiting {
  const total = APPROVAL_SOURCES.reduce((n, s) => n + (counts[s] ?? 0), 0)
  return { counts, total, failed: APPROVAL_SOURCES.some((s) => counts[s] === null) }
}

/**
 * One round of parallel head-only counts. No viewerId on purpose: the page
 * lists every professional's item to every board member, so the tile must
 * too, and so does the sidebar badge. Never rejects: a
 * thrown error is every source unknown.
 */
export async function getBoardWaiting(db: InboxDb, orgId: string, opts: { m5?: boolean; m6?: boolean; m11?: boolean; now?: Date } = {}): Promise<BoardWaiting> {
  try {
    return summarizeWaiting(await countPendingApprovals(db, orgId, opts))
  } catch (e) {
    console.error('getBoardWaiting failed', { message: e instanceof Error ? e.message : String(e) })
    return summarizeWaiting(Object.fromEntries(APPROVAL_SOURCES.map((s) => [s, null])) as SourceCounts)
  }
}
