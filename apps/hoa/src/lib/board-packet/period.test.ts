import { describe, expect, it } from 'vitest'
import { packetPeriod } from './period'

describe('packetPeriod — the month before the meeting', () => {
  it('reports the previous calendar month', () => {
    expect(packetPeriod('2026-10-14')).toEqual({ start: '2026-09-01', end: '2026-09-30', label: 'September 2026' })
  })

  it('a meeting on the 1st still reports the previous month (no UTC shift)', () => {
    // `new Date('2026-10-01')` is Sep 30 in every US zone; a Date-based
    // version would have reported AUGUST here for anyone west of UTC.
    expect(packetPeriod('2026-10-01')).toEqual({ start: '2026-09-01', end: '2026-09-30', label: 'September 2026' })
  })

  it('a meeting on the last day of a month reports the month before', () => {
    expect(packetPeriod('2026-10-31')?.start).toBe('2026-09-01')
  })

  it('January rolls back to December of the previous year', () => {
    expect(packetPeriod('2027-01-12')).toEqual({ start: '2026-12-01', end: '2026-12-31', label: 'December 2026' })
  })

  it('February ends on the 28th, or the 29th in a leap year', () => {
    expect(packetPeriod('2026-03-31')?.end).toBe('2026-02-28')
    expect(packetPeriod('2028-03-05')?.end).toBe('2028-02-29')
    expect(packetPeriod('2100-03-05')?.end).toBe('2100-02-28') // century, not a leap year
  })

  it('31-day months end on the 31st', () => {
    expect(packetPeriod('2026-08-20')?.end).toBe('2026-07-31')
  })

  it('accepts the date part of a timestamp', () => {
    expect(packetPeriod('2026-10-14T19:00:00Z')?.start).toBe('2026-09-01')
  })

  it('returns null for anything that is not a real date', () => {
    expect(packetPeriod(null)).toBeNull()
    expect(packetPeriod('')).toBeNull()
    expect(packetPeriod('next tuesday')).toBeNull()
    expect(packetPeriod('2026-13-01')).toBeNull()
    expect(packetPeriod('2026-02-30')).toBeNull()
  })

  it('does not depend on the process time zone', () => {
    const tz = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      expect(packetPeriod('2026-03-01')).toEqual({ start: '2026-02-01', end: '2026-02-28', label: 'February 2026' })
      process.env.TZ = 'Pacific/Kiritimati'
      expect(packetPeriod('2026-03-01')).toEqual({ start: '2026-02-01', end: '2026-02-28', label: 'February 2026' })
    } finally {
      process.env.TZ = tz
    }
  })
})
