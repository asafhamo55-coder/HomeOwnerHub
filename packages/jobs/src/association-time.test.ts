import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ASSOCIATION_TIME_ZONE,
  addCalendarDays,
  associationTimeZone,
  calendarDaysBetween,
  dateOnlyCompare,
  dayOf,
  instantAtLocalTime,
  todayIn,
} from './association-time'

// Every "now" below is an absolute UTC instant and every zone is passed
// explicitly, so nothing here reads the machine's TZ. The suite must give
// the same answer under TZ=UTC, TZ=Pacific/Kiritimati and TZ=America/Adak.

afterEach(() => {
  vi.useRealTimers()
})

describe('associationTimeZone — derived from the association state', () => {
  it('maps Eastern states to America/New_York', () => {
    for (const s of ['FL', 'GA', 'NY', 'NC', 'SC', 'VA', 'MA', 'PA', 'OH', 'DC']) {
      expect(associationTimeZone({ state: s })).toBe('America/New_York')
    }
  })

  it('maps central, mountain, pacific and non-contiguous states', () => {
    expect(associationTimeZone({ state: 'TX' })).toBe('America/Chicago')
    expect(associationTimeZone({ state: 'IL' })).toBe('America/Chicago')
    expect(associationTimeZone({ state: 'CO' })).toBe('America/Denver')
    expect(associationTimeZone({ state: 'AZ' })).toBe('America/Phoenix')
    expect(associationTimeZone({ state: 'CA' })).toBe('America/Los_Angeles')
    expect(associationTimeZone({ state: 'WA' })).toBe('America/Los_Angeles')
    expect(associationTimeZone({ state: 'AK' })).toBe('America/Anchorage')
    expect(associationTimeZone({ state: 'HI' })).toBe('Pacific/Honolulu')
  })

  it('every mapped zone is a real IANA zone', () => {
    for (const s of ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','VI','GU','AS','MP']) {
      const tz = associationTimeZone({ state: s })
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: tz })).not.toThrow()
    }
  })

  it('is case- and whitespace-insensitive', () => {
    expect(associationTimeZone({ state: ' ca ' })).toBe('America/Los_Angeles')
  })

  it('defaults to Eastern for a missing or unknown state', () => {
    expect(DEFAULT_ASSOCIATION_TIME_ZONE).toBe('America/New_York')
    expect(associationTimeZone(null)).toBe('America/New_York')
    expect(associationTimeZone(undefined)).toBe('America/New_York')
    expect(associationTimeZone({ state: null })).toBe('America/New_York')
    expect(associationTimeZone({ state: '' })).toBe('America/New_York')
    expect(associationTimeZone({ state: 'ZZ' })).toBe('America/New_York')
  })

  it('an explicit timezone (a future column) overrides the state', () => {
    expect(associationTimeZone({ state: 'FL', timezone: 'America/Chicago' })).toBe('America/Chicago')
  })

  it('an invalid explicit timezone falls back to the state, not a crash', () => {
    expect(associationTimeZone({ state: 'CA', timezone: 'Mars/Olympus' })).toBe('America/Los_Angeles')
    expect(associationTimeZone({ state: 'CA', timezone: '' })).toBe('America/Los_Angeles')
  })
})

describe('todayIn — the association day, not the UTC day', () => {
  it('23:30 Eastern is still today in New York (UTC is already tomorrow)', () => {
    // 2026-10-01 23:30 EDT = 2026-10-02 03:30Z
    const now = new Date('2026-10-02T03:30:00Z')
    expect(now.toISOString().slice(0, 10)).toBe('2026-10-02') // the old bug
    expect(todayIn('America/New_York', now)).toBe('2026-10-01')
  })

  it('23:30 Eastern in winter (EST, UTC-5)', () => {
    // 2026-01-15 23:30 EST = 2026-01-16 04:30Z
    expect(todayIn('America/New_York', new Date('2026-01-16T04:30:00Z'))).toBe('2026-01-15')
  })

  it('reads the clock when no instant is passed (fake clock)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-02T03:30:00Z'))
    expect(todayIn('America/New_York')).toBe('2026-10-01')
    expect(todayIn('America/Los_Angeles')).toBe('2026-10-01')
    expect(todayIn('UTC')).toBe('2026-10-02')
  })

  it('same instant, different associations, different days', () => {
    const now = new Date('2026-10-02T06:30:00Z') // 02:30 EDT, 23:30 PDT
    expect(todayIn('America/New_York', now)).toBe('2026-10-02')
    expect(todayIn('America/Los_Angeles', now)).toBe('2026-10-01')
  })

  it('spring-forward night: 00:30 and 03:30 EDT on Mar 8 2026 are both Mar 8', () => {
    expect(todayIn('America/New_York', new Date('2026-03-08T05:30:00Z'))).toBe('2026-03-08') // 00:30 EST
    expect(todayIn('America/New_York', new Date('2026-03-08T07:30:00Z'))).toBe('2026-03-08') // 03:30 EDT
    expect(todayIn('America/New_York', new Date('2026-03-08T03:59:00Z'))).toBe('2026-03-07') // 22:59 EST
  })

  it('23:30 Eastern the night before spring-forward and the night of fall-back', () => {
    // 2026-03-07 23:30 EST = 03-08 04:30Z
    expect(todayIn('America/New_York', new Date('2026-03-08T04:30:00Z'))).toBe('2026-03-07')
    // 2026-11-01 is fall-back day; 23:30 EST that night = 11-02 04:30Z
    expect(todayIn('America/New_York', new Date('2026-11-02T04:30:00Z'))).toBe('2026-11-01')
    // the repeated 01:30 hour on fall-back day, both copies
    expect(todayIn('America/New_York', new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01') // 01:30 EDT
    expect(todayIn('America/New_York', new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01') // 01:30 EST
  })
})

describe('dayOf — the calendar day of an instant in a zone', () => {
  it('a payment at 22:15 Eastern posts to that day, not the next UTC day', () => {
    // paid_at as Postgres returns timestamptz
    expect(dayOf('2026-10-01T02:15:00+00:00', 'America/New_York')).toBe('2026-09-30')
    expect(dayOf('2026-10-01T02:15:00.123Z', 'America/New_York')).toBe('2026-09-30')
  })

  it('a date-only string is a calendar date and is returned unchanged', () => {
    // never shifted by parsing it as UTC midnight
    expect(dayOf('2026-10-01', 'America/Los_Angeles')).toBe('2026-10-01')
    expect(dayOf('2026-10-01', 'Pacific/Honolulu')).toBe('2026-10-01')
  })

  it('accepts a Date and returns null for garbage', () => {
    expect(dayOf(new Date('2026-10-01T12:00:00Z'), 'America/New_York')).toBe('2026-10-01')
    expect(dayOf('not a date', 'America/New_York')).toBeNull()
    expect(dayOf(null, 'America/New_York')).toBeNull()
  })
})

describe('date-only arithmetic — calendar dates, no zone involved', () => {
  it('dateOnlyCompare compares the Y-M-D part', () => {
    expect(dateOnlyCompare('2026-10-01', '2026-10-02')).toBe(-1)
    expect(dateOnlyCompare('2026-10-02', '2026-10-01')).toBe(1)
    expect(dateOnlyCompare('2026-10-01', '2026-10-01T23:59:59Z')).toBe(0)
  })

  it('calendarDaysBetween counts whole days across DST changes', () => {
    expect(calendarDaysBetween('2026-03-07', '2026-03-09')).toBe(2) // spans spring-forward
    expect(calendarDaysBetween('2026-10-31', '2026-11-02')).toBe(2) // spans fall-back
    expect(calendarDaysBetween('2026-10-02', '2026-10-01')).toBe(-1)
    expect(calendarDaysBetween('2024-02-28', '2024-03-01')).toBe(2) // leap year
    expect(Number.isNaN(calendarDaysBetween('x', '2026-10-01'))).toBe(true)
  })

  it('addCalendarDays steps calendar days', () => {
    expect(addCalendarDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addCalendarDays('2026-03-08', -1)).toBe('2026-03-07')
    expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(() => addCalendarDays('nope', 1)).toThrow()
  })
})

describe('instantAtLocalTime — wall-clock time in a zone → instant', () => {
  it('9:00 Eastern in summer and winter', () => {
    expect(instantAtLocalTime('2026-10-01', 9, 'America/New_York').toISOString()).toBe('2026-10-01T13:00:00.000Z')
    expect(instantAtLocalTime('2026-01-15', 9, 'America/New_York').toISOString()).toBe('2026-01-15T14:00:00.000Z')
  })

  it('9:00 Eastern on both DST-change days', () => {
    expect(instantAtLocalTime('2026-03-08', 9, 'America/New_York').toISOString()).toBe('2026-03-08T13:00:00.000Z')
    expect(instantAtLocalTime('2026-11-01', 9, 'America/New_York').toISOString()).toBe('2026-11-01T14:00:00.000Z')
  })
})
