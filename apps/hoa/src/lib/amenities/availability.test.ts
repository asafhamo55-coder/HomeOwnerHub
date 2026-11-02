import { describe, expect, it } from 'vitest'
import {
  blackoutsFromRows,
  bookingsBrokenByRules,
  checkRequest,
  dayStrip,
  daySlots,
  displayStatus,
  hoursForDay,
  isRealDay,
  monthGrid,
  residentMustAskBoard,
  validEnds,
  weeklyHoursFromRows,
  type Amenity,
} from './model'

const TZ = 'America/New_York'
const NOW = new Date('2026-11-02T15:00:00Z') // 10:00 AM in New York

const hall: Amenity = {
  id: 'a1',
  associationId: 'x1',
  name: 'Clubhouse',
  description: null,
  rules: null,
  requiresApproval: true,
  openHour: 8,
  closeHour: 22,
  maxHours: 4,
  advanceDays: 60,
  maxActivePerUnit: 2,
  isActive: true,
  capacity: null,
  concurrentLimit: 1,
  minNoticeHours: 0,
  cancelCutoffHours: 0,
  retiredAt: null,
  weeklyHours: null,
  blackouts: [],
}

const base = { amenity: hall, day: '2026-11-08', startHour: 14, endHour: 18, timeZone: TZ, now: NOW, held: [], homeActiveCount: 0 }
const slotHours = (v: { slots: { hour: number }[] }) => v.slots.map((s) => s.hour)

describe('daylight saving time and close hour 24', () => {
  // US clocks: spring forward Sun Mar 8 2026 (2:00 AM does not exist), fall back Sun Nov 1 2026 (1:00 AM happens twice).
  const SPRING_NOW = new Date('2026-03-01T15:00:00Z')
  const FALL_NOW = new Date('2026-10-25T15:00:00Z')
  const night = { ...hall, openHour: 0, closeHour: 6, maxHours: 4 }

  it('never offers a wall-clock hour that does not exist (spring forward)', () => {
    const v = daySlots({ amenity: hall, day: '2026-03-08', timeZone: TZ, now: SPRING_NOW, held: [] })
    expect(v.status).toBe('open')
    expect(slotHours(v)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
    const early = daySlots({ amenity: night, day: '2026-03-08', timeZone: TZ, now: SPRING_NOW, held: [] })
    expect(slotHours(early)).toEqual([0, 1, 3, 4, 5])
  })

  it('refuses a request that starts in the skipped hour, and keeps the wall clock around it', () => {
    const skipped = checkRequest({ ...base, amenity: night, now: SPRING_NOW, day: '2026-03-08', startHour: 2, endHour: 4 })
    expect(skipped.ok).toBe(false)
    // 1 AM EST (UTC-5) to 3 AM EDT (UTC-4): one real hour across the change.
    expect(checkRequest({ ...base, amenity: night, now: SPRING_NOW, day: '2026-03-08', startHour: 1, endHour: 3 })).toEqual({
      ok: true,
      startsAt: '2026-03-08T06:00:00.000Z',
      endsAt: '2026-03-08T07:00:00.000Z',
    })
    // 9 AM after the change is UTC-4.
    expect(checkRequest({ ...base, now: SPRING_NOW, day: '2026-03-08', startHour: 9, endHour: 11 })).toEqual({
      ok: true,
      startsAt: '2026-03-08T13:00:00.000Z',
      endsAt: '2026-03-08T15:00:00.000Z',
    })
  })

  it('resolves the repeated hour (fall back) to one repeatable instant', () => {
    const v = daySlots({ amenity: night, day: '2026-11-01', timeZone: TZ, now: FALL_NOW, held: [] })
    expect(slotHours(v)).toEqual([0, 1, 2, 3, 4, 5])
    const args = { ...base, amenity: night, now: FALL_NOW, day: '2026-11-01', startHour: 1, endHour: 3 }
    const r = checkRequest(args)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Date.parse(r.endsAt)).toBeGreaterThan(Date.parse(r.startsAt))
      expect(checkRequest(args)).toEqual(r)
    }
    // 9 AM that day is already standard time (UTC-5).
    expect(checkRequest({ ...base, now: FALL_NOW, day: '2026-11-01', startHour: 9, endHour: 11 })).toEqual({
      ok: true,
      startsAt: '2026-11-01T14:00:00.000Z',
      endsAt: '2026-11-01T16:00:00.000Z',
    })
  })

  it('treats close hour 24 as local midnight of the next day', () => {
    const late = { ...hall, openHour: 12, closeHour: 24, maxHours: 8 }
    expect(checkRequest({ ...base, amenity: late, startHour: 18, endHour: 24 })).toEqual({
      ok: true,
      startsAt: '2026-11-08T23:00:00.000Z',
      endsAt: '2026-11-09T05:00:00.000Z',
    })
    expect(slotHours(daySlots({ amenity: late, day: '2026-11-08', timeZone: TZ, now: NOW, held: [] })).at(-1)).toBe(23)
    expect(slotHours(daySlots({ amenity: late, day: '2026-11-01', timeZone: TZ, now: FALL_NOW, held: [] })).at(-1)).toBe(23)
  })

  it('works in a zone that does not change its clocks', () => {
    const r = checkRequest({ ...base, timeZone: 'America/Phoenix', day: '2026-03-08', now: SPRING_NOW, startHour: 9, endHour: 11 })
    expect(r).toEqual({ ok: true, startsAt: '2026-03-08T16:00:00.000Z', endsAt: '2026-03-08T18:00:00.000Z' })
  })
})

describe('the free-time picker', () => {
  const held = [{ startsAt: '2026-11-08T19:00:00.000Z', endsAt: '2026-11-08T23:00:00.000Z' }] // 2 PM to 6 PM
  it('marks taken and free hours and reads full or open', () => {
    const v = daySlots({ amenity: hall, day: '2026-11-08', timeZone: TZ, now: NOW, held })
    const state = (h: number) => v.slots.find((s) => s.hour === h)?.state
    expect(state(13)).toBe('free')
    expect(state(14)).toBe('taken')
    expect(state(17)).toBe('taken')
    expect(state(18)).toBe('free')
    expect(v.status).toBe('open')
    const wide = [{ startsAt: '2026-11-08T13:00:00.000Z', endsAt: '2026-11-09T04:00:00.000Z' }]
    const full = daySlots({ amenity: hall, day: '2026-11-08', timeZone: TZ, now: NOW, held: wide })
    expect(full.status).toBe('full')
    expect(full.note).toBe('Full')
  })

  it('marks hours already past today and reads days outside the rules in words', () => {
    const today = daySlots({ amenity: hall, day: '2026-11-02', timeZone: TZ, now: NOW, held: [] })
    expect(today.slots.find((s) => s.hour === 9)?.state).toBe('past')
    expect(today.slots.find((s) => s.hour === 11)?.state).toBe('free')
    expect(daySlots({ amenity: hall, day: '2026-11-01', timeZone: TZ, now: NOW, held: [] }).status).toBe('past')
    expect(daySlots({ amenity: hall, day: '2027-03-01', timeZone: TZ, now: NOW, held: [] }).note).toBe('Too far ahead')
  })

  it('offers only ends that stay free, inside the longest booking and closing time', () => {
    const v = daySlots({ amenity: hall, day: '2026-11-08', timeZone: TZ, now: NOW, held })
    expect(validEnds(v, 10, hall.maxHours)).toEqual([11, 12, 13, 14])
    expect(validEnds(v, 12, hall.maxHours)).toEqual([13, 14])
    expect(validEnds(v, 18, hall.maxHours)).toEqual([19, 20, 21, 22])
    expect(validEnds(v, 14, hall.maxHours)).toEqual([])
  })

  it('builds a strip starting today', () => {
    const strip = dayStrip({ amenity: hall, timeZone: TZ, now: NOW, held: [], count: 14 })
    expect(strip).toHaveLength(14)
    expect(strip[0].day).toBe('2026-11-02')
    expect(strip[13].day).toBe('2026-11-15')
  })

  it('honours minimum notice', () => {
    const noticed = { ...hall, minNoticeHours: 24 }
    const v = daySlots({ amenity: noticed, day: '2026-11-03', timeZone: TZ, now: NOW, held: [] })
    expect(v.slots.find((s) => s.hour === 9)?.state).toBe('too_soon')
    expect(v.slots.find((s) => s.hour === 10)?.state).toBe('free')
    expect(checkRequest({ ...base, amenity: noticed, day: '2026-11-03', startHour: 9, endHour: 10 }).ok).toBe(false)
    expect(checkRequest({ ...base, amenity: noticed, day: '2026-11-03', startHour: 11, endHour: 12 }).ok).toBe(true)
  })
})

describe('capacity and concurrent bookings', () => {
  const courts = { ...hall, concurrentLimit: 2, capacity: 4 }
  const one = { startsAt: '2026-11-08T19:00:00.000Z', endsAt: '2026-11-08T23:00:00.000Z' }
  it('lets bookings overlap up to the concurrent limit and no further', () => {
    expect(checkRequest({ ...base, amenity: courts, held: [one] }).ok).toBe(true)
    expect(checkRequest({ ...base, amenity: courts, held: [one, { ...one }] }).ok).toBe(false)
    expect(checkRequest({ ...base, held: [one] }).ok).toBe(false)
  })
  it('shows an hour as taken only when every court is held', () => {
    const two = daySlots({ amenity: courts, day: '2026-11-08', timeZone: TZ, now: NOW, held: [one] })
    expect(two.slots.find((s) => s.hour === 15)?.state).toBe('free')
    const full = daySlots({ amenity: courts, day: '2026-11-08', timeZone: TZ, now: NOW, held: [one, { ...one }] })
    expect(full.slots.find((s) => s.hour === 15)?.state).toBe('taken')
  })
  it('checks party size against capacity', () => {
    expect(checkRequest({ ...base, amenity: courts, partySize: 4 }).ok).toBe(true)
    expect(checkRequest({ ...base, amenity: courts, partySize: 5 })).toMatchObject({ ok: false, field: 'partySize' })
    expect(checkRequest({ ...base, partySize: 500 }).ok).toBe(true) // no capacity stated
  })
})

describe('weekly hours and blackout dates', () => {
  // 2026-11-07 is a Saturday, 2026-11-08 a Sunday, 2026-11-09 a Monday.
  const weekly = weeklyHoursFromRows([
    { weekday: 6, open_hour: 10, close_hour: 18 },
    { weekday: 1, open_hour: 8, close_hour: 12 },
  ])
  const split = { ...hall, weeklyHours: weekly }
  it('reads rows into hours and treats no rows as the same every day', () => {
    expect(weekly).toEqual({ 6: { open: 10, close: 18 }, 1: { open: 8, close: 12 } })
    expect(weeklyHoursFromRows([])).toBeNull()
    expect(hoursForDay(hall, '2026-11-08')).toEqual({ open: 8, close: 22 })
  })
  it('uses the day hours and closes a weekday with no row', () => {
    expect(hoursForDay(split, '2026-11-07')).toEqual({ open: 10, close: 18 })
    expect(hoursForDay(split, '2026-11-08')).toBeNull()
    expect(checkRequest({ ...base, amenity: split, day: '2026-11-07', startHour: 9, endHour: 11 }).ok).toBe(false)
    expect(checkRequest({ ...base, amenity: split, day: '2026-11-07', startHour: 10, endHour: 12 }).ok).toBe(true)
    expect(checkRequest({ ...base, amenity: split, day: '2026-11-07', startHour: 16, endHour: 19 }).ok).toBe(false)
    expect(checkRequest({ ...base, amenity: split, day: '2026-11-08' })).toMatchObject({ ok: false, field: 'day' })
    expect(daySlots({ amenity: split, day: '2026-11-08', timeZone: TZ, now: NOW, held: [] })).toMatchObject({ status: 'closed', note: 'Closed' })
  })
  it('closes blackout dates, inclusive of both ends, with the reason', () => {
    const winter = {
      ...hall,
      blackouts: blackoutsFromRows([{ starts_on: '2026-11-08', ends_on: '2026-11-09', reason: 'Pool closed for the winter' }]),
    }
    expect(hoursForDay(winter, '2026-11-07')).not.toBeNull()
    expect(hoursForDay(winter, '2026-11-08')).toBeNull()
    expect(hoursForDay(winter, '2026-11-09')).toBeNull()
    expect(hoursForDay(winter, '2026-11-10')).not.toBeNull()
    const r = checkRequest({ ...base, amenity: winter })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Pool closed for the winter')
  })
  it('refuses a retired amenity', () => {
    expect(checkRequest({ ...base, amenity: { ...hall, retiredAt: '2026-10-01T00:00:00Z' } }).ok).toBe(false)
  })
  it('lets a board hold ignore the resident-only rules but not an overlap', () => {
    const strict = { ...hall, maxHours: 1, minNoticeHours: 500, advanceDays: 1 }
    expect(checkRequest({ ...base, amenity: strict, board: true }).ok).toBe(true)
    const held = [{ startsAt: '2026-11-08T19:00:00.000Z', endsAt: '2026-11-08T23:00:00.000Z' }]
    expect(checkRequest({ ...base, amenity: strict, board: true, held }).ok).toBe(false)
  })
})

describe('rule changes, cancel cutoff, derived states and the month grid', () => {
  const booked = [
    { id: 'r1', startsAt: '2026-11-08T19:00:00.000Z', endsAt: '2026-11-08T23:00:00.000Z', status: 'approved' as const }, // Sun 2-6 PM
    { id: 'r2', startsAt: '2026-11-09T15:00:00.000Z', endsAt: '2026-11-09T17:00:00.000Z', status: 'pending' as const }, // Mon 10-12
    { id: 'r3', startsAt: '2026-11-09T15:00:00.000Z', endsAt: '2026-11-09T17:00:00.000Z', status: 'canceled' as const },
  ]
  it('names the bookings a new rule would break, and never counts canceled ones', () => {
    expect(bookingsBrokenByRules(hall, booked, TZ, NOW)).toEqual([])
    expect(bookingsBrokenByRules({ ...hall, maxHours: 2 }, booked, TZ, NOW)).toEqual(['r1'])
    expect(bookingsBrokenByRules({ ...hall, weeklyHours: { 1: { open: 8, close: 12 } } }, booked, TZ, NOW)).toEqual(['r1'])
    const blackout = { ...hall, blackouts: [{ startsOn: '2026-11-09', endsOn: '2026-11-09', reason: null }] }
    expect(bookingsBrokenByRules(blackout, booked, TZ, NOW)).toEqual(['r2'])
    expect(bookingsBrokenByRules({ ...hall, retiredAt: '2026-11-02T00:00:00Z' }, booked, TZ, NOW)).toEqual(['r1', 'r2'])
  })
  it('asks the resident to contact the board inside the cutoff', () => {
    const r = { startsAt: '2026-11-03T15:00:00Z' } // 24 hours after NOW
    expect(residentMustAskBoard(r, 0, NOW)).toBe(false)
    expect(residentMustAskBoard(r, 24, NOW)).toBe(false)
    expect(residentMustAskBoard(r, 48, NOW)).toBe(true)
  })
  it('derives Completed and No longer held without storing them', () => {
    expect(displayStatus({ status: 'approved', startsAt: '2026-11-01T10:00:00Z', endsAt: '2026-11-01T12:00:00Z' }, NOW)).toBe('completed')
    expect(displayStatus({ status: 'pending', startsAt: '2026-11-01T10:00:00Z', endsAt: '2026-11-01T12:00:00Z' }, NOW)).toBe('expired')
    expect(displayStatus({ status: 'pending', startsAt: '2026-11-09T10:00:00Z', endsAt: '2026-11-09T12:00:00Z' }, NOW)).toBe('pending')
  })
  it('builds a Sunday-first month with counts in the association day', () => {
    const weeks = monthGrid({ month: '2026-11', timeZone: TZ, reservations: booked })
    expect(weeks[0][0].day).toBe('2026-11-01')
    expect(weeks.flat().find((c) => c.day === '2026-11-08')).toMatchObject({ held: 1, waiting: 0 })
    expect(weeks.flat().find((c) => c.day === '2026-11-09')).toMatchObject({ held: 1, waiting: 1 })
    expect(weeks.at(-1)?.some((c) => c.day === '2026-11-30')).toBe(true)
  })
  it('knows real calendar days', () => {
    expect(isRealDay('2026-02-28')).toBe(true)
    expect(isRealDay('2026-02-31')).toBe(false)
    expect(isRealDay('soon')).toBe(false)
  })
})
