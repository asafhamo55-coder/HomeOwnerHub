import { describe, it, expect } from 'vitest'
import { formatMessageTimestamp, formatShortDate, HOA_TIME_ZONE } from './format-datetime'

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
