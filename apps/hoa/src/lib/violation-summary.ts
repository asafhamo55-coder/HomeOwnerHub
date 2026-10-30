// Counts for the strip above /violations. Pure: it reads the status rows the
// page already loads for its filter chips, so it adds no query.

import { addCalendarDays, dayOf, todayIn } from './association-time'

export interface CureFields {
  status: string
  notice_sent_at: string | null
  cure_period_days: number | null
}

export interface ViolationSummaryRow extends CureFields {
  id: string
}

/**
 * The last day of the cure period, as a calendar date in the association's
 * timezone: the day the notice went out plus the cure days. Whole calendar
 * days, not 24 hour blocks, so a DST weekend never moves the date. Null
 * unless the notice is live and both inputs are known.
 */
export function cureDueDay(v: CureFields, timeZone: string): string | null {
  if (v.status !== 'notice_sent' || !v.notice_sent_at || !v.cure_period_days) return null
  const sent = dayOf(v.notice_sent_at, timeZone)
  return sent ? addCalendarDays(sent, v.cure_period_days) : null
}

/** The cure date passed: today is after the last day. The last day itself is still in time. */
export function isCurePassed(v: CureFields, timeZone: string, now: Date = new Date()): boolean {
  const due = cureDueDay(v, timeZone)
  return due !== null && todayIn(timeZone, now) > due
}

export interface ViolationSummary {
  /** Open or notice drafted: nothing has gone to the owner yet. Matches the "Needs action" chip. */
  open: number
  /** Notice sent and the cure date has not passed (or it is not recorded). */
  inCure: number
  /** Notice sent and the cure date has passed. */
  curePassed: number
  curePassedIds: string[]
}

// There is no hearing status in the violation lifecycle, so there is no hearing tile.
export function summarizeViolations(rows: readonly ViolationSummaryRow[], timeZone: string, now: Date = new Date()): ViolationSummary {
  const out: ViolationSummary = { open: 0, inCure: 0, curePassed: 0, curePassedIds: [] }
  for (const r of rows) {
    if (r.status === 'open' || r.status === 'notice_drafted') out.open++
    else if (r.status === 'notice_sent') {
      if (isCurePassed(r, timeZone, now)) {
        out.curePassed++
        out.curePassedIds.push(r.id)
      } else out.inCure++
    }
  }
  return out
}
