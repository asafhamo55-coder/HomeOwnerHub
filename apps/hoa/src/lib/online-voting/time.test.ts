import { describe, expect, it } from 'vitest'
import { formatBallotTime, localInputToInstant, zoneDescription } from './time'

const NY = 'America/New_York'

describe('localInputToInstant: the board types the association clock, not the device clock', () => {
  it('reads winter time as EST (UTC-5)', () => {
    expect(localInputToInstant('2026-11-05T18:00', NY)).toBe('2026-11-05T23:00:00.000Z')
  })
  it('reads summer time as EDT (UTC-4)', () => {
    expect(localInputToInstant('2026-07-04T18:00', NY)).toBe('2026-07-04T22:00:00.000Z')
  })
  it('gives the same wall time a different instant in a different zone', () => {
    expect(localInputToInstant('2026-11-05T18:00', 'America/Los_Angeles')).toBe('2026-11-06T02:00:00.000Z')
    expect(localInputToInstant('2026-11-05T18:00', 'America/Chicago')).toBe('2026-11-06T00:00:00.000Z')
  })
  it('keeps minutes exact', () => {
    expect(localInputToInstant('2026-11-05T18:05', NY)).toBe('2026-11-05T23:05:00.000Z')
    expect(localInputToInstant('2026-11-05T18:59', NY)).toBe('2026-11-05T23:59:00.000Z')
  })
  it('ignores seconds a browser may add', () => {
    expect(localInputToInstant('2026-11-05T18:00:00', NY)).toBe('2026-11-05T23:00:00.000Z')
  })
  it('does not shift a zone with no daylight saving (Arizona)', () => {
    expect(localInputToInstant('2026-01-15T09:00', 'America/Phoenix')).toBe('2026-01-15T16:00:00.000Z')
    expect(localInputToInstant('2026-07-15T09:00', 'America/Phoenix')).toBe('2026-07-15T16:00:00.000Z')
  })

  describe('daylight saving changes', () => {
    it('spring forward (2026-03-08): 1:59 AM is still EST, 3:00 AM is EDT', () => {
      expect(localInputToInstant('2026-03-08T01:59', NY)).toBe('2026-03-08T06:59:00.000Z')
      expect(localInputToInstant('2026-03-08T03:00', NY)).toBe('2026-03-08T07:00:00.000Z')
    })
    it('spring forward: 2:30 AM does not exist and lands after the gap, never before it', () => {
      const got = localInputToInstant('2026-03-08T02:30', NY)!
      expect(Date.parse(got)).toBeGreaterThanOrEqual(Date.parse('2026-03-08T07:00:00.000Z'))
      expect(Date.parse(got)).toBeLessThanOrEqual(Date.parse('2026-03-08T07:30:00.000Z'))
    })
    it('fall back (2026-11-01): 12:30 AM is EDT and 2:30 AM is EST', () => {
      expect(localInputToInstant('2026-11-01T00:30', NY)).toBe('2026-11-01T04:30:00.000Z')
      expect(localInputToInstant('2026-11-01T02:30', NY)).toBe('2026-11-01T07:30:00.000Z')
    })
    it('fall back: 1:30 AM happens twice and resolves to one of the two real instants', () => {
      const got = localInputToInstant('2026-11-01T01:30', NY)!
      expect(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']).toContain(got)
    })
    it('a window across fall back is 25 hours, not 24', () => {
      const o = Date.parse(localInputToInstant('2026-11-01T00:00', NY)!)
      const c = Date.parse(localInputToInstant('2026-11-02T00:00', NY)!)
      expect((c - o) / 3_600_000).toBe(25)
    })
    it('a window across spring forward is 23 hours, not 24', () => {
      const o = Date.parse(localInputToInstant('2026-03-08T00:00', NY)!)
      const c = Date.parse(localInputToInstant('2026-03-09T00:00', NY)!)
      expect((c - o) / 3_600_000).toBe(23)
    })
    it('Pacific zone changes on the same dates but at its own hour', () => {
      expect(localInputToInstant('2026-03-08T01:59', 'America/Los_Angeles')).toBe('2026-03-08T09:59:00.000Z')
      expect(localInputToInstant('2026-03-08T03:00', 'America/Los_Angeles')).toBe('2026-03-08T10:00:00.000Z')
    })
  })

  it('refuses anything that is not a date and time', () => {
    for (const bad of ['', 'tomorrow', '2026-13-01T10:00', '2026-02-30T10:00', '2026-11-05', '2026-11-05T25:00', '2026-11-05T10:61']) {
      expect(localInputToInstant(bad, NY), bad).toBeNull()
    }
    expect(localInputToInstant('2026-11-05T18:00', 'Not/AZone')).toBeNull()
  })
})

describe('formatBallotTime: always the association clock, always with the zone', () => {
  it('shows EST in winter and EDT in summer', () => {
    expect(formatBallotTime('2026-11-05T23:00:00.000Z', NY)).toBe('Nov 5, 2026, 6:00 PM EST')
    expect(formatBallotTime('2026-07-04T22:00:00.000Z', NY)).toBe('Jul 4, 2026, 6:00 PM EDT')
  })
  it('shows the instant in the association zone, not Eastern', () => {
    expect(formatBallotTime('2026-11-05T23:00:00.000Z', 'America/Los_Angeles')).toBe('Nov 5, 2026, 3:00 PM PST')
    expect(formatBallotTime('2026-11-05T23:00:00.000Z', 'America/Chicago')).toBe('Nov 5, 2026, 5:00 PM CST')
  })
  it('does not use the process zone', () => {
    expect(formatBallotTime('2026-11-06T03:00:00.000Z', 'America/Los_Angeles')).toBe('Nov 5, 2026, 7:00 PM PST')
  })
  it('round-trips what the board typed, either side of a change', () => {
    for (const local of ['2026-03-07T20:00', '2026-03-09T20:00', '2026-10-31T20:00', '2026-11-02T20:00']) {
      expect(formatBallotTime(localInputToInstant(local, NY), NY)).toContain('8:00 PM')
    }
  })
  it('is empty for nothing', () => {
    expect(formatBallotTime(null, NY)).toBe('')
    expect(formatBallotTime('nonsense', NY)).toBe('')
  })
})

describe('zoneDescription', () => {
  it('names the zone in words', () => {
    expect(zoneDescription(NY)).toMatch(/Eastern/)
    expect(zoneDescription('America/Los_Angeles')).toMatch(/Pacific/)
  })
})
