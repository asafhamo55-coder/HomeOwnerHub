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
 * Each association's day comes from its own zone (BL-043,
 * ../association-time.ts — derived from its state).
 */

import { createHash } from 'node:crypto'
import { DEFAULT_ASSOCIATION_TIME_ZONE, addCalendarDays, calendarDaysBetween, hourIn, instantAtLocalTime, todayIn } from '../association-time'

/** The CRON's zone (job.ts fires at 9am here). Not an association's zone:
 *  that is `associationTimeZone(association)`. */
export const REMINDER_TIME_ZONE = 'America/New_York'
/** Hour, in REMINDER_TIME_ZONE, the cron fires (see job.ts). */
export const REMINDER_RUN_HOUR = 9
/**
 * A step whose day was missed (outage, a deploy that skipped a run) still
 * goes out this many days late. Beyond that it is dropped rather than sent
 * stale — and turning reminders on never back-fills a month of history.
 */
export const CATCH_UP_DAYS = 2

/** 'YYYY-MM-DD' (or the date part of a timestamp) → UTC-midnight ms. */
export function parseDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return calendarDaysBetween(from, to)
}

export function addDays(day: string, n: number): string {
  if (parseDay(day) === null) throw new Error('addDays: not a YYYY-MM-DD date')
  return addCalendarDays(day, n)
}

/** The calendar day it is in `timeZone` (an association's zone) at `now`. */
export function todayInZone(now: Date, timeZone: string = DEFAULT_ASSOCIATION_TIME_ZONE): string {
  return todayIn(timeZone, now)
}

/**
 * The association day on which the next 9am-Eastern run happens: find the
 * next run instant in the CRON's zone (today until 9am Eastern, then
 * tomorrow), then ask what day that instant is for the association.
 */
export function nextRunDate(now: Date, timeZone: string = DEFAULT_ASSOCIATION_TIME_ZONE): string {
  const cronDay = todayIn(REMINDER_TIME_ZONE, now)
  const runDay = hourIn(REMINDER_TIME_ZONE, now) < REMINDER_RUN_HOUR ? cronDay : addCalendarDays(cronDay, 1)
  return todayIn(timeZone, instantAtLocalTime(runDay, REMINDER_RUN_HOUR, REMINDER_TIME_ZONE))
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
