// Counts for the strip above /arc. Pure: it reads the status rows the page
// already loads for its filter chips, so it adds no query.

import { calendarDaysBetween, dayOf, todayIn } from '../association-time'
import { ARC_CLOCK_TIME_ZONE, arcClock, isArcOpen, pickArcClockSettings, type ArcClockSettings } from './clock'

export interface ArcSummaryRow {
  status: string
  association_id: string
  submitted_at: string
}

export function countByStatus(rows: readonly ArcSummaryRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1
  return out
}

/**
 * Whole calendar days the oldest application still waiting has waited, in
 * the ARC clock's zone (the same one the "Decide by" column uses). Dates are
 * compared as days, so a DST weekend never turns 3 days into 2 or 4. Null
 * when nothing is waiting.
 */
export function oldestArcWaitDays(rows: readonly ArcSummaryRow[], now: Date = new Date(), timeZone: string = ARC_CLOCK_TIME_ZONE): number | null {
  let oldest: string | null = null
  for (const r of rows) {
    if (!isArcOpen(r.status)) continue
    const day = dayOf(r.submitted_at, timeZone)
    if (day && (oldest === null || day < oldest)) oldest = day
  }
  if (oldest === null) return null
  const days = calendarDaysBetween(oldest, todayIn(timeZone, now))
  return Number.isNaN(days) ? null : Math.max(days, 0)
}

/** Waiting applications whose decide-by date has passed, by the same clock as the "Decide by" column. */
export function countPastDecideBy(
  rows: readonly ArcSummaryRow[],
  settings: ReadonlyArray<{ associationId: string; settings: ArcClockSettings }>,
  now: Date = new Date(),
): number {
  let n = 0
  for (const r of rows) {
    const clock = arcClock({
      status: r.status,
      submittedAt: r.submitted_at,
      settings: pickArcClockSettings(settings, r.association_id),
      now,
    })
    if (clock && clock.daysLeft < 0) n++
  }
  return n
}
