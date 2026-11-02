/**
 * BL-156: ballot deadlines are read and shown on the association's clock
 * (its state's zone, via lib/association-time), never the board member's
 * device and never the server's. Pure, so the form can preview with it.
 *
 * A datetime-local input carries no zone. We turn "2026-11-05T18:00" into an
 * instant by asking the association's zone what offset applied at that wall
 * time. Spring-forward gap times (which do not exist) land just after the gap;
 * a fall-back hour that happens twice resolves to one of the two real instants.
 */
import { instantAtLocalTime, isValidTimeZone } from '@/lib/association-time'

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/

/** "YYYY-MM-DDTHH:mm" on the clock of `timeZone` -> ISO instant, or null if it is not a real date and time. */
export function localInputToInstant(local: string, timeZone: string): string | null {
  const m = LOCAL.exec(typeof local === 'string' ? local : '')
  if (!m || !isValidTimeZone(timeZone)) return null
  const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]
  if (h > 23 || mi > 59) return null
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  const direct = resolveWall(wall, timeZone)
  if (wallOf(direct, timeZone) === wall) return new Date(direct).toISOString()
  // The wall time is in a spring-forward gap. Use the same minute an hour on, after the gap.
  return new Date(resolveWall(wall + 3_600_000, timeZone)).toISOString()
}

/** Wall-clock reading of `instantMs` in `timeZone`, as a UTC-style ms number. */
function wallOf(instantMs: number, timeZone: string): number {
  const parts: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs))) {
    parts[p.type] = p.value
  }
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
}

/** The instant whose wall clock reads `wall` (a gap time returns something that does not read `wall`). */
function resolveWall(wall: number, timeZone: string): number {
  const day = new Date(wall).toISOString().slice(0, 10)
  const mins = new Date(wall).getUTCHours() * 60 + new Date(wall).getUTCMinutes()
  // Whole hours through the shared helper (it finds the offset), then the minutes.
  // Zones change offset on the hour, so the minutes never straddle a change.
  const hourStart = instantAtLocalTime(day, Math.floor(mins / 60), timeZone).getTime()
  return hourStart + (mins % 60) * 60_000
}

/** "Nov 5, 2026, 6:00 PM EST" on the association's clock. Empty for no usable time. */
export function formatBallotTime(value: string | Date | null | undefined, timeZone: string): string {
  if (value === null || value === undefined || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime()) || !isValidTimeZone(timeZone)) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

/** "Eastern Time", for a sentence telling the board which clock the form uses. */
export function zoneDescription(timeZone: string): string {
  if (!isValidTimeZone(timeZone)) return timeZone
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longGeneric' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? timeZone
}
