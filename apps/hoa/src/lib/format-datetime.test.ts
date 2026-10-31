import { describe, it, expect } from 'vitest'
import {
  formatDateTime,
  formatMessageTimestamp,
  formatMonthDay,
  formatMonthDayTime,
  formatShortDate,
  HOA_TIME_ZONE,
} from './format-datetime'
import { formatDay } from './money/format'

describe('round 19: timestamps vs date-only values', () => {
  // 23:30 Eastern on Oct 5 (EDT, UTC-4) is 03:30 UTC on Oct 6.
  const lateEvening = '2026-10-06T03:30:00Z'

  it('renders a 23:30 Eastern timestamp on the Eastern day, not the UTC day', () => {
    expect(formatShortDate(lateEvening)).toBe('Oct 5, 2026')
    expect(formatMonthDay(lateEvening)).toBe('Oct 5')
    expect(formatDateTime(lateEvening)).toBe('Oct 5, 2026, 11:30 PM')
    expect(formatMonthDayTime(lateEvening)).toBe('Oct 5, 11:30 PM')
  })

  it('shows 10:05 AM Eastern as 10:05 AM, not 2:05 PM', () => {
    expect(formatDateTime('2026-10-05T14:05:00Z')).toBe('Oct 5, 2026, 10:05 AM')
  })

  it('honours an explicit association time zone', () => {
    expect(formatDateTime(lateEvening, 'America/Los_Angeles')).toBe('Oct 5, 2026, 8:30 PM')
  })

  it('returns an empty string for missing or invalid input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatMonthDay('nonsense')).toBe('')
  })

  it('does not shift a date-only value', () => {
    expect(formatDay('2026-10-05')).toBe('Oct 5, 2026')
    expect(formatDay('2026-01-01')).toBe('Jan 1, 2026')
  })
})

describe('formatMessageTimestamp', () => {
  // The bug this file fixes: these screens are server components rendering on
  // Vercel (UTC), so an unqualified toLocaleString() showed 14:05 for a message
  // sent at 10:05 Eastern. These assertions pin the offset, not just the shape.
  it('renders a summer instant in EDT, not UTC', () => {
    // 2026-08-01T14:05:00Z is 10:05 AM EDT (UTC-4)
    const out = formatMessageTimestamp('2026-08-01T14:05:00Z')
    expect(out).toContain('10:05')
    expect(out).toContain('EDT')
    expect(out).not.toContain('14:05')
  })

  it('renders a winter instant in EST, so the DST shift is real and not assumed', () => {
    // 2026-01-15T14:05:00Z is 9:05 AM EST (UTC-5)
    const out = formatMessageTimestamp('2026-01-15T14:05:00Z')
    expect(out).toContain('9:05')
    expect(out).toContain('EST')
  })

  it('rolls the date back when the UTC instant is the next day in Eastern', () => {
    // 2026-08-02T01:30:00Z is still 9:30 PM on Aug 1 in EDT. A board member
    // reading "when did this arrive" must not see tomorrow's date.
    const out = formatMessageTimestamp('2026-08-02T01:30:00Z')
    expect(out).toContain('Aug 1')
    expect(out).toContain('9:30')
  })

  it('accepts a Date as well as an ISO string', () => {
    const out = formatMessageTimestamp(new Date('2026-08-01T14:05:00Z'))
    expect(out).toContain('10:05')
  })

  it.each([null, undefined, '', 'not a date'])(
    'returns an empty string for %p rather than throwing',
    (input) => {
      // A malformed sent_at on one message must not take down the thread view.
      expect(formatMessageTimestamp(input as string | null)).toBe('')
    },
  )
})

describe('formatShortDate', () => {
  it('uses the Eastern calendar day, not the UTC one', () => {
    expect(formatShortDate('2026-08-02T01:30:00Z')).toContain('Aug 1')
  })

  it('omits the time', () => {
    const out = formatShortDate('2026-08-01T14:05:00Z')
    expect(out).not.toContain(':')
  })

  it.each([null, undefined, '', 'not a date'])('returns empty for %p', (input) => {
    expect(formatShortDate(input as string | null)).toBe('')
  })
})

describe('HOA_TIME_ZONE', () => {
  it('matches the zone every scheduled job uses', () => {
    // packages/jobs pins TZ=America/New_York on the daily digest, HOA and PM
    // late fees, Plaid sync, eviction reminders and the state-law refresh. If
    // these disagree, a "midnight" late fee and a "10:05 AM" email disagree
    // about what day it is.
    expect(HOA_TIME_ZONE).toBe('America/New_York')
  })
})
