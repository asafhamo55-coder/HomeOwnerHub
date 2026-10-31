// Pure helpers for the RFPs list: the ?status= filter, the summary strip
// counts, per-RFP bid counts and the "Due in N days" chip. No server
// imports, so a 'use client' file may use it too.

import { calendarDaysBetween, dayOf, todayIn } from './association-time'

export type RfpsFilter = 'all' | 'draft' | 'open' | 'closing' | 'awarded'

export const RFPS_FILTERS: readonly RfpsFilter[] = ['all', 'draft', 'open', 'closing', 'awarded']

/** Unknown or missing values fall back to the default filter, All. */
export function parseRfpsFilter(raw: string | null | undefined): RfpsFilter {
  return (RFPS_FILTERS as readonly string[]).includes(raw ?? '') ? (raw as RfpsFilter) : 'all'
}

/** "Closing soon" window, in calendar days, today included. */
export const CLOSING_WINDOW_DAYS = 7

export interface RfpListRow {
  status: string
  submission_deadline: string
}

/**
 * Whole calendar days from today to the bid deadline, both read in the
 * association's zone. 0 is today, negative is past. Null when the deadline
 * is unparseable.
 */
export function daysUntilDeadline(deadline: string, timeZone: string, now: Date = new Date()): number | null {
  const due = dayOf(deadline, timeZone)
  if (!due) return null
  const n = calendarDaysBetween(todayIn(timeZone, now), due)
  return Number.isNaN(n) ? null : n
}

/** An open RFP whose deadline falls today or within the next 7 calendar days. */
export function isClosingSoon(r: RfpListRow, timeZone: string, now: Date = new Date()): boolean {
  if (r.status !== 'open') return false
  const n = daysUntilDeadline(r.submission_deadline, timeZone, now)
  return n !== null && n >= 0 && n <= CLOSING_WINDOW_DAYS
}

export function matchesRfpsFilter(r: RfpListRow, filter: RfpsFilter, timeZone: string, now: Date = new Date()): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'closing':
      return isClosingSoon(r, timeZone, now)
    default:
      return r.status === filter
  }
}

export interface RfpsSummary {
  draft: number
  open: number
  closing: number
  awarded: number
}

export function summarizeRfps(rows: readonly RfpListRow[], timeZone: string, now: Date = new Date()): RfpsSummary {
  const s: RfpsSummary = { draft: 0, open: 0, closing: 0, awarded: 0 }
  for (const r of rows) {
    if (r.status === 'draft') s.draft += 1
    else if (r.status === 'open') s.open += 1
    else if (r.status === 'awarded') s.awarded += 1
    if (isClosingSoon(r, timeZone, now)) s.closing += 1
  }
  return s
}

/** Bids that count toward an RFP: received ones. Drafts and withdrawn bids are not. */
export const COUNTED_BID_STATUSES: readonly string[] = ['submitted', 'awarded', 'declined']

/** Bids per RFP id from one grouped read. An RFP with no rows is absent: read it as 0. */
export function countBidsByRfp(rows: readonly { rfp_id: string; status: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of rows) {
    if (!COUNTED_BID_STATUSES.includes(b.status ?? '')) continue
    out[b.rfp_id] = (out[b.rfp_id] ?? 0) + 1
  }
  return out
}

/** Chip text for an open RFP, or null for any other status or a bad date. */
export function dueChipLabel(r: RfpListRow, timeZone: string, now: Date = new Date()): string | null {
  if (r.status !== 'open') return null
  const n = daysUntilDeadline(r.submission_deadline, timeZone, now)
  if (n === null) return null
  if (n < 0) return 'Past due'
  if (n === 0) return 'Due today'
  return n === 1 ? 'Due in 1 day' : `Due in ${n} days`
}
