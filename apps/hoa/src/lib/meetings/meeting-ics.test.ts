import { describe, expect, it } from 'vitest'
import { buildIcs, escapeIcsText, foldIcsLine } from '@/lib/ics'
import { buildMeetingIcs, meetingIcsFilename } from './meeting-ics'

const NOW = new Date('2026-10-20T15:00:00Z')
const MEETING = '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40'

function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '')
}

describe('buildIcs', () => {
  it('a timed event: CRLF lines, UTC start and end, required fields', () => {
    const ics = buildIcs({
      uid: 'x@y',
      summary: 'Board',
      date: '2026-11-04',
      start: { at: new Date('2026-11-05T00:00:00Z'), minutes: 60 },
      now: NOW,
    })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTAMP:20261020T150000Z')
    expect(ics).toContain('DTSTART:20261105T000000Z')
    expect(ics).toContain('DTEND:20261105T010000Z')
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  })

  it('no start: an all-day event ending the next day (month rollover)', () => {
    const ics = buildIcs({ uid: 'x', summary: 'S', date: '2026-10-31', now: NOW })
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031')
    expect(ics).toContain('DTEND;VALUE=DATE:20261101')
  })

  it('rejects a bad date', () => {
    expect(() => buildIcs({ uid: 'x', summary: 'S', date: '10/31/2026' })).toThrow()
  })

  it('escapes text and drops control characters (no property injection)', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const ics = buildIcs({ uid: 'x', summary: 'S', date: '2026-11-04', location: 'Club\r\nATTENDEE:mailto:x@y.z', now: NOW })
    expect(ics).not.toMatch(/\r\nATTENDEE/)
    expect(unfold(ics)).toContain('LOCATION:Club\\nATTENDEE:mailto:x@y.z')
  })

  it('folds long lines at 75 octets without splitting a character', () => {
    const line = `DESCRIPTION:${'é'.repeat(80)}`
    const folded = foldIcsLine(line)
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })
})

describe('buildMeetingIcs', () => {
  const base = {
    meetingId: MEETING,
    meetingDate: '2026-11-04',
    meetingType: 'regular',
    associationName: 'Maple Grove HOA',
    timeZone: 'America/New_York',
    origin: 'https://homeownerledger.online',
    now: NOW,
  }

  it('the start time is wall time in the association’s zone', () => {
    const ics = buildMeetingIcs({ ...base, start: '19:30', where: 'Clubhouse, 100 Elm St' })
    // 19:30 EST (UTC−5 after the Nov 1 change) = 00:30Z next day.
    expect(ics).toContain('DTSTART:20261105T003000Z')
    expect(ics).toContain('DTEND:20261105T013000Z')
    expect(unfold(ics)).toContain('LOCATION:Clubhouse\\, 100 Elm St')
    expect(ics).toContain(`UID:meeting-${MEETING}@homeownerledger.online`)
    expect(ics).toContain('SUMMARY:Maple Grove HOA: Board meeting')
    expect(unfold(ics)).toContain('https://homeownerledger.online/resident/meetings')
  })

  it('no (or a malformed) start time → all-day', () => {
    expect(buildMeetingIcs(base)).toContain('DTSTART;VALUE=DATE:20261104')
    expect(buildMeetingIcs({ ...base, start: '7pm' })).toContain('DTSTART;VALUE=DATE:20261104')
  })

  it('carries no PII: no organizer, no attendees, no email addresses, only the fields given', () => {
    const ics = unfold(buildMeetingIcs({ ...base, start: '18:00', where: 'Clubhouse' }))
    expect(ics).not.toMatch(/ORGANIZER|ATTENDEE/)
    expect(ics).not.toContain('mailto:')
    // The only "@" is the UID's host.
    expect(ics.match(/@/g)).toHaveLength(1)
    // Every property is one the builder writes on purpose.
    const props = ics
      .split('\r\n')
      .filter(Boolean)
      .map((l) => l.split(/[:;]/)[0])
    expect(new Set(props)).toEqual(
      new Set([
        'BEGIN', 'VERSION', 'PRODID', 'CALSCALE', 'METHOD', 'UID', 'DTSTAMP', 'DTSTART', 'DTEND',
        'SUMMARY', 'LOCATION', 'DESCRIPTION', 'URL', 'END',
      ]),
    )
  })

  it('filename is the date only', () => {
    expect(meetingIcsFilename('2026-11-04')).toBe('meeting-2026-11-04.ics')
    expect(meetingIcsFilename('../etc')).toBe('meeting-notice.ics')
  })
})
