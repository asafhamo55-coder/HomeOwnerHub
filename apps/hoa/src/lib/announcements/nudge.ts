/**
 * BL-173: "the next occasion coming up" for the dashboard card and the
 * digest line. A static date table, no database.
 *
 * Each rule gives one date per year. The nudge key is `<occasion>:<year of
 * the date>`, so dismissing Halloween 2026 does not hide Halloween 2027.
 * Because the key is per occasion, every entry has its own occasion id
 * (daylight saving ending and starting are two occasions).
 *
 * Each entry can set `leadDays`, how far ahead it appears (default 7).
 * When several fall in their windows at once, the nearest is the card and
 * the rest are listed in `others` (one card, never a stack).
 *
 * Pure and client-safe. Nothing here logs.
 */

import { getOccasion } from './occasions'

type Rule =
  | { kind: 'fixed'; month: number; day: number }
  /** The nth weekday of a month; n = -1 means the last one. weekday 0 = Sunday. */
  | { kind: 'nth'; month: number; weekday: number; n: number }
  /**
   * The week (starting on `weekStart`, 0 = Sunday) that contains month/day;
   * the rule's date is that week's first day.
   */
  | { kind: 'weekContaining'; month: number; day: number; weekStart: number }

export interface NudgeEntry {
  occasionId: string
  rule: Rule
  /** The short name used in "<name> is Friday". */
  name: string
  /**
   * Days ahead the card first appears. Defaults to NUDGE_WINDOW_DAYS (7).
   * Greetings 3 to 5; things that need planning 10 to 14.
   */
  leadDays?: number
}

/**
 * Only occasions with a date that does not move with the community. Yard
 * sale, meetings, trash, landscaping and pet reminders have no date of
 * their own, so they are never nudged (they are always one tap away on the
 * grid). No religious-only holidays: "The holidays" is the one general
 * seasonal greeting.
 */
export const NUDGE_TABLE: readonly NudgeEntry[] = [
  // New Year: nudged from Dec 25, the week the board is writing holiday notes.
  { occasionId: 'new-year', name: 'New Year', rule: { kind: 'fixed', month: 1, day: 1 }, leadDays: 7 },
  { occasionId: 'mlk-day', name: 'Martin Luther King Jr. Day', rule: { kind: 'nth', month: 1, weekday: 1, n: 3 }, leadDays: 5 },
  { occasionId: 'valentines-day', name: "Valentine's Day", rule: { kind: 'fixed', month: 2, day: 14 }, leadDays: 3 },
  { occasionId: 'presidents-day', name: "Presidents' Day", rule: { kind: 'nth', month: 2, weekday: 1, n: 3 }, leadDays: 5 },
  { occasionId: 'dst-starts', name: 'The start of daylight saving time', rule: { kind: 'nth', month: 3, weekday: 0, n: 2 }, leadDays: 7 },
  { occasionId: 'earth-day', name: 'Earth Day', rule: { kind: 'fixed', month: 4, day: 22 }, leadDays: 10 },
  { occasionId: 'mothers-day', name: "Mother's Day", rule: { kind: 'nth', month: 5, weekday: 0, n: 2 }, leadDays: 5 },
  { occasionId: 'graduation', name: 'Graduation season', rule: { kind: 'fixed', month: 5, day: 20 } },
  { occasionId: 'pool-opening', name: 'Memorial Day', rule: { kind: 'nth', month: 5, weekday: 1, n: -1 }, leadDays: 10 },
  { occasionId: 'severe-weather', name: 'Hurricane season', rule: { kind: 'fixed', month: 6, day: 1 } },
  { occasionId: 'juneteenth', name: 'Juneteenth', rule: { kind: 'fixed', month: 6, day: 19 }, leadDays: 5 },
  { occasionId: 'fathers-day', name: "Father's Day", rule: { kind: 'nth', month: 6, weekday: 0, n: 3 }, leadDays: 5 },
  { occasionId: 'fourth-of-july', name: 'The Fourth of July', rule: { kind: 'fixed', month: 7, day: 4 }, leadDays: 14 },
  { occasionId: 'pool-closing', name: 'Labor Day', rule: { kind: 'nth', month: 9, weekday: 1, n: 1 } },
  // Fire Prevention Week (NFPA) is the Sunday-to-Saturday week containing
  // Oct 9; the date is that week's Sunday and the card appears a week ahead.
  { occasionId: 'fire-prevention', name: 'Fire Prevention Week', rule: { kind: 'weekContaining', month: 10, day: 9, weekStart: 0 }, leadDays: 7 },
  { occasionId: 'halloween-party', name: 'Halloween', rule: { kind: 'fixed', month: 10, day: 31 }, leadDays: 10 },
  { occasionId: 'dst-ends', name: 'The end of daylight saving time', rule: { kind: 'nth', month: 11, weekday: 0, n: 1 }, leadDays: 7 },
  { occasionId: 'veterans-day', name: 'Veterans Day', rule: { kind: 'fixed', month: 11, day: 11 }, leadDays: 5 },
  { occasionId: 'thanksgiving', name: 'Thanksgiving', rule: { kind: 'nth', month: 11, weekday: 4, n: 4 }, leadDays: 10 },
  { occasionId: 'holiday-lights', name: 'Holiday lights season', rule: { kind: 'fixed', month: 12, day: 1 }, leadDays: 14 },
  // Mid-December: the card runs Dec 8 to 15, before people leave town.
  { occasionId: 'happy-holidays', name: 'The holidays', rule: { kind: 'fixed', month: 12, day: 15 }, leadDays: 7 },
]

/** How far ahead a card appears when an entry gives no `leadDays`. */
export const NUDGE_WINDOW_DAYS = 7

export function leadDaysOf(entry: NudgeEntry): number {
  return entry.leadDays ?? NUDGE_WINDOW_DAYS
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** The day of month of the nth weekday (or the last, n = -1) of a month. */
export function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  if (n > 0) {
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    return 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay()
  return lastDay - ((lastDow - weekday + 7) % 7)
}

export function ruleDate(rule: Rule, year: number): string {
  if (rule.kind === 'weekContaining') {
    // Calendar-day arithmetic on a UTC date, never +/-24h, so DST cannot shift it.
    const d = new Date(Date.UTC(year, rule.month - 1, rule.day))
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - rule.weekStart + 7) % 7))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const day = rule.kind === 'fixed' ? rule.day : nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.n)
  return `${year}-${pad(rule.month)}-${pad(day)}`
}

function daysBetween(from: string, to: string): number {
  const f = from.split('-').map(Number) as [number, number, number]
  const t = to.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(f[0], f[1] - 1, f[2])) / 86_400_000)
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A further occasion inside its window, shown as a small "also" line. */
export interface OtherNudge {
  occasionId: string
  name: string
  /** "YYYY-MM-DD". */
  date: string
  daysAway: number
}

export interface Nudge {
  /** Stable per occasion and year; what a dismissal stores. */
  key: string
  occasionId: string
  /** "YYYY-MM-DD". */
  date: string
  daysAway: number
  /** "Halloween is Friday" / "Thanksgiving is today". */
  headline: string
  /** The question on the card. */
  prompt: string
  /** Other undismissed occasions in their windows, nearest first. */
  others: OtherNudge[]
}

const KEY_RE = /^([a-z][a-z-]*):(\d{4})$/

export function isNudgeKey(key: unknown): key is string {
  if (typeof key !== 'string') return false
  const m = KEY_RE.exec(key)
  return m !== null && NUDGE_TABLE.some((e) => e.occasionId === m[1])
}

function when(daysAway: number, date: string): string {
  if (daysAway === 0) return 'today'
  if (daysAway === 1) return 'tomorrow'
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  if (daysAway <= 6) return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!
  return `${MONTHS[m - 1]!.slice(0, 3)} ${d}`
}

/**
 * The nearest occasion that is inside its own lead window and not
 * dismissed, or null. Ties go to the earlier table entry. Anything else in
 * its window comes back in `others`. `today` is the association's own day.
 */
export function nextNudge(today: string, dismissed: ReadonlySet<string> = new Set()): Nudge | null {
  return withOthers(collectNudges(today, dismissed))
}

/** Every undismissed occasion inside its window, nearest first (table order on ties). */
function collectNudges(today: string, dismissed: ReadonlySet<string>): Nudge[] {
  const year = Number(today.slice(0, 4))
  const candidates: Nudge[] = []
  for (const entry of NUDGE_TABLE) {
    for (const y of [year, year + 1]) {
      const date = ruleDate(entry.rule, y)
      const daysAway = daysBetween(today, date)
      if (daysAway < 0 || daysAway > leadDaysOf(entry)) continue
      const key = `${entry.occasionId}:${y}`
      if (dismissed.has(key)) continue
      const label = getOccasion(entry.occasionId)?.label ?? 'an announcement'
      candidates.push({
        key,
        occasionId: entry.occasionId,
        date,
        daysAway,
        headline: `${entry.name} is ${when(daysAway, date)}`,
        prompt: `Send a notice? (${label.toLowerCase()})`,
        others: [],
      })
    }
  }
  // Array.prototype.sort is stable, so equal distances keep table order.
  candidates.sort((a, b) => a.daysAway - b.daysAway)
  return candidates
}

function withOthers(candidates: Nudge[]): Nudge | null {
  const first = candidates[0]
  if (!first) return null
  const nameOf = (id: string) => NUDGE_TABLE.find((e) => e.occasionId === id)?.name ?? id
  first.others = candidates.slice(1).map((c) => ({ occasionId: c.occasionId, name: nameOf(c.occasionId), date: c.date, daysAway: c.daysAway }))
  return first
}

/**
 * The occasion the board's daily digest mentions today, or null. The digest
 * runs every day, so it speaks only on the FIRST day an occasion is inside
 * its lead window (daysAway equals its leadDays) and on the day before
 * (daysAway 1), not daily. The nearest such occasion wins; one line, never a
 * stack. A dismissed occasion (per year) is never mentioned.
 */
export function digestNudge(today: string, dismissed: ReadonlySet<string> = new Set()): Nudge | null {
  const leadOf = (id: string) => {
    const e = NUDGE_TABLE.find((x) => x.occasionId === id)
    return e ? leadDaysOf(e) : NUDGE_WINDOW_DAYS
  }
  const due = collectNudges(today, dismissed).filter((c) => c.daysAway === leadOf(c.occasionId) || c.daysAway === 1)
  return withOthers(due)
}

/** Where the digest line goes: the announce flow, pre-filled with the occasion and its date. */
export function nudgeAnnouncePath(nudge: Pick<Nudge, 'occasionId' | 'date'>): string {
  return `/communications/announce?occasion=${encodeURIComponent(nudge.occasionId)}&date=${nudge.date}`
}

/** The email's one line: "Halloween is Saturday: send your community a note". */
export function digestNudgeText(nudge: Pick<Nudge, 'headline'>): string {
  return `${nudge.headline}: send your community a note`
}

/** The digest line for a nudge. */
export function nudgeDigestLine(nudge: Nudge): string {
  return `${nudge.headline}: a community notice is ready to send`
}
