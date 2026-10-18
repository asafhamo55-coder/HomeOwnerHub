/**
 * The month a month-end board report covers (BL-073). Pure.
 *
 * Calendar arithmetic on Y-M-D parts only (BL-043): nothing here builds a
 * `Date` from a calendar date, so neither the process zone nor DST can
 * shift a month. "Which month just ended" is a question about an instant
 * and an association: its own day comes from `todayIn(timeZone)`.
 *
 * The shape matches apps/hoa's board-packet `PacketPeriod` (start / end /
 * after / label): `packetPeriod(month.after)` there yields the same month,
 * which is how the report reuses the packet's loaders unchanged.
 */

import { addCalendarDays, todayIn } from '../association-time'

/** 08:00 Eastern on the 1st. Every US zone is already on the 1st then. */
export const MONTHLY_REPORT_CRON = 'TZ=America/New_York 0 8 1 * *'

export interface ReportMonth {
  /** 'YYYY-MM' — the idempotency key's month part. */
  month: string
  /** First day, 'YYYY-MM-DD'. */
  start: string
  /** Last day (inclusive). Every "as of" in the report is the close of this day. */
  end: string
  /** The 1st of the next month: balances "as of the close of `end`" are measured here. */
  after: string
  /** "September 2026". */
  label: string
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM' → the month, or null for anything else. */
export function reportMonthOf(month: string | null | undefined): ReportMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? '')
  if (!m) return null
  const year = Number(m[1])
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) return null
  const after = mon === 12 ? `${year + 1}-01-01` : `${year}-${pad(mon + 1)}-01`
  return {
    month: `${year}-${pad(mon)}`,
    start: `${year}-${pad(mon)}-01`,
    end: addCalendarDays(after, -1),
    after,
    label: `${MONTH_NAMES[mon - 1]} ${year}`,
  }
}

/** The calendar month before the association's today. */
export function previousMonthIn(timeZone: string, now: Date): ReportMonth {
  const [y, m] = todayIn(timeZone, now).split('-').map(Number) as [number, number]
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
  return reportMonthOf(prev)!
}

/** True once the association's day has reached the 1st of the following month. */
export function isCompleteMonth(month: ReportMonth, timeZone: string, now: Date): boolean {
  return todayIn(timeZone, now) >= month.after
}
