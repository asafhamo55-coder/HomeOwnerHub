/**
 * The reporting period for a monthly board packet (BL-016): the calendar
 * month before the meeting. A meeting on 2026-10-14 reports September
 * 2026 (2026-09-01 – 2026-09-30).
 *
 * Pure string arithmetic on 'YYYY-MM-DD'. `meeting_date` is a calendar
 * date, not an instant, so it never goes through `new Date('2026-10-01')`
 * — that is midnight UTC, still Sep 30 west of Greenwich, and would shift
 * the packet a whole month for a meeting on the 1st (the BL-043 bug class;
 * see lib/money/format.ts).
 */
import { formatDay } from '@/lib/money/format'

export interface PacketPeriod {
  /** First day of the month, 'YYYY-MM-DD'. */
  start: string
  /** Last day of the month, 'YYYY-MM-DD' (inclusive). */
  end: string
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
  const start = `${pYear}-${pad(pMonth)}-01`
  const end = `${pYear}-${pad(pMonth)}-${pad(daysIn(pYear, pMonth))}`
  return { start, end, label: formatDay(start, 'month') }
}

/** Days in a month (1–12), leap years included. Day 0 of the next month in UTC. */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
