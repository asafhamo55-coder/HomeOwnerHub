/**
 * A minimal RFC 5545 calendar file for one event (BL-118 meeting notice).
 * Pure; no I/O.
 *
 * NO PII: callers pass only the association's name, the meeting type, its
 * date, time and place, and a portal link. Never a resident's name, email,
 * address or anything from the transcript or attendee list. No ORGANIZER
 * and no ATTENDEE properties are ever written.
 */

export interface IcsEvent {
  /** Stable across re-downloads, so a calendar updates the event instead of duplicating it. */
  uid: string
  summary: string
  /** YYYY-MM-DD — the event's date (all-day when `start` is absent). */
  date: string
  /** A timed event: start instant and length. */
  start?: { at: Date; minutes: number }
  location?: string | null
  description?: string | null
  url?: string | null
  /** DTSTAMP; injectable for tests. */
  now?: Date
}

/** TEXT escaping (RFC 5545 §3.3.11). Control characters are dropped. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Fold a content line at 75 octets (RFC 5545 §3.1), never splitting a UTF-8 character. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let bytes = 0
  let limit = 75
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > limit) {
      parts.push(current)
      current = ''
      bytes = 0
      limit = 74 // continuation lines start with a space
    }
    current += ch
    bytes += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function compactDay(day: string): string {
  return day.replace(/-/g, '')
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function eventLines(event: IcsEvent): string[] {
  if (!DAY_RE.test(event.date)) throw new Error('buildIcs: date must be YYYY-MM-DD')
  const lines: string[] = ['BEGIN:VEVENT', `UID:${escapeIcsText(event.uid)}`, `DTSTAMP:${utcStamp(event.now ?? new Date())}`]
  if (event.start && !Number.isNaN(event.start.at.getTime())) {
    const end = new Date(event.start.at.getTime() + Math.max(1, event.start.minutes) * 60_000)
    lines.push(`DTSTART:${utcStamp(event.start.at)}`, `DTEND:${utcStamp(end)}`)
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDay(event.date)}`, `DTEND;VALUE=DATE:${compactDay(nextDay(event.date))}`)
  }
  lines.push(`SUMMARY:${escapeIcsText(event.summary)}`)
  if (event.location?.trim()) lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`)
  if (event.description?.trim()) lines.push(`DESCRIPTION:${escapeIcsText(event.description.trim())}`)
  if (event.url?.trim()) lines.push(`URL:${event.url.trim().replace(/[\r\n]/g, '')}`)
  lines.push('END:VEVENT')
  return lines
}

/** The .ics text (CRLF line endings) for any number of events. */
export function buildIcsCalendar(events: readonly IcsEvent[], opts: { prodId?: string } = {}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${opts.prodId ?? '-//HomeownerHub//Meeting notice//EN'}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap(eventLines),
    'END:VCALENDAR',
  ]
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

/** The .ics text (CRLF line endings) for one event. */
export function buildIcs(event: IcsEvent): string {
  return buildIcsCalendar([event])
}
