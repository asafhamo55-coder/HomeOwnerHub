// Business-day and calendar-day arithmetic on yyyy-mm-dd days (BL-087).
//
// Pure: no clock, no zone. Days are calendar dates in the association's
// zone already (todayIn), so the math runs on UTC midnights and never
// shifts a day.
//
// "Business day" is not defined in Fla. Stat. ch. 720. This skips
// Saturdays, Sundays and the eleven US federal holidays (5 U.S.C. § 6103),
// moved to the Friday before or Monday after when they fall on a weekend.
// The page tells the board to allow for any other closure (a county
// holiday, a storm) itself.

const DAY_MS = 86_400_000
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDay(s: string): boolean {
  const m = ISO_DAY.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toISOString().slice(0, 10) === s
}

function toUtc(day: string): number {
  const m = ISO_DAY.exec(day)
  if (!m) throw new Error(`not a yyyy-mm-dd day: ${day}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function addCalendarDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * DAY_MS)
}

/** Same day of the month `n` months on, clamped to the month's last day. */
export function addMonths(day: string, n: number): string {
  const d = new Date(toUtc(day))
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + n
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return fromUtc(Date.UTC(y, m, Math.min(d.getUTCDate(), last)))
}

/** Whole calendar days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: string): number {
  return new Date(toUtc(day)).getUTCDay()
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** The `nth` (1-based) `dow` of a month; nth = -1 is the last one. */
function nthWeekday(year: number, month: number, dow: number, nth: number): string {
  if (nth > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    return ymd(year, month, 1 + ((dow - first + 7) % 7) + (nth - 1) * 7)
  }
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lastDow = new Date(Date.UTC(year, month - 1, lastDate)).getUTCDay()
  return ymd(year, month, lastDate - ((lastDow - dow + 7) % 7))
}

/** A fixed-date holiday on a Saturday is observed Friday; on a Sunday, Monday. */
function observed(day: string): string {
  const w = weekday(day)
  return w === 6 ? addCalendarDays(day, -1) : w === 0 ? addCalendarDays(day, 1) : day
}

export interface Holiday {
  day: string
  name: string
}

/** The US federal holidays observed in `year`, in date order. */
export function usFederalHolidays(year: number): Holiday[] {
  const list: Holiday[] = [
    { day: observed(ymd(year, 1, 1)), name: 'New Year’s Day' },
    { day: nthWeekday(year, 1, 1, 3), name: 'Martin Luther King Jr. Day' },
    { day: nthWeekday(year, 2, 1, 3), name: 'Washington’s Birthday' },
    { day: nthWeekday(year, 5, 1, -1), name: 'Memorial Day' },
    { day: observed(ymd(year, 6, 19)), name: 'Juneteenth' },
    { day: observed(ymd(year, 7, 4)), name: 'Independence Day' },
    { day: nthWeekday(year, 9, 1, 1), name: 'Labor Day' },
    { day: nthWeekday(year, 10, 1, 2), name: 'Columbus Day' },
    { day: observed(ymd(year, 11, 11)), name: 'Veterans Day' },
    { day: nthWeekday(year, 11, 4, 4), name: 'Thanksgiving Day' },
    { day: observed(ymd(year, 12, 25)), name: 'Christmas Day' },
  ]
  // New Year's Day of the NEXT year observed on Dec 31 of this one.
  const nextNewYear = observed(ymd(year + 1, 1, 1))
  if (nextNewYear.startsWith(`${year}-`)) list.push({ day: nextNewYear, name: 'New Year’s Day (observed)' })
  return list.sort((a, b) => a.day.localeCompare(b.day))
}

export function holidayOn(day: string): Holiday | null {
  const year = Number(day.slice(0, 4))
  return usFederalHolidays(year).find((h) => h.day === day) ?? null
}

export function isBusinessDay(day: string): boolean {
  const w = weekday(day)
  return w !== 0 && w !== 6 && holidayOn(day) === null
}

/**
 * The day `n` business days after `start`. The start day itself never
 * counts ("within 10 business days after receiving"), so a Friday
 * request plus 1 is the next Monday (or Tuesday, after a Monday holiday).
 */
export function addBusinessDays(start: string, n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error('business days must be a whole number of 0 or more')
  let day = start
  let left = n
  while (left > 0) {
    day = addCalendarDays(day, 1)
    if (isBusinessDay(day)) left -= 1
  }
  return day
}

/** The holidays skipped between `start` (exclusive) and `end` (inclusive). */
export function holidaysBetween(start: string, end: string): Holiday[] {
  const out: Holiday[] = []
  for (let day = addCalendarDays(start, 1); day <= end; day = addCalendarDays(day, 1)) {
    const h = holidayOn(day)
    if (h && weekday(day) !== 0 && weekday(day) !== 6) out.push(h)
  }
  return out
}
