import { describe, expect, it } from 'vitest'
import {
  amenityFromRow,
  canCancel,
  checkRequest,
  countsAgainstHome,
  endHours,
  hourLabel,
  initialStatus,
  overlaps,
  rulesSummary,
  startHours,
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
}

const base = { amenity: hall, day: '2026-11-08', startHour: 14, endHour: 18, timeZone: TZ, now: NOW, held: [], homeActiveCount: 0 }

describe('hourLabel', () => {
  it('writes plain clock times', () => {
    expect(hourLabel(8)).toBe('8:00 AM')
    expect(hourLabel(12)).toBe('12:00 PM')
    expect(hourLabel(22)).toBe('10:00 PM')
    expect(hourLabel(24)).toBe('12:00 AM')
    expect(hourLabel(0)).toBe('12:00 AM')
  })
})

describe('pickers and summary', () => {
  it('offers only hours inside the rules', () => {
    expect(startHours(hall)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
    expect(endHours(hall, 9)).toEqual([10, 11, 12, 13])
    expect(endHours(hall, 20)).toEqual([21, 22])
  })
  it('states the rules in one plain sentence', () => {
    expect(rulesSummary(hall)).toBe('Open 8:00 AM to 10:00 PM. Up to 4 hours a booking. Book up to 60 days ahead.')
  })
})

describe('checkRequest', () => {
  it('accepts a good request and returns UTC instants for the local hours', () => {
    const r = checkRequest(base)
    expect(r).toEqual({ ok: true, startsAt: '2026-11-08T19:00:00.000Z', endsAt: '2026-11-08T23:00:00.000Z' })
  })

  it('refuses hours outside opening time, too long, or backwards', () => {
    expect(checkRequest({ ...base, startHour: 6, endHour: 8 }).ok).toBe(false)
    expect(checkRequest({ ...base, startHour: 20, endHour: 23 }).ok).toBe(false)
    expect(checkRequest({ ...base, startHour: 10, endHour: 15 }).ok).toBe(false)
    expect(checkRequest({ ...base, startHour: 15, endHour: 15 }).ok).toBe(false)
  })

  it('refuses the past and too far ahead', () => {
    expect(checkRequest({ ...base, day: '2026-11-02', startHour: 9, endHour: 10 }).ok).toBe(false)
    expect(checkRequest({ ...base, day: '2027-03-01' }).ok).toBe(false)
    expect(checkRequest({ ...base, day: '2026-12-31' }).ok).toBe(true)
  })

  it('refuses an overlap but allows back to back', () => {
    const held = [{ startsAt: '2026-11-08T19:00:00.000Z', endsAt: '2026-11-08T23:00:00.000Z' }]
    const clash = checkRequest({ ...base, held, startHour: 16, endHour: 19 })
    expect(clash.ok).toBe(false)
    expect(checkRequest({ ...base, held, startHour: 18, endHour: 20 }).ok).toBe(true)
    expect(checkRequest({ ...base, held, startHour: 12, endHour: 14 }).ok).toBe(true)
  })

  it('stops a home at its limit', () => {
    const r = checkRequest({ ...base, homeActiveCount: 2 })
    expect(r.ok).toBe(false)
  })

  it('refuses a turned-off amenity and a bad day', () => {
    expect(checkRequest({ ...base, amenity: { ...hall, isActive: false } }).ok).toBe(false)
    expect(checkRequest({ ...base, day: 'next week' }).ok).toBe(false)
    expect(checkRequest({ ...base, day: '2026-02-31' }).ok).toBe(false)
  })

  it('keeps the wall clock across daylight saving time', () => {
    const r = checkRequest({ ...base, day: '2026-11-08', startHour: 9, endHour: 11 })
    // Clocks fall back at 2:00 AM on Nov 8, so 9 AM is UTC-5.
    expect(r).toEqual({ ok: true, startsAt: '2026-11-08T14:00:00.000Z', endsAt: '2026-11-08T16:00:00.000Z' })
  })
})

describe('overlaps', () => {
  it('treats ranges as half open', () => {
    const a = { startsAt: '2026-11-08T10:00:00Z', endsAt: '2026-11-08T12:00:00Z' }
    expect(overlaps(a, { startsAt: '2026-11-08T12:00:00Z', endsAt: '2026-11-08T13:00:00Z' })).toBe(false)
    expect(overlaps(a, { startsAt: '2026-11-08T11:59:00Z', endsAt: '2026-11-08T13:00:00Z' })).toBe(true)
  })
})

describe('status helpers', () => {
  it('auto-confirms only when the board does not need to approve', () => {
    expect(initialStatus({ requiresApproval: true })).toBe('pending')
    expect(initialStatus({ requiresApproval: false })).toBe('approved')
  })
  it('counts only held, unfinished bookings against a home', () => {
    expect(countsAgainstHome({ status: 'pending', endsAt: '2026-11-09T00:00:00Z' }, NOW)).toBe(true)
    expect(countsAgainstHome({ status: 'denied', endsAt: '2026-11-09T00:00:00Z' }, NOW)).toBe(false)
    expect(countsAgainstHome({ status: 'approved', endsAt: '2026-11-01T00:00:00Z' }, NOW)).toBe(false)
  })
  it('lets a booking be canceled only before it starts', () => {
    expect(canCancel({ status: 'approved', startsAt: '2026-11-09T00:00:00Z' }, NOW)).toBe(true)
    expect(canCancel({ status: 'approved', startsAt: '2026-11-01T00:00:00Z' }, NOW)).toBe(false)
    expect(canCancel({ status: 'canceled', startsAt: '2026-11-09T00:00:00Z' }, NOW)).toBe(false)
  })
})

describe('amenityFromRow', () => {
  it('maps a row and refuses a broken one', () => {
    expect(amenityFromRow({ id: 'a', association_id: 'b', name: 'Pool', requires_approval: false })?.requiresApproval).toBe(false)
    expect(amenityFromRow({ id: 'a' })).toBeNull()
  })
})
