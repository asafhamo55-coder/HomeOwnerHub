/**
 * BL-134 (inbox plan B1) — snooze, the pure half. The action is
 * ./snooze.ts; the column is inbox_threads.snoozed_until (migration 0067),
 * used only once M3_APPLIED.
 *
 * A snoozed thread drops out of every status queue until its time comes,
 * and shows under the "Snoozed" chip meanwhile. A new inbound message
 * clears the snooze in the database (0067's inbox_messages_reply_clock
 * trigger), so a resident's reply is never hidden.
 *
 * The presets are computed in the BROWSER (the board member's own clock
 * and time zone: "tomorrow 8am" means their 8am); the server only checks
 * the instant it receives is in the future and not too far out.
 *
 * Pure and dependency-free; unit-tested.
 */

/** The longest snooze the server accepts. */
export const SNOOZE_MAX_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

export const SNOOZE_ERRORS = {
  notLive: 'Snooze isn’t available yet.',
  invalid: 'Pick when to bring this conversation back.',
  past: 'Pick a time in the future.',
  tooFar: `Snooze for ${SNOOZE_MAX_DAYS} days at most.`,
} as const

export type SnoozeCheck = { ok: true; until: string | null } | { ok: false; error: string }

/**
 * Validates the instant the client sent. null un-snoozes. Anything that is
 * not a parseable timestamp, is not in the future, or is more than
 * SNOOZE_MAX_DAYS out is refused. Returns the normalised ISO string.
 */
export function checkSnoozeUntil(until: unknown, now: number): SnoozeCheck {
  if (until === null) return { ok: true, until: null }
  if (typeof until !== 'string' || until.length > 64) return { ok: false, error: SNOOZE_ERRORS.invalid }
  const at = Date.parse(until)
  if (!Number.isFinite(at)) return { ok: false, error: SNOOZE_ERRORS.invalid }
  if (at <= now) return { ok: false, error: SNOOZE_ERRORS.past }
  if (at - now > SNOOZE_MAX_DAYS * DAY_MS) return { ok: false, error: SNOOZE_ERRORS.tooFar }
  return { ok: true, until: new Date(at).toISOString() }
}

/** True while the thread is hidden from the queues. */
export function isSnoozed(snoozedUntil: string | null | undefined, now: number): boolean {
  if (!snoozedUntil) return false
  const at = Date.parse(snoozedUntil)
  return Number.isFinite(at) && at > now
}

export interface SnoozePreset {
  key: 'later_today' | 'tomorrow' | 'friday' | 'next_week'
  label: string
  until: Date
}

function at(base: Date, addDays: number, hour: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + addDays)
  d.setHours(hour, 0, 0, 0)
  return d
}

/**
 * The menu, in the caller's local time: later today (+3h, only before
 * 6pm), tomorrow 8am, Friday 8am (when today is before Thursday), next
 * Monday 8am.
 */
export function snoozePresets(now: Date): SnoozePreset[] {
  const out: SnoozePreset[] = []
  if (now.getHours() < 18) {
    const later = new Date(now.getTime() + 3 * 60 * 60 * 1000)
    later.setMinutes(0, 0, 0)
    out.push({ key: 'later_today', label: 'Later today', until: later })
  }
  out.push({ key: 'tomorrow', label: 'Tomorrow morning', until: at(now, 1, 8) })
  const dow = now.getDay() // 0 Sunday … 6 Saturday
  if (dow <= 3) out.push({ key: 'friday', label: 'Friday morning', until: at(now, 5 - dow, 8) })
  const toMonday = ((8 - dow) % 7) || 7
  out.push({ key: 'next_week', label: 'Next week', until: at(now, toMonday, 8) })
  return out
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Snoozed until Fri, Oct 23, 8:00 AM" in the caller's local time. */
export function snoozedLabel(snoozedUntil: string): string {
  const d = new Date(snoozedUntil)
  if (!Number.isFinite(d.getTime())) return 'Snoozed'
  const h = d.getHours()
  const hour12 = h % 12 === 0 ? 12 : h % 12
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `Snoozed until ${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${hour12}:${mins} ${h < 12 ? 'AM' : 'PM'}`
}
