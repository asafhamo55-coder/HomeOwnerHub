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
  it('before PRICING_V2: null for every org (today’s limits), whatever orgs.plan says', () => {
    for (const plan of ['free', 'monthly', 'annual', 'essentials', 'complete', 'pilot', null]) {
      for (const doors of [0, 40, 180, 450]) expect(aiTierFor({ plan, doors }, false)).toBeNull()
    }
  })

  it('after PRICING_V2: new plans get their band; no subscription = trial footing (Essentials 1–50)', () => {
    expect(aiTierFor({ plan: 'essentials', doors: 180 }, true)).toEqual({ plan: 'essentials', band: '101-200' })
    expect(aiTierFor({ plan: 'complete', doors: 60 }, true)).toEqual({ plan: 'complete', band: '51-100' })
    expect(aiTierFor({ plan: 'free', doors: 300 }, true)).toEqual({ plan: 'essentials', band: '1-50' })
  })

  it('after PRICING_V2: grandfathered $4.99/door and other pre-flip orgs keep today’s limits until renewal', () => {
    for (const plan of ['monthly', 'annual', 'legacy_per_door', 'pilot', 'pro']) {
      expect(aiTierFor({ plan, doors: 300 }, true)).toBeNull()
    }
  })
})

describe('legacy and pre-flip orgs: limits equal today’s values exactly', () => {
  // Pinned literally: the BL-078 / BL-096 / BL-101 / BL-102 numbers as they
  // stood before BL-104. A null tier must return every one unchanged.
  const TODAY: Record<Exclude<AiUsageBucket, 'board_ai'>, { perUser: number; perOrg: number; perUserDaily?: number }> = {
    arc_precheck: { perUser: 10, perOrg: 200 },
    ask_docs: { perUser: 30, perOrg: 500 },
    help_ask: { perUser: 30, perOrg: 500 },
    rewrite: { perUser: 30, perOrg: 500 },
    translate: { perUser: 20, perOrg: 200 },
    compose: { perUser: 20, perOrg: 200 },
    follow_up_letter: { perUser: 30, perOrg: 300 },
    resident_assistant: { perUser: 20, perOrg: 600, perUserDaily: 100 },
    inbox_autodraft: { perUser: 60, perOrg: 300 },
  }

  it.each(Object.entries(TODAY))('%s', (bucket, want) => {
    const pre = aiLimitFor(bucket as AiUsageBucket, aiTierFor({ plan: 'monthly', doors: 40 }, false))
    const post = aiLimitFor(bucket as AiUsageBucket, aiTierFor({ plan: 'monthly', doors: 40 }, true))
    for (const cfg of [pre, post]) {
      expect(cfg.perUser.limit).toBe(want.perUser)
      expect(cfg.perOrg.limit).toBe(want.perOrg)
      expect(cfg.perUserDaily?.limit).toBe(want.perUserDaily)
    }
  })

  it('the new board_ai cap (previously unlimited routes) is at the Complete level, 200/day', () => {
    expect(aiLimitFor('board_ai', aiTierFor({ plan: 'annual', doors: 40 }, true)).perOrg.limit).toBe(BOARD_AI_DAILY.complete)
    expect(aiLimitFor('board_ai', aiTierFor({ plan: 'free', doors: 40 }, false)).perOrg.limit).toBe(200)
  })
})
