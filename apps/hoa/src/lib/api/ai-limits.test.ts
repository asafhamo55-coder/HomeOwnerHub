import { describe, expect, it } from 'vitest'
import { HOA_PLAN_IDS, bandFor, monthlyPriceCents } from '@homeowner-portal/billing'
import { MEETING_SUMMARY_MAX_TOKENS, MEETING_TRANSCRIPT_MAX_CHARS } from '@homeowner-portal/ai'
import {
  AI_BAND_MULTIPLIER,
  AI_BUCKET_AUDIENCE,
  AI_RATE_LIMITS,
  AI_CALL_COST_ESTIMATE_USD,
  AI_USAGE_BUCKETS,
  BOARD_AI_DAILY,
  BOARD_AI_POOL,
  COST_MONTH_DAYS,
  HEAVY_USE_DAILY_SHARE,
  HEAVY_USE_DEFAULT_SHARE,
  HEAVY_USE_MONTHLY_CALLS,
  HEAVY_USE_PRICE_SHARE,
  PLATFORM_AI_DAILY_ALERT_USD,
  TRIAL_AI_SPEND_CEILING_USD,
  aiCostCeilingUsd,
  aiSpendFromCountsUsd,
  aiSpendLevel,
  aiSpendThresholdsUsd,
  flatCapsWorstCaseMonthlyUsd,
  heavyUseMonthlyAiCostUsd,
  aiLimitFor,
  aiTierFor,
  monthStartUtc,
  nextMonthStartUtc,
  spendLevelBlocks,
  worstCaseMonthlyAiCostUsd,
  type AiBudget,
  type AiTier,
  type AiUsageBucket,
} from './ai-limits'
import { COPILOT_MAX_TOKENS_PER_STEP, COPILOT_TOOL_BUDGET } from '../community-qa/copilot-budget'

// BL-108 (docs/decisions/2026-10-20-ai-spend-ceiling.md) replaces BL-104's
// "every cap saturated ≤ 30%" rule: a HEAVY-USE month (existing buckets at
// 25% of their caps, board_ai at 30%, the Copilot at 50%, 8 meeting
// summaries a month) is at most 20% of the price at every band, and the
// all-caps-hit month — no longer required to fit — is bounded by the
// monthly spend ceiling at 30% of the price.

/** Simulate a month in which every bucket tries to hit its cap every day, with the spend meter on. */
function simulateCappedMonth(tier: AiTier, budget: AiBudget) {
  const thresholds = aiSpendThresholdsUsd(budget)
  const buckets = Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]
  let spend = 0
  let residentStoppedAt: number | null = null
  let maxCall = 0
  const refused = new Set<AiUsageBucket>()
  for (let day = 0; day < COST_MONTH_DAYS; day++) {
    const usedPool = new Set<string>()
    // Interleave one call per bucket per round, so no bucket gets the month first.
    const left = new Map<AiUsageBucket, number>()
    for (const b of buckets) {
      const cfg = aiLimitFor(b, tier)
      const key = cfg.orgPool ? cfg.orgPool.join('+') : b
      if (cfg.orgPool && usedPool.has(key)) continue
      usedPool.add(key)
      left.set(b, cfg.perOrg.limit)
    }
    while ([...left.values()].some((n) => n > 0)) {
      for (const [b, n] of left) {
        if (n <= 0) continue
        left.set(b, n - 1)
        const level = aiSpendLevel(spend, thresholds)
        if (spendLevelBlocks(b, level)) {
          refused.add(b)
          if (level === 'resident_stop' && residentStoppedAt === null) residentStoppedAt = spend
          continue
        }
        spend += AI_CALL_COST_ESTIMATE_USD[b]
        maxCall = Math.max(maxCall, AI_CALL_COST_ESTIMATE_USD[b])
      }
    }
  }
  return { spend, residentStoppedAt, maxCall, refused, thresholds }
}

describe('BL-108 sizing rule: a heavy-use month ≤ 20% of the price, 1–2,000 doors', () => {
  it.each(HOA_PLAN_IDS)('%s', (plan) => {
    for (let doors = 1; doors <= 2000; doors++) {
      const tier = { plan, band: bandFor(doors).id }
      const heavy = heavyUseMonthlyAiCostUsd(tier)
      const limit = (monthlyPriceCents(plan, doors) / 100) * HEAVY_USE_PRICE_SHARE
      if (heavy > limit) throw new Error(`${plan} at ${doors} doors: $${heavy.toFixed(2)} > $${limit.toFixed(2)}`)
    }
  })

  it('the decision’s figure: heavy use is 13–17% of the price at every closed band', () => {
    for (const plan of HOA_PLAN_IDS) {
      for (const doors of [1, 50, 51, 100, 101, 200, 201, 400, 401]) {
        const share = heavyUseMonthlyAiCostUsd({ plan, band: bandFor(doors).id }) / (monthlyPriceCents(plan, doors) / 100)
        expect(share).toBeGreaterThanOrEqual(0.13)
        expect(share).toBeLessThanOrEqual(0.18)
      }
    }
  })

  it('the definition: 25% of each cap, 30% of the board_ai pool, 50% of the Copilot, 8 summaries a month', () => {
    const tier = { plan: 'essentials', band: '1-50' } as const
    let want = 0
    for (const b of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
      if (b === 'meeting_summary' || b === 'ask_community' || AI_RATE_LIMITS[b].orgPool) continue
      want += 0.25 * aiLimitFor(b, tier).perOrg.limit * AI_CALL_COST_ESTIMATE_USD[b] * 30
    }
    want += 0.3 * BOARD_AI_DAILY.essentials * AI_CALL_COST_ESTIMATE_USD.board_ai * 30
    want += 0.5 * 10 * AI_CALL_COST_ESTIMATE_USD.ask_community * 30
    want += 8 * AI_CALL_COST_ESTIMATE_USD.meeting_summary
    expect(heavyUseMonthlyAiCostUsd(tier)).toBeCloseTo(want, 6)
    expect(HEAVY_USE_DEFAULT_SHARE).toBe(0.25)
    expect(HEAVY_USE_DAILY_SHARE).toEqual({ board_ai: 0.3, compose: 0.3, ask_community: 0.5 })
    expect(HEAVY_USE_MONTHLY_CALLS).toEqual({ meeting_summary: 8 })
  })
})

describe('BL-108: the all-caps-hit month is bounded by the spend ceiling (30% of the price)', () => {
  it('without the ceiling, every cap hit every day is 42–50% of the price (closed bands)', () => {
    for (const plan of HOA_PLAN_IDS) {
      for (const doors of [1, 51, 101, 201]) {
        const share = worstCaseMonthlyAiCostUsd({ plan, band: bandFor(doors).id }) / (monthlyPriceCents(plan, doors) / 100)
        expect(share).toBeGreaterThan(0.41)
        expect(share).toBeLessThanOrEqual(0.5)
      }
    }
  })

  it.each(HOA_PLAN_IDS)('%s: with the meter, a capped month stops at 30% (+ at most one call), every band', (plan) => {
    for (const doors of [1, 50, 51, 100, 101, 200, 201, 400, 401, 900]) {
      const tier = { plan, band: bandFor(doors).id }
      const { spend, maxCall, residentStoppedAt, refused, thresholds } = simulateCappedMonth(tier, { tier, doors, trial: false })
      const ceiling = aiCostCeilingUsd(plan, doors)
      expect(thresholds.boardStopUsd).toBeCloseTo(ceiling, 6)
      expect(spend).toBeLessThanOrEqual(ceiling + maxCall)
      if (worstCaseMonthlyAiCostUsd(tier) < thresholds.residentStopUsd) {
        // Large 401+ orgs: the caps alone keep the month under 25%.
        expect(refused.size).toBe(0)
        continue
      }
      // Resident-facing AI stopped first, at 25%; board AI only at 30%.
      expect(residentStoppedAt).not.toBeNull()
      expect(residentStoppedAt!).toBeGreaterThanOrEqual(thresholds.residentStopUsd)
      if (doors <= 400) expect(refused.has('ask_community')).toBe(true)
    }
  })

  it('trials: $5 a month in total, whatever the caps allow', () => {
    const tier = { plan: 'essentials', band: '1-50' } as const
    expect(worstCaseMonthlyAiCostUsd(tier)).toBeGreaterThan(TRIAL_AI_SPEND_CEILING_USD)
    const { spend, maxCall } = simulateCappedMonth(tier, { tier, doors: 1, trial: true })
    expect(TRIAL_AI_SPEND_CEILING_USD).toBe(5)
    expect(spend).toBeLessThanOrEqual(5 + maxCall)
  })
})

describe('BL-108 spend tiers', () => {
  const budget = (plan: 'essentials' | 'complete', doors: number, trial = false): AiBudget => ({
    tier: { plan, band: bandFor(doors).id },
    doors,
    trial,
  })

  it('20 / 25 / 30% of the monthly price for a paying org', () => {
    expect(aiSpendThresholdsUsd(budget('essentials', 40))).toEqual({
      noticeUsd: expect.closeTo(9.8, 6),
      residentStopUsd: expect.closeTo(12.25, 6),
      boardStopUsd: expect.closeTo(14.7, 6),
    })
    // 401+ is priced per door: Complete 500 doors = $9 + 500 × $0.85 = $434.
    expect(aiSpendThresholdsUsd(budget('complete', 500)).boardStopUsd).toBeCloseTo(130.2, 6)
  })

  it('trials: the $5 total is the hard stop; the earlier tiers keep their proportions', () => {
    const t = aiSpendThresholdsUsd(budget('essentials', 300, true))
    expect(t.boardStopUsd).toBeCloseTo(5, 6)
    expect(t.residentStopUsd).toBeCloseTo(5 * (25 / 30), 6)
    expect(t.noticeUsd).toBeCloseTo(5 * (20 / 30), 6)
  })

  it('levels and what each one refuses', () => {
    const t = { noticeUsd: 2, residentStopUsd: 2.5, boardStopUsd: 3 }
    expect(aiSpendLevel(1.99, t)).toBe('normal')
    expect(aiSpendLevel(2, t)).toBe('notice')
    expect(aiSpendLevel(2.5, t)).toBe('resident_stop')
    expect(aiSpendLevel(3, t)).toBe('board_stop')
    for (const b of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
      expect(spendLevelBlocks(b, 'normal')).toBe(false)
      expect(spendLevelBlocks(b, 'notice')).toBe(false)
      expect(spendLevelBlocks(b, 'board_stop')).toBe(true)
    }
  })

  it('tier 1 stops exactly the resident-facing and automatic buckets (decision §2)', () => {
    const stopped = (Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]).filter((b) => spendLevelBlocks(b, 'resident_stop')).sort()
    expect(stopped).toEqual(['arc_precheck', 'ask_docs', 'help_ask', 'inbox_autodraft', 'resident_assistant', 'rewrite'])
    for (const b of ['ask_community', 'meeting_summary', 'board_ai', 'compose', 'follow_up_letter', 'translate'] as const) {
      expect(AI_BUCKET_AUDIENCE[b]).toBe('board')
    }
  })

  it('spend = Σ count × per-call estimate; calendar month in UTC', () => {
    expect(aiSpendFromCountsUsd({ ask_community: 10, meeting_summary: 2, ask_docs: 100 })).toBeCloseTo(
      10 * 0.0234 + 2 * 0.0024 + 100 * 0.0009,
      9,
    )
    expect(aiSpendFromCountsUsd({})).toBe(0)
    const late = Date.parse('2026-10-31T23:59:59.000Z')
    expect(monthStartUtc(late).toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(nextMonthStartUtc(late).toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(nextMonthStartUtc(Date.parse('2026-12-15T00:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(AI_USAGE_BUCKETS.sort()).toEqual((Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]).sort())
  })

  it('platform alert threshold is $50/day', () => {
    expect(PLATFORM_AI_DAILY_ALERT_USD).toBe(50)
  })
})

describe('worst-case bookkeeping (BL-104, unchanged)', () => {

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

  it('legacy and pre-flip orgs (no tier) keep 10 and 25 a day', () => {
    for (const b of FLAT) {
      expect(aiLimitFor(b, null)).toBe(AI_RATE_LIMITS[b])
      expect(aiLimitFor(b, aiTierFor({ plan: 'monthly', doors: 300 }, true))).toBe(AI_RATE_LIMITS[b])
      expect(aiLimitFor(b, aiTierFor({ plan: 'essentials', doors: 30 }, false))).toBe(AI_RATE_LIMITS[b])
      expect(aiLimitFor(b, aiTierFor({ plan: 'complete', doors: 300 }, false))).toBe(AI_RATE_LIMITS[b])
    }
  })

  it('BL-108 table: per-plan, per-band daily caps for new-plan orgs (replaces BL-106’s provisional 3 / 0)', () => {
    const TABLE = {
      essentials: { copilot: [10, 15, 20, 30, 30], summaries: [2, 2, 2, 2, 2] },
      complete: { copilot: [25, 40, 60, 100, 100], summaries: [3, 3, 3, 3, 3] },
    } as const
    for (const plan of HOA_PLAN_IDS) {
      BANDS.forEach((band, i) => {
        const copilot = aiLimitFor('ask_community', { plan, band })
        const summary = aiLimitFor('meeting_summary', { plan, band })
        expect(copilot.perOrg.limit).toBe(TABLE[plan].copilot[i])
        expect(summary.perOrg.limit).toBe(TABLE[plan].summaries[i])
        // Per-person windows and the 429 wording stay the base ones.
        expect(copilot.perUser).toEqual(AI_RATE_LIMITS.ask_community.perUser)
        expect(summary.perUser).toEqual(AI_RATE_LIMITS.meeting_summary.perUser)
        expect(copilot.noun).toBe('Copilot questions')
      })
    }
    // Trials run on Essentials 1–50.
    const trial = aiTierFor({ plan: 'free', doors: 20 }, true)
    expect(aiLimitFor('ask_community', trial).perOrg.limit).toBe(10)
    expect(aiLimitFor('meeting_summary', trial).perOrg.limit).toBe(2)
  })

  it('every new-plan band has the Copilot (no plan_limit 0 left)', () => {
    for (const plan of HOA_PLAN_IDS) {
      for (const band of BANDS) expect(aiLimitFor('ask_community', { plan, band }).perOrg.limit).toBeGreaterThan(0)
    }
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

  it('per-call estimates follow the code budgets: summary ≈ $0.0024 (the 30k-char cut that binds), Copilot ≈ $0.0234', () => {
    // BL-108 verification: the route accepts 500,000 chars (MAX_DOCUMENT_TEXT)
    // but the model sees MEETING_TRANSCRIPT_MAX_CHARS. ~4 chars per token,
    // + ~0.2k prompt in; MEETING_SUMMARY_MAX_TOKENS out.
    expect(MEETING_TRANSCRIPT_MAX_CHARS).toBe(30_000)
    const inTokens = MEETING_TRANSCRIPT_MAX_CHARS / 4 + 200
    expect(AI_CALL_COST_ESTIMATE_USD.meeting_summary).toBeCloseTo(inTokens * 0.15e-6 + MEETING_SUMMARY_MAX_TOKENS * 0.6e-6, 4)
    // The 500k-char reading would be ~8× dearer; the estimate is not that.
    expect(AI_CALL_COST_ESTIMATE_USD.meeting_summary).toBeLessThan(0.005)
    // 72k in + 8 steps × COPILOT_MAX_TOKENS_PER_STEP out + 6 docs searches at $0.0009
    const steps = 8
    const docs = COPILOT_TOOL_BUDGET.perTool!.search_governing_docs!
    expect(docs).toBe(6)
    expect(AI_CALL_COST_ESTIMATE_USD.ask_community).toBeCloseTo(
      72000 * 0.15e-6 + steps * COPILOT_MAX_TOKENS_PER_STEP * 0.6e-6 + docs * 0.0009,
      4,
    )
  })

  it('flat-bucket worst cases: base (legacy) $18.27/mo; Essentials 1–50 $7.16; Complete 1–50 $17.77', () => {
    expect(flatCapsWorstCaseMonthlyUsd()).toBeCloseTo((10 * 0.0024 + 25 * 0.0234) * 30, 6)
    expect(flatCapsWorstCaseMonthlyUsd()).toBeCloseTo(18.27, 2)
    expect(flatCapsWorstCaseMonthlyUsd({ plan: 'essentials', band: '1-50' })).toBeCloseTo((2 * 0.0024 + 10 * 0.0234) * 30, 6)
    expect(flatCapsWorstCaseMonthlyUsd({ plan: 'complete', band: '1-50' })).toBeCloseTo((3 * 0.0024 + 25 * 0.0234) * 30, 6)
  })

  it('normal work fits for current orgs: several meetings a month and dozens of Copilot questions a day', () => {
    expect(AI_RATE_LIMITS.meeting_summary.perOrg.limit).toBeGreaterThanOrEqual(5)
    expect(AI_RATE_LIMITS.ask_community.perOrg.limit).toBeGreaterThanOrEqual(24)
  })
})
