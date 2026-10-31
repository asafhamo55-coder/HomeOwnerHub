// "Approved, past completion date" on /arc. Pure: a rule and a URL view, no
// reads. `proposed_completion` is a DATE column (a bare YYYY-MM-DD), so it is
// compared as a day against today's date in the association's zone, never as
// an instant. The completion day itself is not overdue; the day after is.

import { todayIn } from '../association-time'

export const ARC_OVERDUE_VIEW = 'overdue-completion'

export type ArcView = typeof ARC_OVERDUE_VIEW | null

/** `?view=` is either the one known view or nothing. */
export function parseArcView(raw: string | null | undefined): ArcView {
  return raw === ARC_OVERDUE_VIEW ? ARC_OVERDUE_VIEW : null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** True for an approved request whose proposed completion day is before `today` (YYYY-MM-DD). */
export function isCompletionOverdue(
  row: { status: string; proposed_completion: string | null | undefined },
  today: string,
): boolean {
  if (row.status !== 'approved') return false
  const day = row.proposed_completion
  if (!day || !DAY.test(day) || !DAY.test(today)) return false
  return day < today
}

/** Today's date in the association's zone, the day the rule above compares against. */
export function overdueCutoff(timeZone: string, now: Date = new Date()): string {
  return todayIn(timeZone, now)
}
