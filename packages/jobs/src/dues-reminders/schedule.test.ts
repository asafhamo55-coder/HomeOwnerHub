import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CATCH_UP_DAYS,
  addDays,
  daysBetween,
  dueStep,
  nextRunDate,
  parseDay,
  reminderCommunicationId,
  todayInZone,
} from './schedule'

/**
 * BL-013 offset scheduling. Due dates are DATE columns — calendar days, not
 * instants — so every comparison here is done on Y-M-D parts in UTC and the
 * process timezone must never move a reminder by a day (BL-043).
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseDay / daysBetween — date-only, zone-proof', () => {
  it('parses YYYY-MM-DD to UTC midnight from its parts', () => {
    expect(parseDay('2026-10-01')).toBe(Date.UTC(2026, 9, 1))
  })

  it('accepts the date part of a timestamp and rejects garbage', () => {
    expect(parseDay('2026-10-01T23:59:59-04:00')).toBe(Date.UTC(2026, 9, 1))
    expect(parseDay('not a date')).toBeNull()
    expect(parseDay('')).toBeNull()
  })

  it('counts whole calendar days across a DST change without drift', () => {
    // US DST ends 2026-11-01; a local-time difference would be 24h ± 1h off.
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
  })

  it('is negative before the due date', () => {
    expect(daysBetween('2026-10-04', '2026-10-01')).toBe(-3)
  })

  it('gives the same answer whatever the process timezone is', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(daysBetween('2026-10-01', '2026-10-06')).toBe(5)
    expect(addDays('2026-10-01', -3)).toBe('2026-09-28')
  })

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('todayInZone — the association day, not the UTC day', () => {
  it('is still the previous day in New York at 9pm Eastern (01:00 UTC)', () => {
    // 2026-10-02T01:00Z is 2026-10-01 21:00 EDT.
    expect(todayInZone(new Date('2026-10-02T01:00:00Z'))).toBe('2026-10-01')
  })

  it('rolls over at local midnight', () => {
    expect(todayInZone(new Date('2026-10-02T04:00:00Z'))).toBe('2026-10-02')
  })
})

describe('nextRunDate — when the 9am Eastern cron fires next', () => {
  it('is today before 9am Eastern', () => {
    expect(nextRunDate(new Date('2026-10-01T12:59:00Z'))).toBe('2026-10-01') // 8:59 EDT
  })

  it('is tomorrow from 9am Eastern on', () => {
    expect(nextRunDate(new Date('2026-10-01T13:00:00Z'))).toBe('2026-10-02') // 9:00 EDT
  })
})

describe('dueStep — which configured offset fires today', () => {
  const offsets = [-3, 5, 15]

  it('fires −3 three days before the due date', () => {
    expect(dueStep('2026-10-04', '2026-10-01', offsets)).toBe(-3)
  })

  it('fires +5 and +15 after the due date', () => {
    expect(dueStep('2026-10-01', '2026-10-06', offsets)).toBe(5)
    expect(dueStep('2026-10-01', '2026-10-16', offsets)).toBe(15)
  })

  it('fires nothing on a day with no offset and outside the catch-up window', () => {
    expect(dueStep('2026-10-01', '2026-10-01', [5, 15])).toBeNull()
    expect(dueStep('2026-10-01', '2026-10-30', offsets)).toBeNull()
  })

  it(`catches up a missed run for ${CATCH_UP_DAYS} days, then gives up`, () => {
    expect(dueStep('2026-10-01', '2026-10-07', offsets)).toBe(5)
    expect(dueStep('2026-10-01', '2026-10-08', offsets)).toBe(5)
    expect(dueStep('2026-10-01', '2026-10-09', offsets)).toBeNull()
  })

  it('picks only the latest step when two are in the window — one email per day', () => {
    expect(dueStep('2026-10-01', '2026-10-03', [1, 2])).toBe(2)
  })

  it('order of offsets does not matter', () => {
    expect(dueStep('2026-10-01', '2026-10-16', [15, -3, 5])).toBe(15)
  })

  it('never shifts by a day in a negative-offset process timezone (BL-043)', () => {
    vi.stubEnv('TZ', 'America/New_York')
    // new Date('2026-10-04') would be Oct 3 20:00 local — a naive local
    // diff makes this −2 and the −3 reminder never fires.
    expect(dueStep('2026-10-04', '2026-10-01', offsets)).toBe(-3)
  })

  it('returns null for an unparseable due date', () => {
    expect(dueStep('garbage', '2026-10-01', offsets)).toBeNull()
  })
})

describe('reminderCommunicationId — the idempotency key', () => {
  const A = '11111111-1111-4111-8111-111111111111'
  const B = '22222222-2222-4222-8222-222222222222'

  it('is a valid uuid', () => {
    expect(reminderCommunicationId(A, -3)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('is deterministic per (assessment, step)', () => {
    expect(reminderCommunicationId(A, 5)).toBe(reminderCommunicationId(A, 5))
  })

  it('differs across steps and across assessments', () => {
    const ids = new Set([
      reminderCommunicationId(A, -3),
      reminderCommunicationId(A, 5),
      reminderCommunicationId(B, -3),
      reminderCommunicationId(B, 5),
    ])
    expect(ids.size).toBe(4)
  })
})
