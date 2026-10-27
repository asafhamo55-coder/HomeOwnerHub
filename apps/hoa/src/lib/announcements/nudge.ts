/**
 * BL-173: "the next occasion within 7 days" for the dashboard card and the
 * digest line. A static date table, no database.
 *
 * Each rule gives one date per year. The nudge key is `<occasion>:<year of
 * the date>`, so dismissing Halloween 2026 does not hide Halloween 2027.
 *
 * Pure and client-safe. Nothing here logs.
 */

import { getOccasion } from './occasions'

type Rule =
  | { kind: 'fixed'; month: number; day: number }
  /** The nth weekday of a month; n = -1 means the last one. weekday 0 = Sunday. */
  | { kind: 'nth'; month: number; weekday: number; n: number }

export interface NudgeEntry {
  occasionId: string
  rule: Rule
  /** The short name used in "<name> is Friday". */
  name: string
}

/**
 * Only occasions with a date that does not move with the community. Yard
 * sale, meetings, trash, landscaping and pet reminders have no date of
 * their own, so they are never nudged (they are always one tap away on the
 * grid).
 */
export const NUDGE_TABLE: readonly NudgeEntry[] = [
  { occasionId: 'new-year', name: 'New Year', rule: { kind: 'fixed', month: 1, day: 1 } },
  { occasionId: 'severe-weather', name: 'Hurricane season', rule: { kind: 'fixed', month: 6, day: 1 } },
  { occasionId: 'pool-opening', name: 'Memorial Day', rule: { kind: 'nth', month: 5, weekday: 1, n: -1 } },
  { occasionId: 'graduation', name: 'Graduation season', rule: { kind: 'fixed', month: 5, day: 20 } },
  { occasionId: 'fourth-of-july', name: 'The Fourth of July', rule: { kind: 'fixed', month: 7, day: 4 } },
  { occasionId: 'pool-closing', name: 'Labor Day', rule: { kind: 'nth', month: 9, weekday: 1, n: 1 } },
  { occasionId: 'halloween-party', name: 'Halloween', rule: { kind: 'fixed', month: 10, day: 31 } },
  { occasionId: 'thanksgiving', name: 'Thanksgiving', rule: { kind: 'nth', month: 11, weekday: 4, n: 4 } },
  { occasionId: 'holiday-lights', name: 'Holiday lights season', rule: { kind: 'fixed', month: 12, day: 1 } },
  { occasionId: 'happy-holidays', name: 'The holidays', rule: { kind: 'fixed', month: 12, day: 24 } },
]

export const NUDGE_WINDOW_DAYS = 7

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
 * The nearest occasion from today through the next 7 days that the board
 * has not dismissed, or null. `today` is the association's own day.
 */
export function nextNudge(today: string, dismissed: ReadonlySet<string> = new Set()): Nudge | null {
  const year = Number(today.slice(0, 4))
  const candidates: Nudge[] = []
  for (const entry of NUDGE_TABLE) {
    for (const y of [year, year + 1]) {
      const date = ruleDate(entry.rule, y)
      const daysAway = daysBetween(today, date)
      if (daysAway < 0 || daysAway > NUDGE_WINDOW_DAYS) continue
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
      })
    }
  }
  candidates.sort((a, b) => a.daysAway - b.daysAway)
  return candidates[0] ?? null
}

/** The digest line for a nudge. */
export function nudgeDigestLine(nudge: Nudge): string {
  return `${nudge.headline}: a community notice is ready to send`
}
