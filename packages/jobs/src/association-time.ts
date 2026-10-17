/**
 * The association's day (BL-043). Pure, dependency-free, browser-safe.
 *
 * Two different kinds of date flow through the product and they must not
 * be mixed:
 *
 *  - Date-only columns (due_date, meeting_date, coi_expiration_date …) are
 *    CALENDAR DATES. They are compared and stepped on their Y-M-D parts
 *    only. `new Date('2026-10-01')` is midnight UTC — Sep 30 in every US
 *    zone — so no Date-at-UTC-midnight arithmetic is done on them here.
 *  - "Today", and the day a timestamp (paid_at, created_at) falls on, is a
 *    question about an INSTANT, and the answer depends on where the
 *    association is. `new Date().toISOString().slice(0, 10)` is the UTC day,
 *    which after ~8pm Eastern is already tomorrow: charges read "due today"
 *    a day early and a 10pm payment posted to the next day.
 *
 * There is no timezone column. The zone is derived from the association's
 * state in `associationTimeZone`, the ONE place to change when a
 * `timezone` column lands: pass it as `{ state, timezone }` and it wins.
 *
 * Lives in packages/jobs because the jobs cannot import apps/hoa; apps/hoa
 * re-exports it from `@/lib/association-time`, so both sides share one copy.
 */

/** Used when the state is missing or unrecognised. */
export const DEFAULT_ASSOCIATION_TIME_ZONE = 'America/New_York'

const ET = 'America/New_York'
const CT = 'America/Chicago'
const MT = 'America/Denver'
const PT = 'America/Los_Angeles'

/**
 * USPS code → the zone most of the state's population lives in. States
 * split across two zones (FL panhandle, TN, KY, IN, MI, ND, SD, NE, KS, ID,
 * OR, TX's far west) take the majority zone; an association in the
 * minority part needs the future `timezone` override.
 */
const STATE_TIME_ZONES: Readonly<Record<string, string>> = {
  AL: CT, AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: CT, CA: PT,
  CO: MT, CT: ET, DE: ET, DC: ET, FL: ET, GA: ET, HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: CT, IN: 'America/Indiana/Indianapolis', IA: CT,
  KS: CT, KY: ET, LA: CT, ME: ET, MD: ET, MA: ET, MI: 'America/Detroit',
  MN: CT, MS: CT, MO: CT, MT: MT, NE: CT, NV: PT, NH: ET, NJ: ET, NM: MT,
  NY: ET, NC: ET, ND: CT, OH: ET, OK: CT, OR: PT, PA: ET, RI: ET, SC: ET,
  SD: CT, TN: CT, TX: CT, UT: MT, VT: ET, VA: ET, WA: PT, WV: ET, WI: CT,
  WY: MT,
  PR: 'America/Puerto_Rico', VI: 'America/St_Thomas', GU: 'Pacific/Guam',
  AS: 'Pacific/Pago_Pago', MP: 'Pacific/Saipan',
}

/**
 * The `associations` columns `associationTimeZone` needs, for `.select()`.
 * When a timezone column lands, add it here — every reader (apps/hoa and
 * the jobs) selects through this constant, and `associationTimeZone`
 * already prefers an explicit `timezone` over the state.
 */
export const ASSOCIATION_ZONE_COLUMNS = 'state'

/** What `associationTimeZone` reads. `timezone` is the future column. */
export interface AssociationZoneSource {
  state?: string | null
  timezone?: string | null
}

const validZones = new Map<string, boolean>()

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false
  let ok = validZones.get(tz)
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      ok = true
    } catch {
      ok = false
    }
    validZones.set(tz, ok)
  }
  return ok
}

/**
 * The association's IANA zone. An explicit, valid `timezone` wins; else the
 * state's zone; else America/New_York.
 */
export function associationTimeZone(source: AssociationZoneSource | null | undefined): string {
  const explicit = source?.timezone?.trim()
  if (explicit && isValidTimeZone(explicit)) return explicit
  const code = source?.state?.trim().toUpperCase()
  return (code && STATE_TIME_ZONES[code]) || DEFAULT_ASSOCIATION_TIME_ZONE
}

// ─── instants → days ───────────────────────────────────────────────

const partFormatters = new Map<string, Intl.DateTimeFormat>()

function zonedParts(instant: Date, timeZone: string) {
  let fmt = partFormatters.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    partFormatters.set(timeZone, fmt)
  }
  const out: Record<string, string> = {}
  for (const p of fmt.formatToParts(instant)) out[p.type] = p.value
  return {
    day: `${out.year}-${out.month}-${out.day}`,
    year: Number(out.year),
    month: Number(out.month),
    dayOfMonth: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  }
}

/** Today as 'YYYY-MM-DD' in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return zonedParts(now, timeZone || DEFAULT_ASSOCIATION_TIME_ZONE).day
}

/** The wall-clock hour (0–23) in `timeZone` at `now`. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  return zonedParts(now, timeZone).hour
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The calendar day an instant falls on in `timeZone`. A bare 'YYYY-MM-DD'
 * is already a calendar date and is returned as-is (never re-parsed as UTC
 * midnight); null for anything unparseable.
 */
export function dayOf(value: string | Date | null | undefined, timeZone: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' && DATE_ONLY.test(value)) return value
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return zonedParts(d, timeZone).day
}

/**
 * The instant at which the wall clock in `timeZone` reads `hour`:00 on
 * `day`. For an hour skipped by spring-forward this lands an hour later.
 */
export function instantAtLocalTime(day: string, hour: number, timeZone: string): Date {
  const base = parseCalendarDay(day)
  if (base === null) throw new Error('instantAtLocalTime: not a YYYY-MM-DD date')
  const wanted = base + hour * 3_600_000
  // Guess the offset at the wanted wall time, then correct once (an
  // offset change between guess and answer is at most one DST step).
  let guess = wanted
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone)
    const wall = Date.UTC(p.year, p.month - 1, p.dayOfMonth, p.hour, p.minute, p.second)
    guess += wanted - wall
  }
  return new Date(guess)
}

// ─── calendar dates ────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

/** 'YYYY-MM-DD' (or the date part of a timestamp string) → its Y-M-D as a UTC ms key. */
function parseCalendarDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}

/** -1 / 0 / 1 comparing the Y-M-D parts of two date-only values. */
export function dateOnlyCompare(a: string, b: string): -1 | 0 | 1 {
  const x = a.slice(0, 10)
  const y = b.slice(0, 10)
  return x < y ? -1 : x > y ? 1 : 0
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier); NaN if unparseable. */
export function calendarDaysBetween(from: string, to: string): number {
  const a = parseCalendarDay(from)
  const b = parseCalendarDay(to)
  if (a === null || b === null) return Number.NaN
  return Math.round((b - a) / MS_PER_DAY)
}

/** `day` plus `n` calendar days, as 'YYYY-MM-DD'. */
export function addCalendarDays(day: string, n: number): string {
  const ms = parseCalendarDay(day)
  if (ms === null) throw new Error('addCalendarDays: not a YYYY-MM-DD date')
  return new Date(ms + n * MS_PER_DAY).toISOString().slice(0, 10)
}
