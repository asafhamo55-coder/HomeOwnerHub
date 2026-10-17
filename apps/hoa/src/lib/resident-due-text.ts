// Due-date copy for the resident dues screens (/resident, /resident/dues).
//
// `due_date` is a DATE column — a calendar day, not an instant. It must never
// go through `new Date('2026-10-01')`: that is UTC midnight, which is still
// Sep 30 in every US zone, so a charge due Oct 1 read "Due Sep 30". All
// formatting and day math goes through lib/money/format, which works on the
// Y-M-D parts in UTC so no zone can shift them.

import { daysSince, formatDay } from './money/format'

/**
 * "Due Oct 1, 2026", plus "· N days late" / "· due today" for past-due charges.
 * `today` is 'YYYY-MM-DD' — pass `ResidentDues.today`, the association day
 * `getResidentDues` judged `pastDue` against, so the two can't disagree.
 * Required: a default here is how this once used the UTC day (BL-043).
 */
export function chargeDueText(charge: { dueDate: string; pastDue: boolean }, today: string): string {
  const due = `Due ${formatDay(charge.dueDate)}`
  if (!charge.pastDue) return due
  const daysLate = daysSince(charge.dueDate, today)
  return daysLate > 0 ? `${due} · ${daysLate} ${daysLate === 1 ? 'day' : 'days'} late` : `${due} · due today`
}

/** "Next due Oct 1, 2026". */
export function nextDueText(nextDueDate: string): string {
  return `Next due ${formatDay(nextDueDate)}`
}
