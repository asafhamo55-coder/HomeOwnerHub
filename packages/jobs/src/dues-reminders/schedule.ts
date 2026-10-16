/**
 * Date math for automated dues reminders (BL-013). Pure.
 *
 * Due dates are DATE columns: calendar days, not instants. Everything here
 * works on their Y-M-D parts in UTC, so neither the server's timezone nor a
 * DST change can move a reminder by a day — the bug class BL-043 describes
 * (`new Date('2026-10-01')` is Sep 30 in every US zone). Same rule as
 * apps/hoa/src/lib/money/format.ts, which this package cannot import.
 *
 * "Today", by contrast, is the association's day, not the UTC day: the cron
 * runs at 9am Eastern, and at 9pm Eastern the UTC date is already tomorrow.
 */

import { createHash } from 'node:crypto'

/** The cron's zone. Per-association zones are BL-043's job; until then
 *  every association is Eastern, matching every other HOA cron here. */
export const REMINDER_TIME_ZONE = 'America/New_York'
/** Local hour the cron fires (see job.ts). */
export const REMINDER_RUN_HOUR = 9
/**
 * A step whose day was missed (outage, a deploy that skipped a run) still
 * goes out this many days late. Beyond that it is dropped rather than sent
 * stale — and turning reminders on never back-fills a month of history.
 */
export const CATCH_UP_DAYS = 2

const MS_PER_DAY = 86_400_000

/** 'YYYY-MM-DD' (or the date part of a timestamp) → UTC-midnight ms. */
export function parseDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parseDay(from)
  const b = parseDay(to)
  if (a === null || b === null) return Number.NaN
  return Math.round((b - a) / MS_PER_DAY)
}

export function addDays(day: string, n: number): string {
  const ms = parseDay(day)
  if (ms === null) throw new Error('addDays: not a YYYY-MM-DD date')
  return formatDay(ms + n * MS_PER_DAY)
}

function zonedParts(now: Date, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

/** The calendar day it is in `timeZone` at `now`. */
export function todayInZone(now: Date, timeZone: string = REMINDER_TIME_ZONE): string {
  return zonedParts(now, timeZone).day
}

/** The day the next 9am-Eastern run happens (today until 9am, then tomorrow). */
export function nextRunDate(now: Date, timeZone: string = REMINDER_TIME_ZONE): string {
  const { day, hour } = zonedParts(now, timeZone)
  return hour < REMINDER_RUN_HOUR ? day : addDays(day, 1)
}

/**
 * The configured offset that fires for this due date today, or null.
 *
 * An offset fires on due + offset, or up to CATCH_UP_DAYS after if that
 * run was missed. When two offsets are inside the window only the latest
 * is returned: one assessment never gets two reminders in one day, and a
 * skipped earlier step is superseded rather than sent late on top.
 */
export function dueStep(dueDate: string, today: string, offsets: readonly number[]): number | null {
  const elapsed = daysBetween(dueDate, today)
  if (!Number.isFinite(elapsed)) return null
  let best: number | null = null
  for (const o of offsets) {
    if (o <= elapsed && elapsed - o <= CATCH_UP_DAYS && (best === null || o > best)) best = o
  }
  return best
}

/**
 * The idempotency key, as a communications.id.
 *
 * Deterministic per (assessment, step): the job INSERTs the communications
 * row with this primary key before sending, so a second attempt — a
 * re-run, an Inngest retry, two overlapping invocations — fails on the
 * primary key and sends nothing. That makes the claim atomic in Postgres
 * with no new table, column or unique index (BL-013: no migration).
 *
 * Shape: SHA-256 of a namespaced key, formatted as an RFC 9562 version-8
 * ("custom") UUID so it is a valid `uuid` value.
 */
export function reminderCommunicationId(assessmentId: string, step: number): string {
  const hex = createHash('sha256').update(`homeownerhub:dues-reminder:v1:${assessmentId}:${step}`).digest('hex')
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}
