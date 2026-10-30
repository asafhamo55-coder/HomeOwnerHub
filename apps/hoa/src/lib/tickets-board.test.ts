import { describe, expect, it } from 'vitest'
import { formatTicketAge, oldestOpenDays, summarizeTickets, ticketAgeDays, ticketSearchPattern } from './tickets-board'

const NY = 'America/New_York'

describe('ticketAgeDays', () => {
  it('counts calendar days in the association zone', () => {
    // 23:30 on Jun 1 in New York is already Jun 2 in UTC.
    expect(ticketAgeDays('2026-06-02T03:30:00Z', NY, new Date('2026-06-04T16:00:00Z'))).toBe(3)
  })
  it('does not lose or gain a day across the spring DST change', () => {
    // Mar 8 2026 is a 23 hour day in New York.
    expect(ticketAgeDays('2026-03-07T12:00:00Z', NY, new Date('2026-03-10T12:00:00Z'))).toBe(3)
  })
  it('does not lose or gain a day across the fall DST change', () => {
    // Nov 1 2026 is a 25 hour day.
    expect(ticketAgeDays('2026-10-31T12:00:00Z', NY, new Date('2026-11-03T12:00:00Z'))).toBe(3)
  })
  it('is 0 on the same day and never negative', () => {
    expect(ticketAgeDays('2026-06-04T10:00:00Z', NY, new Date('2026-06-04T20:00:00Z'))).toBe(0)
    expect(ticketAgeDays('2026-06-09T10:00:00Z', NY, new Date('2026-06-04T20:00:00Z'))).toBe(0)
  })
  it('returns null for an unusable date', () => {
    expect(ticketAgeDays('nope', NY)).toBeNull()
  })
})

describe('formatTicketAge', () => {
  it('words the age', () => {
    expect(formatTicketAge(0)).toBe('Today')
    expect(formatTicketAge(1)).toBe('1 day')
    expect(formatTicketAge(3)).toBe('3 days')
    expect(formatTicketAge(null)).toBe('—')
  })
})

describe('oldestOpenDays / summarizeTickets', () => {
  const now = new Date('2026-06-10T16:00:00Z')
  const open = [
    { id: 'a', created_at: '2026-06-09T12:00:00Z' },
    { id: 'b', created_at: '2026-06-01T12:00:00Z' },
    { id: 'c', created_at: '2026-06-05T12:00:00Z' },
  ]
  it('picks the oldest', () => {
    expect(
      oldestOpenDays(
        open.map((o) => o.created_at),
        NY,
        now,
      ),
    ).toBe(9)
    expect(oldestOpenDays([], NY, now)).toBeNull()
  })
  it('counts the strip tiles', () => {
    expect(summarizeTickets(open, ['b', 'zzz'], NY, now)).toEqual({
      needsAttention: 3,
      oldestOpenDays: 9,
      unassigned: 2,
    })
  })
  it('handles no open tickets', () => {
    expect(summarizeTickets([], [], NY, now)).toEqual({ needsAttention: 0, oldestOpenDays: null, unassigned: 0 })
  })
})

describe('ticketSearchPattern', () => {
  it('is null for empty input', () => {
    expect(ticketSearchPattern(undefined)).toBeNull()
    expect(ticketSearchPattern('  ')).toBeNull()
  })
  it('escapes wildcards and strips filter syntax', () => {
    expect(ticketSearchPattern('50%_off')).toBe('%50\\%\\_off%')
    expect(ticketSearchPattern('a,b),c')).toBe('%a b c%')
  })
})
