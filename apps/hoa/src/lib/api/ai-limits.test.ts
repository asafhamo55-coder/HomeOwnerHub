import { describe, expect, it } from 'vitest'
import { HOA_PLAN_IDS, bandFor } from '@homeowner-portal/billing'
import {
  AI_BAND_MULTIPLIER,
  AI_RATE_LIMITS,
  BOARD_AI_DAILY,
  aiCostCeilingUsd,
  aiLimitFor,
  aiTierFor,
  worstCaseMonthlyAiCostUsd,
  type AiUsageBucket,
} from './ai-limits'

// BL-104 / decision 2026-10-20 §3: worst-case AI cost, the board-only cap
// included, is at most 30% of the band's monthly price.

describe('worst-case AI cost ≤ 30% of the price, every plan, 1–2,000 doors', () => {
  it.each(HOA_PLAN_IDS)('%s', (plan) => {
    for (let doors = 1; doors <= 2000; doors++) {
      const tier = { plan, band: bandFor(doors).id }
      const cost = worstCaseMonthlyAiCostUsd(tier)
      const ceiling = aiCostCeilingUsd(plan, doors)
      if (cost > ceiling) throw new Error(`${plan} at ${doors} doors: $${cost.toFixed(2)} > $${ceiling.toFixed(2)}`)
    }
  })

  it('the trial footing (Essentials 1–50) fits under the Essentials 1–50 price', () => {
    expect(worstCaseMonthlyAiCostUsd({ plan: 'essentials', band: '1-50' })).toBeLessThanOrEqual(aiCostCeilingUsd('essentials', 1))
  })

  it('the base ceilings alone (~$120/mo) would break the rule at the smallest band — the reason for BL-104', () => {
    const baseOnly = (Object.keys(AI_RATE_LIMITS) as AiUsageBucket[])
      .filter((b) => !AI_RATE_LIMITS[b].orgPool)
      .reduce((sum, b) => sum + AI_RATE_LIMITS[b].perOrg.limit, 0)
    expect(baseOnly).toBe(3100) // research §3.1's 3,100 calls/day
    expect(aiCostCeilingUsd('complete', 50)).toBeLessThan(115)
  })
})

describe('aiLimitFor', () => {
  it('scales perOrg by the band multiplier, rounded, never below 5', () => {
    expect(aiLimitFor('ask_docs', { plan: 'essentials', band: '1-50' }).perOrg.limit).toBe(50)
    expect(aiLimitFor('resident_assistant', { plan: 'essentials', band: '1-50' }).perOrg.limit).toBe(60)
    expect(aiLimitFor('ask_docs', { plan: 'complete', band: '201-400' }).perOrg.limit).toBe(425)
    // Decision example: a 40-door Essentials org gets 60 assistant messages and 50 doc questions a day.
    const t = aiTierFor({ plan: 'essentials', doors: 40 }, true)
    expect(aiLimitFor('resident_assistant', t).perOrg.limit).toBe(60)
    expect(aiLimitFor('ask_docs', t).perOrg.limit).toBe(50)
  })

  it('every scaled bucket keeps at least 5 a day', () => {
    for (const plan of HOA_PLAN_IDS) {
      for (const band of Object.keys(AI_BAND_MULTIPLIER[plan]) as Array<keyof (typeof AI_BAND_MULTIPLIER)['complete']>) {
        for (const b of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
          expect(aiLimitFor(b, { plan, band }).perOrg.limit).toBeGreaterThanOrEqual(5)
        }
      }
    }
  })

  it('leaves the per-user windows unchanged', () => {
    for (const b of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
      const scaled = aiLimitFor(b, { plan: 'essentials', band: '1-50' })
      expect(scaled.perUser).toEqual(AI_RATE_LIMITS[b].perUser)
      expect(scaled.perUserDaily).toEqual(AI_RATE_LIMITS[b].perUserDaily)
    }
  })

  it('board_ai and compose share the board ceiling: 100/day Essentials, 200/day Complete, at every band', () => {
    expect(BOARD_AI_DAILY).toEqual({ essentials: 100, complete: 200 })
    for (const bucket of ['board_ai', 'compose'] as const) {
      expect(AI_RATE_LIMITS[bucket].orgPool).toEqual(['board_ai', 'compose'])
      expect(aiLimitFor(bucket, { plan: 'essentials', band: '401+' }).perOrg.limit).toBe(100)
      expect(aiLimitFor(bucket, { plan: 'complete', band: '1-50' }).perOrg.limit).toBe(200)
    }
  })

  it('null tier = the base ceilings', () => {
    expect(aiLimitFor('ask_docs', null)).toBe(AI_RATE_LIMITS.ask_docs)
  })
})

describe('aiTierFor', () => {
  it('before PRICING_V2: every org is Complete at its door band, whatever orgs.plan says', () => {
    expect(aiTierFor({ plan: 'free', doors: 40 }, false)).toEqual({ plan: 'complete', band: '1-50' })
    expect(aiTierFor({ plan: 'monthly', doors: 180 }, false)).toEqual({ plan: 'complete', band: '101-200' })
    expect(aiTierFor({ plan: 'essentials', doors: 450 }, false)).toEqual({ plan: 'complete', band: '401+' })
    expect(aiTierFor({ plan: 'free', doors: 0 }, false)).toEqual({ plan: 'complete', band: '1-50' })
  })

  it('after PRICING_V2: the plan decides; no subscription = trial footing (Essentials 1–50)', () => {
    expect(aiTierFor({ plan: 'essentials', doors: 180 }, true)).toEqual({ plan: 'essentials', band: '101-200' })
    expect(aiTierFor({ plan: 'complete', doors: 60 }, true)).toEqual({ plan: 'complete', band: '51-100' })
    expect(aiTierFor({ plan: 'annual', doors: 300 }, true)).toEqual({ plan: 'complete', band: '201-400' })
    expect(aiTierFor({ plan: 'free', doors: 300 }, true)).toEqual({ plan: 'essentials', band: '1-50' })
    expect(aiTierFor({ plan: 'pilot', doors: 300 }, true)).toEqual({ plan: 'complete', band: '201-400' })
  })
})
