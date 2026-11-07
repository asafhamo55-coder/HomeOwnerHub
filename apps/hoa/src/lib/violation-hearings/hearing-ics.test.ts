import { describe, expect, it } from 'vitest'
import { buildHearingIcs, hearingIcsFilename } from './hearing-ics'

const base = {
  violationId: '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40',
  hearingOn: '2026-11-20',
  hearingTime: '18:30',
  location: 'Clubhouse, 12 Oak Lane',
  timeZone: 'America/New_York',
  associationName: 'Maple Grove HOA',
  origin: 'https://app.example.com',
  now: new Date('2026-11-10T12:00:00Z'),
}

describe('buildHearingIcs', () => {
  it('has the title, the association-zone time in UTC, the place and the association name', () => {
    const ics = buildHearingIcs(base)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Violation hearing')
    expect(ics).toContain('DTSTART:20261120T233000Z')
    expect(ics).toContain('DTEND:20261121T003000Z')
    expect(ics).toContain('LOCATION:Clubhouse\\, 12 Oak Lane')
    expect(ics).toContain('DESCRIPTION:Maple Grove HOA')
    expect(ics).toContain('UID:hearing-0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40@app.example.com')
  })
  it('carries nothing beyond that: no link, organizer or attendee', () => {
    const ics = buildHearingIcs(base)
    expect(ics).not.toMatch(/ORGANIZER|ATTENDEE|URL:/)
    const keys = ics
      .split('\r\n')
      .filter((l) => /^[A-Z-]+[:;]/.test(l))
      .map((l) => l.split(/[:;]/)[0])
    expect(keys.sort()).toEqual(
      [
        'BEGIN', 'BEGIN', 'CALSCALE', 'DESCRIPTION', 'DTEND', 'DTSTAMP', 'DTSTART', 'END', 'END',
        'LOCATION', 'METHOD', 'PRODID', 'SUMMARY', 'UID', 'VERSION',
      ].sort(),
    )
  })
  it('with no time it is an all-day event; with no place there is no LOCATION', () => {
    const ics = buildHearingIcs({ ...base, hearingTime: null, location: null })
    expect(ics).toContain('DTSTART;VALUE=DATE:20261120')
    expect(ics).not.toContain('LOCATION')
  })
  it('summer time gives a different UTC hour (zone correctness)', () => {
    expect(buildHearingIcs({ ...base, hearingOn: '2026-07-20' })).toContain('DTSTART:20260720T223000Z')
  })
  it('falls back to a neutral association name', () => {
    expect(buildHearingIcs({ ...base, associationName: null })).toContain('DESCRIPTION:Your association')
  })
  it('names the file by date', () => {
    expect(hearingIcsFilename('2026-11-20')).toBe('violation-hearing-2026-11-20.ics')
    expect(hearingIcsFilename('bad')).toBe('violation-hearing-notice.ics')
  })
})
