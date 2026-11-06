import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Amenity } from './model'

const AID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-02T15:00:00Z') // 10:00 am in New York
const TZ = 'America/New_York'

const hall: Amenity = {
  id: AID,
  associationId: 'assoc-1',
  name: 'Clubhouse',
  description: null,
  rules: null,
  requiresApproval: true,
  openHour: 8,
  closeHour: 22,
  maxHours: 3,
  advanceDays: 400,
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

const state = {
  actor: { id: 'user-1' as string | null, impersonating: false, orgId: null as string | null },
  org: { id: 'org-1' } as { id: string } | null,
  units: [{ unit_id: 'u1', association_id: 'assoc-1', association_time_zone: TZ }] as Array<{
    unit_id: string
    association_id: string
    association_time_zone: string | null
  }>,
  amenities: [hall] as Amenity[] | null,
  held: new Map<string, Array<{ startsAt: string; endsAt: string }>>(),
}
const loadHeldSlots = vi.fn(async (..._a: unknown[]) => state.held)

vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => ({}) }))
vi.mock('@homeowner-portal/db/m11', () => ({ M11_APPLIED: true }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => state.org }))
vi.mock('@/lib/impersonation', () => ({ getResidentActor: async () => state.actor }))
vi.mock('@/lib/resident', () => ({ getResidentUnits: async () => state.units }))
vi.mock('./queries', () => ({
  loadAmenities: async () => state.amenities,
  loadHeldSlots: (...a: unknown[]) => loadHeldSlots(...a),
}))

const { loadBookingDays } = await import('./booking-days')
const { dayStrip } = await import('./model')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  state.actor = { id: 'user-1', impersonating: false, orgId: null }
  state.org = { id: 'org-1' }
  state.units = [{ unit_id: 'u1', association_id: 'assoc-1', association_time_zone: TZ }]
  state.amenities = [hall]
  state.held = new Map()
  loadHeldSlots.mockClear()
})

describe('loadBookingDays', () => {
  it('refuses someone who is not signed in', async () => {
    state.actor = { id: null, impersonating: false, orgId: null }
    const r = await loadBookingDays({ amenityId: AID, fromDay: '2026-12-02', count: 30 })
    expect(r.ok).toBe(false)
    expect(loadHeldSlots).not.toHaveBeenCalled()
  })

  it('refuses a person with no home, and one with no community', async () => {
    state.units = []
    expect((await loadBookingDays({ amenityId: AID, fromDay: '2026-12-02', count: 30 })).ok).toBe(false)
    state.units = [{ unit_id: 'u1', association_id: 'assoc-1', association_time_zone: TZ }]
    state.org = null
    expect((await loadBookingDays({ amenityId: AID, fromDay: '2026-12-02', count: 30 })).ok).toBe(false)
    expect(loadHeldSlots).not.toHaveBeenCalled()
  })

  it('refuses an amenity from another association or another org', async () => {
    state.units = [{ unit_id: 'u9', association_id: 'assoc-other', association_time_zone: TZ }]
    expect((await loadBookingDays({ amenityId: AID, fromDay: '2026-12-02', count: 30 })).ok).toBe(false)
    state.units = [{ unit_id: 'u1', association_id: 'assoc-1', association_time_zone: TZ }]
    // The loader is scoped to the current org, so an amenity of another org is simply absent.
    state.amenities = []
    expect((await loadBookingDays({ amenityId: AID, fromDay: '2026-12-02', count: 30 })).ok).toBe(false)
    state.amenities = [{ ...hall, retiredAt: '2026-10-01T00:00:00Z' }]
    expect((await loadBookingDays({ amenityId: AID, fromDay: '2026-12-02', count: 30 })).ok).toBe(false)
    expect(loadHeldSlots).not.toHaveBeenCalled()
  })

  it('refuses an impersonated session from another org', async () => {
    state.actor = { id: 'admin-1', impersonating: true, orgId: 'org-other' }
    expect((await loadBookingDays({ amenityId: AID, fromDay: '2026-12-02', count: 30 })).ok).toBe(false)
  })

  it('refuses bad input: a window over 62 days, a bad id, a bad date', async () => {
    expect((await loadBookingDays({ amenityId: AID, fromDay: '2026-12-02', count: 63 })).ok).toBe(false)
    expect((await loadBookingDays({ amenityId: AID, fromDay: '2026-12-02', count: 0 })).ok).toBe(false)
    expect((await loadBookingDays({ amenityId: 'nope', fromDay: '2026-12-02', count: 5 })).ok).toBe(false)
    expect((await loadBookingDays({ amenityId: AID, fromDay: 'December', count: 5 })).ok).toBe(false)
    expect(loadHeldSlots).not.toHaveBeenCalled()
  })

  it('never returns days before today', async () => {
    const r = await loadBookingDays({ amenityId: AID, fromDay: '2020-01-01', count: 5 })
    expect(r.ok && r.days.map((d) => d.day)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'])
    const from = (loadHeldSlots.mock.calls[0] as unknown[])[3] as string
    expect(Date.parse(from)).toBeGreaterThanOrEqual(Date.parse('2026-11-02T05:00:00Z'))
  })

  it('stays inside one call of 62 days and asks for a bounded window', async () => {
    const r = await loadBookingDays({ amenityId: AID, fromDay: '2026-11-02', count: 62 })
    expect(r.ok && r.days.length).toBe(62)
    const args = loadHeldSlots.mock.calls[0] as unknown[]
    expect(args[5]).toBeTypeOf('string') // toIso: the read is bounded
    expect(Date.parse(args[5] as string) - Date.parse(args[3] as string)).toBeLessThanOrEqual(63 * 86_400_000)
  })

  it('returns nothing beyond the last bookable day, so never more than a year out', async () => {
    const far = await loadBookingDays({ amenityId: AID, fromDay: '2028-01-01', count: 30 })
    expect(far).toEqual({ ok: true, days: [] })
    // advanceDays 400 means the last day is 2027-12-07; days past it would be too_far, not bookable.
    const edge = await loadBookingDays({ amenityId: AID, fromDay: '2027-12-05', count: 10 })
    expect(edge.ok && edge.days.filter((d) => d.status === 'open').every((d) => d.day <= '2027-12-07')).toBe(true)
  })

  it('returns the same DayView as the page does for the same day', async () => {
    const held = [{ startsAt: '2026-11-14T19:00:00Z', endsAt: '2026-11-14T21:00:00Z' }]
    state.held = new Map([[AID, held]])
    const r = await loadBookingDays({ amenityId: AID, fromDay: '2026-11-13', count: 3 })
    const page = dayStrip({ amenity: hall, timeZone: TZ, now: NOW, held, count: 3, startDay: '2026-11-13' })
    expect(r).toEqual({ ok: true, days: page })
    expect(r.ok && r.days[1].slots.find((s) => s.hour === 14)?.state).toBe('taken')
  })
})
