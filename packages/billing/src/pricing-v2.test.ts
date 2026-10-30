import { describe, expect, it } from 'vitest'
import { PRICING_V2 } from './pricing-flag'
import {
  BANDS,
  HOA_PLAN_IDS,
  V2_LOOKUP_KEYS,
  bandFor,
  effectivePlan,
  isLegacyPlan,
  monthlyPriceCents,
  normalizeDoors,
  onTrialFooting,
  planAnnualSavingsUsd,
  planPriceCents,
  stripeTiers,
  stripeVolumeTotalCents,
} from './pricing-v2'

// docs/decisions/2026-10-20-pricing.md §1.

describe('PRICING_V2', () => {
  it('on since the 2026-10-30 cut-over: checkout and the site sell Essentials / Complete', () => {
    expect(PRICING_V2).toBe(true)
  })
})

describe('the band table', () => {
  const TABLE: Array<[number, number, number, number, number]> = [
    // doors, Essentials /mo, Complete /mo, Essentials /yr, Complete /yr (cents)
    [1, 4900, 9900, 49000, 99000],
    [50, 4900, 9900, 49000, 99000],
    [51, 7900, 14900, 79000, 149000],
    [100, 7900, 14900, 79000, 149000],
    [101, 11900, 22900, 119000, 229000],
    [200, 11900, 22900, 119000, 229000],
    [201, 17900, 34900, 179000, 349000],
    [400, 17900, 34900, 179000, 349000],
    [401, 18045, 34985, 180450, 349850],
    [1000, 45000, 85900, 450000, 859000],
  ]

  it.each(TABLE)('%i doors', (doors, essM, compM, essY, compY) => {
    expect(planPriceCents('essentials', 'monthly', doors)).toBe(essM)
    expect(planPriceCents('complete', 'monthly', doors)).toBe(compM)
    expect(planPriceCents('essentials', 'annual', doors)).toBe(essY)
    expect(planPriceCents('complete', 'annual', doors)).toBe(compY)
  })

  it('a 401-door Complete org pays $349.85 (acceptance)', () => {
    expect(planPriceCents('complete', 'monthly', 401)).toBe(34985)
  })

  it('band edges', () => {
    for (const [lo, hi] of [[50, 51], [100, 101], [200, 201], [400, 401]] as const) {
      expect(bandFor(lo).id).not.toBe(bandFor(hi).id)
      expect(bandFor(lo).maxDoors).toBe(lo)
      expect(bandFor(hi).minDoors).toBe(hi)
    }
  })

  it('annual = 10 × monthly at every size (2 months free)', () => {
    for (const plan of HOA_PLAN_IDS) {
      for (let d = 1; d <= 2000; d += 7) {
        expect(planPriceCents(plan, 'annual', d)).toBe(10 * planPriceCents(plan, 'monthly', d))
        expect(planAnnualSavingsUsd(plan, d)).toBe((2 * monthlyPriceCents(plan, d)) / 100)
      }
    }
  })

  it('no door minimum: 1 door pays the 1–50 band; odd input is treated as 1 door or rounded up', () => {
    expect(normalizeDoors(0)).toBe(1)
    expect(normalizeDoors(-3)).toBe(1)
    expect(normalizeDoors(Number.NaN)).toBe(1)
    expect(normalizeDoors(50.2)).toBe(51)
    expect(planPriceCents('essentials', 'monthly', 0)).toBe(4900)
  })

  it('Complete costs more than Essentials at every size', () => {
    for (let d = 1; d <= 2000; d++) {
      expect(monthlyPriceCents('complete', d)).toBeGreaterThan(monthlyPriceCents('essentials', d))
    }
  })
})

describe('the price never decreases as doors rise (1–2,000 doors)', () => {
  it.each(HOA_PLAN_IDS.flatMap((p) => (['monthly', 'annual'] as const).map((c) => [p, c] as const)))('%s %s', (plan, cadence) => {
    let prev = planPriceCents(plan, cadence, 1)
    for (let doors = 2; doors <= 2000; doors++) {
      const cur = planPriceCents(plan, cadence, doors)
      if (cur < prev) throw new Error(`${plan} ${cadence}: ${doors} doors (${cur}) < ${doors - 1} doors (${prev})`)
      prev = cur
    }
  })
})

describe('the Stripe tiers charge exactly planPriceCents', () => {
  it.each(HOA_PLAN_IDS.flatMap((p) => (['monthly', 'annual'] as const).map((c) => [p, c] as const)))('%s %s', (plan, cadence) => {
    const tiers = stripeTiers(plan, cadence)
    expect(tiers.map((t) => t.up_to)).toEqual([50, 100, 200, 400, 'inf'])
    for (let doors = 1; doors <= 2000; doors++) {
      expect(stripeVolumeTotalCents(tiers, doors)).toBe(planPriceCents(plan, cadence, doors))
    }
  })

  it('the tier amounts the rollout spec lists', () => {
    expect(stripeTiers('complete', 'monthly').at(-1)).toEqual({ up_to: 'inf', flat_amount: 900, unit_amount: 85 })
    expect(stripeTiers('complete', 'annual').at(-1)).toEqual({ up_to: 'inf', flat_amount: 9000, unit_amount: 850 })
    expect(stripeTiers('essentials', 'monthly')[0]).toEqual({ up_to: 50, flat_amount: 4900, unit_amount: 0 })
    expect(stripeTiers('essentials', 'annual').at(-1)).toEqual({ up_to: 'inf', flat_amount: 0, unit_amount: 450 })
  })

  it('four distinct lookup keys, none of them the legacy ones', () => {
    const keys = HOA_PLAN_IDS.flatMap((p) => Object.values(V2_LOOKUP_KEYS[p]))
    expect(new Set(keys).size).toBe(4)
    expect(keys).not.toContain('hoa_per_door_monthly')
    expect(keys).not.toContain('hoa_per_door_annual')
  })

  it('bands cover 1..∞ with no gap', () => {
    for (let i = 1; i < BANDS.length; i++) expect(BANDS[i]!.minDoors).toBe((BANDS[i - 1]!.maxDoors as number) + 1)
  })
})

describe('which plan an org is on', () => {
  it('before PRICING_V2 everyone is Complete', () => {
    for (const p of ['free', '', null, 'monthly', 'annual', 'essentials', 'complete', 'pro']) {
      expect(effectivePlan(p, false)).toBe('complete')
      expect(onTrialFooting(p, false)).toBe(false)
    }
  })

  it('after PRICING_V2: essentials and no-subscription orgs are Essentials; legacy and overrides are Complete', () => {
    expect(effectivePlan('essentials', true)).toBe('essentials')
    expect(effectivePlan('free', true)).toBe('essentials')
    expect(effectivePlan(null, true)).toBe('essentials')
    expect(effectivePlan('complete', true)).toBe('complete')
    expect(effectivePlan('monthly', true)).toBe('complete')
    expect(effectivePlan('annual', true)).toBe('complete')
    expect(effectivePlan('legacy_per_door', true)).toBe('complete')
    expect(effectivePlan('pilot', true)).toBe('complete')
    expect(onTrialFooting('free', true)).toBe(true)
    expect(onTrialFooting('essentials', true)).toBe(false)
  })

  it('legacy plans', () => {
    expect(isLegacyPlan('monthly')).toBe(true)
    expect(isLegacyPlan('annual')).toBe(true)
    expect(isLegacyPlan('legacy_per_door')).toBe(true)
    expect(isLegacyPlan('complete')).toBe(false)
    expect(isLegacyPlan(null)).toBe(false)
  })
})
