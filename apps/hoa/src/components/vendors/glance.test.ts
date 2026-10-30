import { describe, expect, it } from 'vitest'
import { coiBucket, type CoiBucket } from '@/app/(dashboard)/vendors/coi-filter'
import { buildGlance, daysLabel, type GlanceInput } from './glance'

const today = new Date(2026, 9, 30)
const base: GlanceInput = {
  legalName: 'Acme',
  createdAt: '2026-01-01T00:00:00Z',
  coi: { status: 'green', coi_expiration_date: '2027-03-01' },
  lastReviewedAt: null,
  documentDates: [],
  bids: [],
}

describe('buildGlance', () => {
  const cases: Array<[string, GlanceInput['coi'], CoiBucket]> = [
    ['expired', { status: 'green', coi_expiration_date: '2026-10-01' }, 'expired'],
    ['expiring', { status: 'yellow', coi_expiration_date: '2026-11-15' }, 'expiring'],
    ['ok', { status: 'green', coi_expiration_date: '2027-06-01' }, 'ok'],
    ['missing (no row)', null, 'missing'],
    ['missing (status)', { status: 'missing', coi_expiration_date: '2027-06-01' }, 'missing'],
  ]
  it.each(cases)('chip agrees with coi-filter: %s', (_n, coi, want) => {
    const g = buildGlance({ ...base, coi }, today)
    expect(g.coiBucket).toBe(want)
    expect(g.coiBucket).toBe(coiBucket({ legal_name: 'Acme', compliance: coi }, today))
  })

  it('counts open bids, open rfps and awards', () => {
    const g = buildGlance(
      {
        ...base,
        bids: [
          { status: 'submitted', rfp_id: 'a', rfp_status: 'open', submitted_at: '2026-09-01T00:00:00Z' },
          { status: 'draft', rfp_id: 'b', rfp_status: 'evaluation', submitted_at: null },
          { status: 'withdrawn', rfp_id: 'c', rfp_status: 'cancelled', submitted_at: null },
          { status: 'awarded', rfp_id: 'd', rfp_status: 'awarded', submitted_at: '2026-10-10T00:00:00Z' },
        ],
      },
      today,
    )
    expect(g.openBids).toBe(2)
    expect(g.openRfps).toBe(2)
    expect(g.awardedBids).toBe(1)
    expect(g.lastActivity).toBe('2026-10-10T00:00:00Z')
  })

  it('empty states', () => {
    const g = buildGlance({ ...base, coi: null }, today)
    expect(g.openBids).toBe(0)
    expect(g.openRfps).toBe(0)
    expect(g.daysToExpiry).toBeNull()
    expect(g.daysLabel).toBe('No expiry on file')
    expect(g.lastActivity).toBe('2026-01-01T00:00:00Z')
  })

  it('day labels', () => {
    expect(daysLabel(0)).toBe('Expires today')
    expect(daysLabel(1)).toBe('1 day left')
    expect(daysLabel(-3)).toBe('Expired 3 days ago')
  })
})
