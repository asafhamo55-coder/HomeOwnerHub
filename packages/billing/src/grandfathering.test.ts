import { describe, expect, it } from 'vitest'
import { addMonthsUtc, grandfathering, legacyRenewalDate } from './grandfathering'

const d = (iso: string) => new Date(iso)

describe('existing subscriptions keep their price until renewal (decision §5)', () => {
  it('monthly: renewal is the end of the 12-month commitment', () => {
    const facts = { plan: 'monthly', cadence: 'monthly' as const, startedAt: d('2026-03-15T00:00:00Z'), currentPeriodEnd: d('2026-11-15T00:00:00Z') }
    expect(legacyRenewalDate(facts).toISOString()).toBe('2027-03-15T00:00:00.000Z')
    const g = grandfathering(facts, d('2026-10-20T00:00:00Z'))!
    expect(g.keepLegacyPrice).toBe(true)
    expect(g.moveTo).toBe('complete')
    expect(g.noticeAt.toISOString()).toBe('2027-02-13T00:00:00.000Z')
  })

  it('monthly past the commitment: the next invoice is the renewal', () => {
    const facts = { plan: 'monthly', cadence: 'monthly' as const, startedAt: d('2025-01-10T00:00:00Z'), currentPeriodEnd: d('2026-11-10T00:00:00Z') }
    expect(legacyRenewalDate(facts).toISOString()).toBe('2026-11-10T00:00:00.000Z')
  })

  it('annual: renewal is the end of the paid year', () => {
    const facts = { plan: 'annual', cadence: 'annual' as const, startedAt: d('2026-06-01T00:00:00Z'), currentPeriodEnd: d('2027-06-01T00:00:00Z') }
    const g = grandfathering(facts, d('2026-10-20T00:00:00Z'))!
    expect(g.renewsAt.toISOString()).toBe('2027-06-01T00:00:00.000Z')
    expect(g.keepLegacyPrice).toBe(true)
    expect(grandfathering(facts, d('2027-06-01T00:00:00Z'))!.keepLegacyPrice).toBe(false)
  })

  it('a new-plan org has nothing to grandfather', () => {
    const facts = { plan: 'complete', cadence: 'monthly' as const, startedAt: d('2026-01-01T00:00:00Z'), currentPeriodEnd: d('2026-11-01T00:00:00Z') }
    expect(grandfathering(facts, d('2026-10-20T00:00:00Z'))).toBeNull()
  })

  it('month arithmetic clamps to the last day', () => {
    expect(addMonthsUtc(d('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z')
    expect(addMonthsUtc(d('2026-03-15T12:00:00Z'), 12).toISOString()).toBe('2027-03-15T12:00:00.000Z')
  })
})
