import { describe, it, expect } from 'vitest'
import { buildLeaseCapMeterHtml, buildLeaseCapFields } from './lease-cap'
import { getTemplate } from './registry'

const STATS = { leasedCount: 10, totalUnits: 80, leasedPct: 12.5, capPct: 15 }
const ACCENT = '#3A5AA8'

describe('buildLeaseCapMeterHtml', () => {
  it('builds a meter against the cap', () => {
    const html = buildLeaseCapMeterHtml(STATS, ACCENT)
    expect(html).toContain('width:83.3%') // 12.5 of 15 cap
    expect(html).not.toContain('<img')
  })

  it('labels the count without naming anyone', () => {
    const html = buildLeaseCapMeterHtml(STATS, ACCENT)
    expect(html).toContain('10 of 80 homes')
    expect(html).toContain('15% cap')
  })

  it('refuses to render when the cap is unset rather than guessing', () => {
    expect(() => buildLeaseCapMeterHtml({ ...STATS, capPct: null }, ACCENT)).toThrow(/cap is not set/i)
  })

  it('refuses a zero cap', () => {
    expect(() => buildLeaseCapMeterHtml({ ...STATS, capPct: 0 }, ACCENT)).toThrow(/cap/i)
  })
})

describe('lease-cap.ts adapter output vs. lease-cap-status providedFields', () => {
  it('produces every field the template declares as providedFields', () => {
    const t = getTemplate('lease-cap-status')
    if (!t) throw new Error('lease-cap-status template not registered')
    const fields = buildLeaseCapFields(STATS, 3)
    const produced = new Set([...Object.keys(fields), 'lease_meter_html'])
    for (const field of t.providedFields ?? []) {
      expect(produced.has(field), `adapter does not produce "${field}"`).toBe(true)
    }
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

  it('does not drop a tenth when the count/total division lands just under it in floating point', () => {
    // 23/40 is exactly 57.5%, but (23/40)*100 computes as 57.49999999999999
    // in floating point — a bare Math.floor(n*10)/10 prints "57.4%". Compute
    // leasedPct via the actual division (the way leases.ts:118 does it), not
    // a literal — a literal 57.5 doesn't reproduce the representation error
    // this guards against.
    const leasedPct = (23 / 40) * 100
    const f = buildLeaseCapFields({ leasedCount: 23, totalUnits: 40, leasedPct, capPct: 60 }, 0)
    expect(f.leased_pct).toBe('57.5%')
  })

  it('does not drop a tenth for another division landing just under it', () => {
    // 29/50 is exactly 58% — (29/50)*100 computes as 57.99999999999999.
    const leasedPct = (29 / 50) * 100
    const f = buildLeaseCapFields({ leasedCount: 29, totalUnits: 50, leasedPct, capPct: 60 }, 0)
    expect(f.leased_pct).toBe('58%')
  })
})
