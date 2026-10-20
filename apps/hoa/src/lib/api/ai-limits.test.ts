import { describe, expect, it } from 'vitest'
import { HOA_PLAN_IDS, bandFor } from '@homeowner-portal/billing'
import {
  AI_BAND_MULTIPLIER,
  AI_RATE_LIMITS,
  AI_CALL_COST_ESTIMATE_USD,
  BOARD_AI_DAILY,
  BOARD_AI_POOL,
  aiCostCeilingUsd,
  flatCapsWorstCaseMonthlyUsd,
  aiLimitFor,
  aiTierFor,
  worstCaseMonthlyAiCostUsd,
  type AiUsageBucket,
} from './ai-limits'
import { COPILOT_MAX_TOKENS_PER_STEP, COPILOT_TOOL_BUDGET } from '../community-qa/copilot-budget'

// BL-104 / decision 2026-10-20 §3: worst-case AI cost, the board-only cap
// included, is at most 30% of the band's monthly price.

describe('worst-case AI cost ≤ 30% of the price, 1–2,000 doors', () => {
  // Essentials: every bucket, BL-106's flat caps included. Complete: the §3
  // buckets only — 25 Copilot questions a day does not fit (pinned below).
  it.each(HOA_PLAN_IDS)('%s', (plan) => {
    for (let doors = 1; doors <= 2000; doors++) {
      const tier = { plan, band: bandFor(doors).id }
      const cost = worstCaseMonthlyAiCostUsd(tier, { includeFlat: plan === 'essentials' })
      const ceiling = aiCostCeilingUsd(plan, doors)
      if (cost > ceiling) throw new Error(`${plan} at ${doors} doors: $${cost.toFixed(2)} > $${ceiling.toFixed(2)}`)
    }
  })

  it('the trial footing (Essentials 1–50) fits under the Essentials 1–50 price', () => {
    expect(worstCaseMonthlyAiCostUsd({ plan: 'essentials', band: '1-50' })).toBeLessThanOrEqual(aiCostCeilingUsd('essentials', 1))
  })

  it('the base ceilings alone (~$120/mo) would break the rule at the smallest band — the reason for BL-104', () => {
    const baseOnly = (Object.keys(AI_RATE_LIMITS) as AiUsageBucket[])
      .filter((b) => !AI_RATE_LIMITS[b].orgPool && !AI_RATE_LIMITS[b].flat)
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

  it('every scaled bucket keeps at least 5 a day (BL-106 flat buckets are not scaled)', () => {
    for (const plan of HOA_PLAN_IDS) {
      for (const band of Object.keys(AI_BAND_MULTIPLIER[plan]) as Array<keyof (typeof AI_BAND_MULTIPLIER)['complete']>) {
        for (const b of (Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]).filter((k) => !AI_RATE_LIMITS[k].flat)) {
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
  const TODAY: Record<Exclude<AiUsageBucket, 'board_ai' | 'meeting_summary' | 'ask_community'>, { perUser: number; perOrg: number; perUserDaily?: number }> = {
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

describe('BL-106: meeting_summary and ask_community (decision amendment)', () => {
  const FLAT = ['meeting_summary', 'ask_community'] as const
  const BANDS = Object.keys(AI_BAND_MULTIPLIER.essentials) as Array<keyof (typeof AI_BAND_MULTIPLIER)['essentials']>

  it('pins the base caps: meeting summary 5/hour, 10/day; Copilot 15/hour, 25/day', () => {
    expect(AI_RATE_LIMITS.meeting_summary.perUser).toEqual({ limit: 5, windowMs: 60 * 60 * 1000 })
    expect(AI_RATE_LIMITS.meeting_summary.perOrg).toEqual({ limit: 10, windowMs: 24 * 60 * 60 * 1000 })
    expect(AI_RATE_LIMITS.ask_community.perUser).toEqual({ limit: 15, windowMs: 60 * 60 * 1000 })
    expect(AI_RATE_LIMITS.ask_community.perOrg).toEqual({ limit: 25, windowMs: 24 * 60 * 60 * 1000 })
  })

  it('are their own buckets: not in the board_ai pool, not pooled with anything', () => {
    for (const b of FLAT) {
      expect(BOARD_AI_POOL).not.toContain(b)
      expect(AI_RATE_LIMITS[b].orgPool).toBeUndefined()
      expect(AI_RATE_LIMITS[b].flat).toBe(true)
    }
  })

  it('legacy and pre-flip orgs (no tier) and Complete at every band keep 10 and 25 a day', () => {
    for (const b of FLAT) {
      expect(aiLimitFor(b, null)).toBe(AI_RATE_LIMITS[b])
      expect(aiLimitFor(b, aiTierFor({ plan: 'monthly', doors: 300 }, true))).toBe(AI_RATE_LIMITS[b])
      expect(aiLimitFor(b, aiTierFor({ plan: 'essentials', doors: 30 }, false))).toBe(AI_RATE_LIMITS[b])
      for (const band of BANDS) expect(aiLimitFor(b, { plan: 'complete', band })).toEqual(AI_RATE_LIMITS[b])
    }
  })

  it('Essentials (and trials) after PRICING_V2: 3 summaries and 0 Copilot questions a day at every band', () => {
    for (const band of BANDS) {
      expect(aiLimitFor('meeting_summary', { plan: 'essentials', band }).perOrg.limit).toBe(3)
      expect(aiLimitFor('ask_community', { plan: 'essentials', band }).perOrg.limit).toBe(0)
      expect(aiLimitFor('ask_community', { plan: 'essentials', band }).perUser).toEqual(AI_RATE_LIMITS.ask_community.perUser)
    }
    const trial = aiTierFor({ plan: 'free', doors: 20 }, true)
    expect(aiLimitFor('ask_community', trial).perOrg.limit).toBe(0)
  })

  it('3 summaries a day fits the §3 room at every Essentials size; 1 Copilot question on top does not fit at 1–400 doors', () => {
    const summaries = 3 * AI_CALL_COST_ESTIMATE_USD.meeting_summary * 30
    const oneQuestion = 1 * AI_CALL_COST_ESTIMATE_USD.ask_community * 30
    for (let doors = 1; doors <= 2000; doors++) {
      const tier = { plan: 'essentials', band: bandFor(doors).id } as const
      const room = aiCostCeilingUsd('essentials', doors) - worstCaseMonthlyAiCostUsd(tier, { includeFlat: false })
      expect(summaries).toBeLessThanOrEqual(room)
      if (doors <= 400) expect(summaries + oneQuestion).toBeGreaterThan(room)
    }
    // 51–100 has the least room: 4 a day would not fit there.
    const t = { plan: 'essentials', band: '51-100' } as const
    const room = aiCostCeilingUsd('essentials', 60) - worstCaseMonthlyAiCostUsd(t, { includeFlat: false })
    expect(4 * AI_CALL_COST_ESTIMATE_USD.meeting_summary * 30).toBeGreaterThan(room)
  })

  it('includeFlat: false is the §3 figure, unchanged by BL-106', () => {
    const tier = { plan: 'essentials', band: '1-50' } as const
    let perDay = 0
    for (const b of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
      if (AI_RATE_LIMITS[b].flat || AI_RATE_LIMITS[b].orgPool) continue
      perDay += aiLimitFor(b, tier).perOrg.limit * AI_CALL_COST_ESTIMATE_USD[b]
    }
    perDay += BOARD_AI_DAILY.essentials * AI_CALL_COST_ESTIMATE_USD.board_ai
    expect(worstCaseMonthlyAiCostUsd(tier, { includeFlat: false })).toBeCloseTo(perDay * 30, 6)
    expect(worstCaseMonthlyAiCostUsd(tier)).toBeCloseTo(perDay * 30 + flatCapsWorstCaseMonthlyUsd(tier), 6)
  })

  it('per-call estimates follow the code budgets: summary ≈ $0.0024, Copilot ≈ $0.0234', () => {
    // 7.7k in × $0.15/M + 2k out × $0.60/M
    expect(AI_CALL_COST_ESTIMATE_USD.meeting_summary).toBeCloseTo(7700 * 0.15e-6 + 2000 * 0.6e-6, 4)
    // 72k in + 8 steps × COPILOT_MAX_TOKENS_PER_STEP out + 6 docs searches at $0.0009
    const steps = 8
    const docs = COPILOT_TOOL_BUDGET.perTool!.search_governing_docs!
    expect(docs).toBe(6)
    expect(AI_CALL_COST_ESTIMATE_USD.ask_community).toBeCloseTo(
      72000 * 0.15e-6 + steps * COPILOT_MAX_TOKENS_PER_STEP * 0.6e-6 + docs * 0.0009,
      4,
    )
  })

  it('worst cases: base (legacy, Complete) $18.27/mo; Essentials $0.22/mo', () => {
    expect(flatCapsWorstCaseMonthlyUsd()).toBeCloseTo((10 * 0.0024 + 25 * 0.0234) * 30, 6)
    expect(flatCapsWorstCaseMonthlyUsd()).toBeCloseTo(18.27, 2)
    expect(flatCapsWorstCaseMonthlyUsd({ plan: 'complete', band: '1-50' })).toBeCloseTo(18.27, 2)
    expect(flatCapsWorstCaseMonthlyUsd({ plan: 'essentials', band: '1-50' })).toBeCloseTo(0.216, 3)
  })

  it('Essentials 1–50, everything included: $14.44 ≤ $14.70 (30% of $49)', () => {
    const cost = worstCaseMonthlyAiCostUsd({ plan: 'essentials', band: '1-50' })
    expect(cost).toBeCloseTo(14.44, 1)
    expect(cost).toBeLessThanOrEqual(aiCostCeilingUsd('essentials', 1))
  })

  it('known gap (amendment): Complete with 25 Copilot questions a day is over 30% at 1–50', () => {
    const cost = worstCaseMonthlyAiCostUsd({ plan: 'complete', band: '1-50' })
    expect(cost).toBeCloseTo(28.44 + 18.27, 1)
    expect(cost).toBeGreaterThan(aiCostCeilingUsd('complete', 1))
  })

  it('normal work fits for current orgs: several meetings a month and dozens of Copilot questions a day', () => {
    expect(AI_RATE_LIMITS.meeting_summary.perOrg.limit).toBeGreaterThanOrEqual(5)
    expect(AI_RATE_LIMITS.ask_community.perOrg.limit).toBeGreaterThanOrEqual(24)
  })
})
