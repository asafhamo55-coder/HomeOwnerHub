import { describe, expect, it } from 'vitest'
import { checkRequest, dayStrip, daySlots, validEnds, type Amenity } from './model'
import { approvalLine, cancelLine, dayAria, monthWeeks, nextMonth, plainRules, prevMonth, reviewSentence, timeLabel } from './booking-copy'

const TZ = 'America/New_York'
const NOW = new Date('2026-11-02T15:00:00Z') // 10:00 am in New York

const hall: Amenity = {
  id: 'a1',
  associationId: 'x1',
  name: 'Clubhouse',
  description: null,
  rules: null,
  requiresApproval: true,
  openHour: 8,
  closeHour: 22,
  maxHours: 3,
  advanceDays: 30,
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

const slot = (v: ReturnType<typeof daySlots>, hour: number) => v.slots.find((s) => s.hour === hour)?.state

describe('slots for the booking screen', () => {
  it('marks booked hours taken and offers only lengths that fit', () => {
    // 2 pm to 4 pm New York is held (19:00Z to 21:00Z in November).
    const held = [{ startsAt: '2026-11-08T19:00:00Z', endsAt: '2026-11-08T21:00:00Z' }]
    const v = daySlots({ amenity: hall, day: '2026-11-08', timeZone: TZ, now: NOW, held })
    expect(slot(v, 13)).toBe('free')
    expect(slot(v, 14)).toBe('taken')
    expect(slot(v, 15)).toBe('taken')
    expect(slot(v, 16)).toBe('free')
    expect(validEnds(v, 12, 3)).toEqual([13, 14])
    expect(validEnds(v, 16, 3)).toEqual([17, 18, 19])
  })

  it('never offers more than max hours or past closing', () => {
    const v = daySlots({ amenity: hall, day: '2026-11-08', timeZone: TZ, now: NOW, held: [] })
    expect(validEnds(v, 8, 3)).toEqual([9, 10, 11])
    expect(validEnds(v, 20, 3)).toEqual([21, 22])
  })

  it('marks hours that already passed today', () => {
    const v = daySlots({ amenity: hall, day: '2026-11-02', timeZone: TZ, now: NOW, held: [] })
    expect(slot(v, 9)).toBe('past')
    expect(slot(v, 10)).toBe('past')
    expect(slot(v, 11)).toBe('free')
  })

  it('marks hours inside the notice window as too soon', () => {
    const v = daySlots({ amenity: { ...hall, minNoticeHours: 3 }, day: '2026-11-02', timeZone: TZ, now: NOW, held: [] })
    expect(slot(v, 11)).toBe('too_soon')
    expect(slot(v, 12)).toBe('too_soon')
    expect(slot(v, 13)).toBe('free')
  })

  it('reads the day in the association time zone, not the browser one', () => {
    // 03:00Z on Nov 8 is 10 pm on Nov 7 in New York (EST) and 7 pm on Nov 7 in Los Angeles.
    const held = [{ startsAt: '2026-11-08T03:00:00Z', endsAt: '2026-11-08T04:00:00Z' }]
    const ny = daySlots({ amenity: hall, day: '2026-11-07', timeZone: TZ, now: NOW, held })
    const la = daySlots({ amenity: hall, day: '2026-11-07', timeZone: 'America/Los_Angeles', now: NOW, held })
    expect(slot(ny, 21)).toBe('free')
    expect(slot(la, 19)).toBe('taken')
  })

  it('leaves out the hour that does not exist on the spring-forward day', () => {
    const night = { ...hall, openHour: 0, closeHour: 6 }
    const v = daySlots({ amenity: night, day: '2026-03-08', timeZone: TZ, now: new Date('2026-03-01T15:00:00Z'), held: [] })
    expect(v.slots.map((s) => s.hour)).not.toContain(2)
    expect(v.slots.map((s) => s.hour)).toContain(3)
  })

  it('reports a fully held day as full', () => {
    const held = [{ startsAt: '2026-11-08T13:00:00Z', endsAt: '2026-11-09T04:00:00Z' }]
    const v = daySlots({ amenity: hall, day: '2026-11-08', timeZone: TZ, now: NOW, held })
    expect(v.status).toBe('full')
  })

  it('treats days past the booking window as too far ahead', () => {
    const v = daySlots({ amenity: hall, day: '2027-01-15', timeZone: TZ, now: NOW, held: [] })
    expect(v.status).toBe('too_far')
  })
})

describe('booking words', () => {
  it('writes rules in plain words', () => {
    expect(plainRules(hall)).toBe('Open 8 am to 10 pm. Up to 3 hours. Book up to 30 days ahead.')
  })
  it('writes the review sentence', () => {
    expect(reviewSentence('Clubhouse', '2026-11-08', 14, 16)).toBe('Clubhouse, Sunday, November 8, 2:00 pm to 4:00 pm')
    expect(timeLabel(9)).toBe('9:00 am')
  })
  it('says whether the board approves', () => {
    expect(approvalLine(true)).toBe('The board will confirm this booking. We’ll let you know.')
    expect(approvalLine(false)).toMatch(/confirmed right away/)
  })
  it('explains the cancel cutoff', () => {
    expect(cancelLine(24)).toMatch(/until 24 hours before/)
    expect(cancelLine(0)).toMatch(/any time/)
  })
  it('labels days for screen readers', () => {
    const open = daySlots({ amenity: hall, day: '2026-11-08', timeZone: TZ, now: NOW, held: [] })
    expect(dayAria('2026-11-08', open, '2026-11-02')).toBe('Sunday, November 8, has free times')
    expect(dayAria('2026-11-02', undefined, '2026-11-02')).toContain('today')
    expect(dayAria('2026-12-25', undefined, '2026-11-02')).toContain('not open for booking yet')
  })
  it('moves between months and builds the grid', () => {
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(monthWeeks('2026-11', TZ)[0][0].day).toBe('2026-11-01')
  })
})

describe('lengths offered match what the server accepts', () => {
  // concurrent_limit 2 with bookings at 10-11 and 11-12 (and 11-1): a longer
  // range overlaps more of them, so it must not be offered.
  const two = { ...hall, concurrentLimit: 2, maxHours: 4 }
  const held = [
    { startsAt: '2026-11-14T15:00:00Z', endsAt: '2026-11-14T16:00:00Z' }, // 10-11 NY
    { startsAt: '2026-11-14T16:00:00Z', endsAt: '2026-11-14T17:00:00Z' }, // 11-12 NY
    { startsAt: '2026-11-14T16:00:00Z', endsAt: '2026-11-14T18:00:00Z' }, // 11-1 NY
  ]

  it('does not offer a length the whole-range count would refuse', () => {
    const v = daySlots({ amenity: two, day: '2026-11-14', timeZone: TZ, now: NOW, held })
    expect(validEnds(v, 10, 4)).toEqual([11])
    expect(validEnds(v, 9, 4)).toEqual([10, 11])
  })

  const cases: Array<[string, Amenity, { startsAt: string; endsAt: string }[]]> = [
    ['exclusive, one booking', hall, [{ startsAt: '2026-11-14T19:00:00Z', endsAt: '2026-11-14T21:00:00Z' }]],
    ['limit 2, staggered bookings', two, held],
    ['limit 3, many overlaps', { ...hall, concurrentLimit: 3, maxHours: 5 }, [...held, ...held]],
    ['notice window', { ...hall, minNoticeHours: 5, maxHours: 5 }, []],
  ]
  it.each(cases)('every slot and length offered is accepted by checkRequest (%s)', (_name, amenity, heldList) => {
    for (const day of ['2026-11-02', '2026-11-14']) {
      const v = daySlots({ amenity, day, timeZone: TZ, now: NOW, held: heldList })
      let offered = 0
      for (const s of v.slots) {
        const ends = validEnds(v, s.hour, amenity.maxHours)
        if (s.state === 'free') expect(ends.length).toBeGreaterThan(0)
        for (const e of ends) {
          offered++
          const r = checkRequest({ amenity, day, startHour: s.hour, endHour: e, timeZone: TZ, now: NOW, held: heldList, homeActiveCount: 0 })
          expect(r.ok, `${day} ${s.hour}-${e}`).toBe(true)
        }
      }
      expect(offered).toBeGreaterThan(0)
    }
  })

  it('also holds across the fall-back day', () => {
    const night = { ...hall, openHour: 0, closeHour: 6, maxHours: 4, concurrentLimit: 2 }
    const day = '2026-11-01'
    const now = new Date('2026-10-25T15:00:00Z')
    const v = daySlots({ amenity: night, day, timeZone: TZ, now, held: [] })
    for (const s of v.slots) {
      for (const e of validEnds(v, s.hour, 4)) {
        const r = checkRequest({ amenity: night, day, startHour: s.hour, endHour: e, timeZone: TZ, now, held: [], homeActiveCount: 0 })
        expect(r.ok).toBe(true)
      }
    }
  })
})

describe('dayStrip', () => {
  it('starts at a given day and matches daySlots for each day', () => {
    const held = [{ startsAt: '2026-11-14T19:00:00Z', endsAt: '2026-11-14T21:00:00Z' }]
    const strip = dayStrip({ amenity: hall, timeZone: TZ, now: NOW, held, count: 3, startDay: '2026-11-13' })
    expect(strip.map((d) => d.day)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15'])
    expect(strip[1]).toEqual(daySlots({ amenity: hall, day: '2026-11-14', timeZone: TZ, now: NOW, held }))
    expect(strip[0].slots.every((s) => s.state === 'free')).toBe(true)
  })
})
