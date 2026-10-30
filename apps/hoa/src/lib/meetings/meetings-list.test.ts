import { describe, expect, it } from 'vitest'
import {
  formatMeetingDay,
  minutesApproved,
  needsMinutes,
  parseMeetingsView,
  summarizeMeetings,
  type MeetingSummaryRow,
} from './meetings-list'

const row = (meeting_date: string, over: Partial<MeetingSummaryRow> = {}): MeetingSummaryRow => ({
  meeting_date,
  meeting_type: 'regular',
  status: 'draft',
  approved_at: null,
  ...over,
})

describe('parseMeetingsView', () => {
  it('accepts the four views and defaults to all', () => {
    expect(parseMeetingsView('upcoming')).toBe('upcoming')
    expect(parseMeetingsView('past')).toBe('past')
    expect(parseMeetingsView('needs-minutes')).toBe('needs-minutes')
    expect(parseMeetingsView('all')).toBe('all')
    expect(parseMeetingsView(undefined)).toBe('all')
    expect(parseMeetingsView('bogus')).toBe('all')
  })
})

describe('minutes approval', () => {
  it('treats status approved or a stamped approved_at as approved', () => {
    expect(minutesApproved({ status: 'approved', approved_at: null })).toBe(true)
    expect(minutesApproved({ status: 'draft', approved_at: '2026-01-01T00:00:00Z' })).toBe(true)
    expect(minutesApproved({ status: null, approved_at: null })).toBe(false)
  })
  it('flags only past, unapproved, non-archived meetings', () => {
    expect(needsMinutes(row('2026-05-01'), '2026-06-01')).toBe(true)
    expect(needsMinutes(row('2026-06-01'), '2026-06-01')).toBe(false)
    expect(needsMinutes(row('2026-05-01', { status: 'approved' }), '2026-06-01')).toBe(false)
    expect(needsMinutes(row('2026-05-01', { status: 'archived' }), '2026-06-01')).toBe(false)
  })
})

describe('summarizeMeetings', () => {
  it('counts next meeting, this year and minutes outstanding', () => {
    const rows = [
      row('2026-03-10', { status: 'approved' }),
      row('2026-04-10'),
      row('2026-12-01', { meeting_type: 'annual' }),
      row('2026-09-01', { meeting_type: 'special' }),
      row('2025-12-15'),
    ]
    const s = summarizeMeetings(rows, 'America/New_York', new Date('2026-06-15T16:00:00Z'))
    expect(s.next).toEqual({ day: '2026-09-01', type: 'special' })
    expect(s.thisYear).toBe(4)
    expect(s.needsMinutes).toBe(2)
  })

  it('has no next meeting when none are ahead', () => {
    const s = summarizeMeetings([row('2026-01-05')], 'America/New_York', new Date('2026-06-15T16:00:00Z'))
    expect(s.next).toBeNull()
  })

  it('uses the association year around Jan 1', () => {
    // 2027-01-01 03:00Z is still Dec 31 in New York, already Jan 1 in UTC.
    const now = new Date('2027-01-01T03:00:00Z')
    const rows = [row('2026-12-31'), row('2027-01-01')]
    const ny = summarizeMeetings(rows, 'America/New_York', now)
    expect(ny.today).toBe('2026-12-31')
    expect(ny.thisYear).toBe(1)
    expect(ny.next?.day).toBe('2026-12-31')
    expect(ny.needsMinutes).toBe(0)
    const utc = summarizeMeetings(rows, 'UTC', now)
    expect(utc.today).toBe('2027-01-01')
    expect(utc.thisYear).toBe(1)
    expect(utc.next?.day).toBe('2027-01-01')
    expect(utc.needsMinutes).toBe(1)
  })

  it('keeps the calendar day across a DST change', () => {
    // US spring forward is 2026-03-08. 03:30Z on the 9th is 23:30 EDT, still the 8th.
    const rows = [row('2026-03-08'), row('2026-03-09')]
    const before = summarizeMeetings(rows, 'America/New_York', new Date('2026-03-08T06:30:00Z'))
    expect(before.today).toBe('2026-03-08')
    expect(before.next?.day).toBe('2026-03-08')
    const late = summarizeMeetings(rows, 'America/New_York', new Date('2026-03-09T03:30:00Z'))
    expect(late.today).toBe('2026-03-08')
    expect(late.needsMinutes).toBe(0)
    const after = summarizeMeetings(rows, 'America/New_York', new Date('2026-03-09T05:00:00Z'))
    expect(after.today).toBe('2026-03-09')
    expect(after.needsMinutes).toBe(1)
  })
})

describe('formatMeetingDay', () => {
  it('formats without timezone drift', () => {
    expect(formatMeetingDay('2026-11-05')).toBe('Nov 5, 2026')
    expect(formatMeetingDay('2026-01-01')).toBe('Jan 1, 2026')
  })
})
