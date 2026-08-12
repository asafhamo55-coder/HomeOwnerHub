import { describe, it, expect } from 'vitest'
import { buildLeaseCapVisual, buildLeaseCapFields } from './lease-cap'

const STATS = { leasedCount: 10, totalUnits: 80, leasedPct: 12.5, capPct: 15 }

describe('buildLeaseCapVisual', () => {
  it('builds a meter against the cap', () => {
    const v = buildLeaseCapVisual(STATS, 3)
    expect(v).toMatchObject({ kind: 'meter', valuePct: 12.5, capPct: 15 })
  })

  it('labels the count without naming anyone', () => {
    const v = buildLeaseCapVisual(STATS, 3)
    if (v.kind !== 'meter') throw new Error('expected meter')
    expect(v.valueLabel).toBe('10 of 80 homes')
    expect(v.capLabel).toBe('15% cap')
  })

  it('refuses to render when the cap is unset rather than guessing', () => {
    expect(() => buildLeaseCapVisual({ ...STATS, capPct: null }, 0)).toThrow(/cap is not set/i)
  })

  it('refuses a zero cap', () => {
    expect(() => buildLeaseCapVisual({ ...STATS, capPct: 0 }, 0)).toThrow(/cap/i)
  })
})

describe('buildLeaseCapFields', () => {
  it('produces text fields carrying the same numbers as the meter', () => {
    const f = buildLeaseCapFields(STATS, 3)
    expect(f.leased_count).toBe('10')
    expect(f.total_units).toBe('80')
    expect(f.leased_pct).toBe('12.5%')
    expect(f.cap_pct).toBe('15%')
    expect(f.waiting_count).toBe('3')
  })

  it('says how many more homes may be leased', () => {
    // floor(0.15 * 80) = 12 permitted, 10 leased → 2 remaining
    expect(buildLeaseCapFields(STATS, 0).remaining_slots).toBe('2')
  })

  it('reports zero remaining rather than a negative when over the cap', () => {
    const over = { leasedCount: 14, totalUnits: 80, leasedPct: 17.5, capPct: 15 }
    expect(buildLeaseCapFields(over, 0).remaining_slots).toBe('0')
  })

  it('pluralises the waiting list correctly', () => {
    expect(buildLeaseCapFields(STATS, 1).waiting_phrase).toBe('1 household is on the waiting list')
    expect(buildLeaseCapFields(STATS, 3).waiting_phrase).toBe('3 households are on the waiting list')
    expect(buildLeaseCapFields(STATS, 0).waiting_phrase).toBe('no households are on the waiting list')
  })

  it('floors leased_pct so a near-cap association never reads as at-cap', () => {
    // 374 of 2500 homes = 14.96% — a realistic mid-size association just
    // under a 15% cap. round1 would print "15%" for both fields, making
    // the sentence "that's 15% against a cap of 15%" — self-contradictory
    // with the meter bar, which correctly shows ~99.7% of the way to cap.
    const nearCap = { leasedCount: 374, totalUnits: 2500, leasedPct: 14.96, capPct: 15 }
    const f = buildLeaseCapFields(nearCap, 0)
    expect(f.leased_pct).toBe('14.9%')
    expect(f.cap_pct).toBe('15%')
    expect(f.leased_pct).not.toBe(f.cap_pct)
  })

  it('still reads leased_pct and cap_pct as equal when genuinely at cap', () => {
    const atCap = { leasedCount: 12, totalUnits: 80, leasedPct: 15, capPct: 15 }
    const f = buildLeaseCapFields(atCap, 0)
    expect(f.leased_pct).toBe('15%')
    expect(f.cap_pct).toBe('15%')
  })

  it('leaves an exact one-decimal value undistorted by the floor', () => {
    // 20 of 100 = 20% exactly — no rounding or flooring should kick in.
    const exact = { leasedCount: 20, totalUnits: 100, leasedPct: 20, capPct: 25 }
    expect(buildLeaseCapFields(exact, 0).leased_pct).toBe('20%')
  })
})
