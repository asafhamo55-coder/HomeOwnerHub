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
})
