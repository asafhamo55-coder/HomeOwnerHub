/**
 * The reporting period for a monthly board packet (BL-016): the calendar
 * month before the meeting. A meeting on 2026-10-14 reports September
 * 2026 (2026-09-01 – 2026-09-30).
 *
 * Pure calendar arithmetic on 'YYYY-MM-DD' (BL-043, BL-051). `meeting_date`
 * is a calendar date, not an instant, so it never goes through
 * `new Date('2026-10-01')` — that is midnight UTC, still Sep 30 west of
 * Greenwich, and would shift the packet a whole month for a meeting on the
 * 1st (see lib/association-time.ts). Nothing here depends on the process
 * time zone.
 */
import { addCalendarDays } from '@/lib/association-time'
import { formatDay } from '@/lib/money/format'

export interface PacketPeriod {
  /** First day of the month, 'YYYY-MM-DD'. */
  start: string
  /** Last day of the month, 'YYYY-MM-DD' (inclusive). Every "as of" in the packet is the close of this day. */
  end: string
  /**
   * The day after `end` (the meeting month's 1st). A balance "as of the
   * close of `end`" is measured at the start of this day: a charge due
   * before it is late, a payment made on or after it hadn't happened yet.
   */
  after: string
  /** "September 2026". */
  label: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Returns null for anything that is not a real 'YYYY-MM-DD' date. */
export function packetPeriod(meetingDate: string | null | undefined): PacketPeriod | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(meetingDate ?? '')
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) // 1–12
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null

  const pYear = month === 1 ? year - 1 : year
  const pMonth = month === 1 ? 12 : month - 1
  const after = `${year}-${pad(month)}-01`
  return {
    start: `${pYear}-${pad(pMonth)}-01`,
    end: addCalendarDays(after, -1),
    after,
    label: formatDay(`${pYear}-${pad(pMonth)}-01`, 'month'),
  }
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Days in a month (1–12), leap years included. No Date involved. */
function daysIn(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return month === 2 && leap ? 29 : DAYS[month - 1]!
}
