// BL-078 — the one place the AI rate limits live (RC-13: shared, not
// per-process). Every model call costs money, so each AI route a resident or
// any member can call over and over draws on two windows:
//
//   perUser  — one person clicking repeatedly (hourly).
//   perOrg   — a whole community's daily ceiling, so many residents (or one
//              person with several logins) cannot run the bill up.
//
// Board-only AI routes sit behind requireRouteBoardOrAdmin. The BL-025
// translation, follow-up letters and the BL-102 compose box have their own
// buckets; since BL-104 violation drafting, digests, analyze-violation and
// parse/suggest share `board_ai`. Meeting summary and the board Copilot
// (ask-community) are NOT in `board_ai`: since BL-106 each has its own
// bucket (`meeting_summary`, `ask_community`), not band-scaled.
//
// The mechanism (lib/api/rate-limit.ts) counts rows in audit_log with
// action `ai.usage.<bucket>`. Changing a number here takes effect on the next
// request; no migration, no cache.
//
// BL-104 (docs/decisions/2026-10-20-pricing.md §3) — live now, not behind
// PRICING_V2. The numbers in AI_RATE_LIMITS are the BASE ceilings. What an
// org actually gets is aiLimitFor(bucket, tier):
//   - perOrg.limit = max(5, round(base × AI_BAND_MULTIPLIER[plan][band]))
//     so worst-case AI cost stays ≤ 30% of the band's monthly price;
//   - the board-only routes that had no limit (violation drafting from the
//     wizard and /inspect, analyze-violation, digests, parse-document,
//     suggest-fields) draw on `board_ai`,
//     and the BL-102 compose box shares that bucket's org ceiling
//     (BOARD_AI_POOL): 100/day on Essentials, 200/day on Complete;
//   - per-user windows are unchanged.
// The multipliers apply only to orgs on the new Essentials / Complete plans
// (and trials once PRICING_V2 is on). Every other org — all of them before
// the flip, grandfathered $4.99/door subscriptions until renewal after it —
// keeps today's per-feature limits exactly (aiTierFor returns null), plus the
// new board_ai cap at the Complete level (200/day): added safety on routes
// that had no limit, not a reduction. A tier that can't be read falls back
// to the same base ceilings (fail open, like the ledger).
//
// BL-106 (decision 2026-10-20-pricing.md, "Amendment — BL-106") —
// `meeting_summary` and `ask_community` are `flat`: never band-multiplied and
// never in the board_ai pool. Every org without a tier (all of them before
// PRICING_V2; legacy and pre-flip after) gets the base ceilings (10 and 25 a
// day), exactly as before.
//
// BL-108 (docs/decisions/2026-10-20-ai-spend-ceiling.md) replaces BL-106's
// provisional per-plan values and the "every cap saturated ≤ 30%" rule:
//   - new-plan orgs get the decision table's per-plan, per-band daily
//     ceilings for the two flat buckets (perOrgByPlanBand);
//   - the sizing rule is a HEAVY-USE month ≤ 20% of price
//     (heavyUseMonthlyAiCostUsd);
//   - a monthly org AI spend meter (lib/api/ai-spend.ts) bounds the
//     all-caps-hit month at 30% of price (aiSpendThresholdsUsd): at 20% the
//     board gets an FYI email, at 25% resident-facing and automatic AI stops,
//     at 30% board AI stops too, until the 1st (UTC). Trials: $5 a month.
// All of it reaches only orgs with a tier, i.e. only once PRICING_V2 is on.

import {
  bandFor,
  effectivePlan,
  monthlyPriceCents,
  onTrialFooting,
  type BandId,
  type HoaPlanId,
} from '@homeowner-portal/billing'

export type AiUsageBucket =
  | 'arc_precheck'
  | 'ask_docs'
  | 'help_ask'
  | 'rewrite'
  | 'translate'
  | 'compose'
  | 'follow_up_letter'
  | 'resident_assistant'
  | 'inbox_autodraft'
  | 'board_ai'
  | 'meeting_summary'
  | 'ask_community'

export interface RateWindow {
  /** Max calls inside the window. */
  limit: number
  /** Sliding window length. */
  windowMs: number
}

export interface AiRateLimit {
  perUser: RateWindow
  /** Optional second per-person window (daily), checked alongside perUser. */
  perUserDaily?: RateWindow
  perOrg: RateWindow
  /** Plural noun for the 429 message: "10 rules checks an hour". */
  noun: string
  /** Optional sentence appended to the 429 message. */
  suffix?: string
  /**
   * Buckets whose rows count together against perOrg (a shared ceiling).
   * Absent = this bucket's own rows only.
   */
  orgPool?: readonly AiUsageBucket[]
  /** Plural noun for the org-scope 429 when the ceiling is pooled. */
  orgNoun?: string
  /**
   * BL-106: a fixed ceiling at every plan and band (aiLimitFor never scales
   * it) whose cost is accounted in the decision's BL-106 amendment, not in
   * the §3 sum (worstCaseMonthlyAiCostUsd skips it).
   */
  flat?: true
  /**
   * BL-108: a flat bucket's per-org daily ceiling for orgs on a new plan, by
   * plan and band (tiered orgs only). Absent = the base perOrg. A 0 would
   * mean "not on the plan" (429 plan_limit without a ledger read).
   */
  perOrgByPlanBand?: Readonly<Record<HoaPlanId, Readonly<Record<BandId, number>>>>
}

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

/** The board-only buckets that share one per-org daily ceiling (decision §3). */
export const BOARD_AI_POOL: readonly AiUsageBucket[] = ['board_ai', 'compose']

export const AI_RATE_LIMITS: Record<AiUsageBucket, AiRateLimit> = {
  // POST /api/ai/arc-precheck — one W37 call per click. A resident edits and
  // re-checks a few times per application; 10/hour is generous for that.
  arc_precheck: {
    perUser: { limit: 10, windowMs: HOUR_MS },
    perOrg: { limit: 200, windowMs: DAY_MS },
    noun: 'rules checks',
    suffix: 'You can still submit your application.',
  },
  // POST /api/ai/ask-docs — the resident "Ask the Docs" page (and the board's).
  ask_docs: {
    perUser: { limit: 30, windowMs: HOUR_MS },
    perOrg: { limit: 500, windowMs: DAY_MS },
    noun: 'questions',
  },
  // POST /api/help/ask — the help drawer's "Ask the guide", every member.
  help_ask: {
    perUser: { limit: 30, windowMs: HOUR_MS },
    perOrg: { limit: 500, windowMs: DAY_MS },
    noun: 'help questions',
  },
  // POST /api/ai/rewrite — "Rewrite with AI" on resident and board text fields.
  rewrite: {
    perUser: { limit: 30, windowMs: HOUR_MS },
    perOrg: { limit: 500, windowMs: DAY_MS },
    noun: 'rewrites',
  },
  // POST /api/ai/translate-communication — "Add Spanish version" in the
  // communications wizard (BL-025). Board-only, but each click is a long
  // model call, so it draws on the shared ledger like the routes above.
  translate: {
    perUser: { limit: 20, windowMs: HOUR_MS },
    perOrg: { limit: 200, windowMs: DAY_MS },
    noun: 'translations',
  },
  // POST /api/ai/compose-communication — the "What do you want to tell
  // residents?" box (BL-102 A2). Board-only; one model call per Draft click.
  // A board drafts a few messages a week, so these are ceilings against a
  // runaway loop, not a working limit. BL-104: its org ceiling is the shared
  // board AI ceiling (BOARD_AI_POOL), not scaled by band.
  compose: {
    perUser: { limit: 20, windowMs: HOUR_MS },
    perOrg: { limit: 200, windowMs: DAY_MS },
    noun: 'message drafts',
    suffix: 'You can still write the message yourself.',
    orgPool: BOARD_AI_POOL,
    orgNoun: 'board AI drafts',
  },
  // POST /api/ai/violations/draft with `letterKind` — the violation page's
  // "Draft follow-up letter". Board-only; a board drafts a handful of letters
  // per violation, so these are generous ceilings against a runaway loop.
  // New-violation drafts (wizard, /inspect queue) are not limited.
  follow_up_letter: {
    perUser: { limit: 30, windowMs: HOUR_MS },
    perOrg: { limit: 300, windowMs: DAY_MS },
    noun: 'follow-up letter drafts',
  },
  // POST /api/ai/resident-assistant — the resident Ask tab's chat (BL-096).
  // Each message is a multi-step tool loop, so a person gets 20 an hour and
  // 100 a day, and a community 600 a day between all its residents.
  resident_assistant: {
    perUser: { limit: 20, windowMs: HOUR_MS },
    perUserDaily: { limit: 100, windowMs: DAY_MS },
    perOrg: { limit: 600, windowMs: DAY_MS },
    noun: 'assistant messages',
    suffix: 'You can still use Requests to ask the board.',
  },
  // Inbox draft-on-open (BL-101 A3). Board-only, but it fires without a
  // click every time a board member opens a thread that needs a reply, so
  // it draws on a bucket. A busy board answers a few dozen threads a day;
  // the per-org ceiling stops a runaway loop or a spam wave from running
  // the bill up. Over the limit the panel falls back to the manual
  // "Draft a reply" button, which is not limited.
  inbox_autodraft: {
    perUser: { limit: 60, windowMs: HOUR_MS },
    perOrg: { limit: 300, windowMs: DAY_MS },
    noun: 'automatic drafts',
    suffix: 'You can still select Draft a reply.',
  },
  // BL-104 — the board-only AI routes that had no limit: violation drafts
  // (wizard and the /inspect offline queue; follow-up letters keep their own
  // bucket), analyze-violation, the daily digest, parse-document and
  // suggest-fields. Since BL-059 also the bill scan (the "Scan a bill" upload
  // and "Scan as a bill" on an inbox attachment, lib/bill-scan/scan-core.ts).
  // (Not meeting-summary or ask-community: BL-106 buckets below.) One combined per-org
  // daily ceiling, shared with `compose`: 200 on Complete (the base here),
  // 100 on Essentials (BOARD_AI_DAILY). The per-person window is only a
  // runaway guard; an /inspect queue flushing a walkthrough fits under it.
  board_ai: {
    perUser: { limit: 100, windowMs: HOUR_MS },
    perOrg: { limit: 200, windowMs: DAY_MS },
    noun: 'board AI drafts',
    suffix: 'You can still write it yourself.',
    orgPool: BOARD_AI_POOL,
    orgNoun: 'board AI drafts',
  },
  // BL-106 — POST /api/ai/meeting-summary, the meeting wizard's "Summarize
  // transcript". Board-only. A board summarizes one or two meetings a month
  // and may retry a few times, so 10 a day per community (no tier) is far
  // above real use; the per-person window stops a stuck retry loop.
  // BL-108, new plans: 2 a day on Essentials, 3 on Complete, every band.
  meeting_summary: {
    perUser: { limit: 5, windowMs: HOUR_MS },
    perOrg: { limit: 10, windowMs: DAY_MS },
    noun: 'meeting summaries',
    suffix: 'You can still write the minutes yourself.',
    flat: true,
    perOrgByPlanBand: {
      essentials: { '1-50': 2, '51-100': 2, '101-200': 2, '201-400': 2, '401+': 2 },
      complete: { '1-50': 3, '51-100': 3, '101-200': 3, '201-400': 3, '401+': 3 },
    },
  },
  // BL-106 — POST /api/ai/ask-community, the board Copilot and dashboard Ask
  // page. Board-only. Each question is a tool loop (up to 8 model steps of
  // ≤1,500 output tokens, 16 tool runs of which ≤6 docs searches with their
  // own model call), so it is the dearest call per click. 25 a day per
  // community (no tier) and 15 an hour per person cover a busy board's day.
  // BL-108, new plans, by band: Essentials 10 / 15 / 20 / 30, Complete
  // 25 / 40 / 60 / 100 (201–400 and 401+ share the last value).
  ask_community: {
    perUser: { limit: 15, windowMs: HOUR_MS },
    perOrg: { limit: 25, windowMs: DAY_MS },
    noun: 'Copilot questions',
    flat: true,
    perOrgByPlanBand: {
      essentials: { '1-50': 10, '51-100': 15, '101-200': 20, '201-400': 30, '401+': 30 },
      complete: { '1-50': 25, '51-100': 40, '101-200': 60, '201-400': 100, '401+': 100 },
    },
  },
}

// ─── BL-104: per-plan, per-band ceilings ─────────────────────────────

/** Decision §3. Complete 101–200 is 0.54, not the record's 0.55: see the note below. */
export const AI_BAND_MULTIPLIER: Readonly<Record<HoaPlanId, Readonly<Record<BandId, number>>>> = {
  essentials: { '1-50': 0.1, '51-100': 0.18, '101-200': 0.28, '201-400': 0.44, '401+': 0.44 },
  // 0.55 × the ~$115 base worst case + the $5.40 board cap is $68.76, six
  // cents over 30% of $229 ($68.70); the record says the ≤30% rule wins over
  // its estimated multipliers, so this band uses 0.54 ($67.61).
  complete: { '1-50': 0.2, '51-100': 0.3, '101-200': 0.54, '201-400': 0.85, '401+': 0.85 },
}

/** The shared board AI ceiling per day (decision §3). */
export const BOARD_AI_DAILY: Readonly<Record<HoaPlanId, number>> = { essentials: 100, complete: 200 }

/** Floor for any scaled per-org ceiling. */
export const MIN_ORG_DAILY = 5

/** The plan and band an org's AI ceilings come from. */
export interface AiTier {
  plan: HoaPlanId
  band: BandId
}

/**
 * The tier for an org, or null for "today's limits". `plan` is orgs.plan
 * as stored; `doors` its home count.
 *
 * No current customer loses capacity they pay for, so the band multipliers
 * apply only to orgs on the new plans:
 *   - before PRICING_V2: null for every org (today's per-feature limits; the
 *     new board_ai cap applies at its base, the Complete level, 200/day);
 *   - after: 'essentials' / 'complete' get their band; an org with no
 *     subscription is on the trial footing (Essentials, 1–50); a
 *     grandfathered $4.99/door subscription (isLegacyPlan) and any other
 *     pre-flip value (pilot overrides) stay null until the renewal job moves
 *     them to Complete (packages/billing/src/grandfathering.ts), which
 *     rewrites orgs.plan through the webhook.
 */
export function aiTierFor(org: { plan: string | null | undefined; doors: number }, pricingV2: boolean): AiTier | null {
  if (!pricingV2) return null
  if (onTrialFooting(org.plan, pricingV2)) return { plan: 'essentials', band: '1-50' }
  if (org.plan !== 'essentials' && org.plan !== 'complete') return null
  return { plan: effectivePlan(org.plan, pricingV2), band: bandFor(org.doors).id }
}

/** The limits one org gets for one bucket. null tier = the base ceilings (fail open). */
export function aiLimitFor(bucket: AiUsageBucket, tier: AiTier | null): AiRateLimit {
  const base = AI_RATE_LIMITS[bucket]
  if (!tier) return base
  if (base.flat) {
    const planLimit = base.perOrgByPlanBand?.[tier.plan][tier.band]
    return planLimit === undefined ? base : { ...base, perOrg: { ...base.perOrg, limit: planLimit } }
  }
  const limit = base.orgPool
    ? BOARD_AI_DAILY[tier.plan]
    : Math.max(MIN_ORG_DAILY, Math.round(base.perOrg.limit * AI_BAND_MULTIPLIER[tier.plan][tier.band]))
  return { ...base, perOrg: { ...base.perOrg, limit } }
}

/**
 * Estimated model cost per call, USD, from research §3.1 (Groq
 * gpt-oss-120b list price, $0.15/M in, $0.60/M out; token sizes per bucket
 * as listed there). Estimates on unmeasured token use: re-derive from
 * ai_runs at the revisit (decision "Revisit").
 */
export const AI_CALL_COST_ESTIMATE_USD: Readonly<Record<AiUsageBucket, number>> = {
  arc_precheck: 0.0009, // 4k in / 0.5k out
  ask_docs: 0.0009,
  help_ask: 0.0009,
  rewrite: 0.0009,
  follow_up_letter: 0.0009,
  inbox_autodraft: 0.0009,
  translate: 0.00165, // 3k / 2k
  resident_assistant: 0.0024, // 12k / 1k, multi-step tool loop
  compose: 0.0009,
  board_ai: 0.0009, // decision §3: ~$0.0009 per call
  // BL-106, from the code's own budgets (decision amendment). BL-108
  // verified which input cap binds: the route ACCEPTS a transcript up to
  // MAX_DOCUMENT_TEXT (500,000 chars), but packages/ai summarizeMeeting
  // sends the model only the first MEETING_TRANSCRIPT_MAX_CHARS (30,000
  // chars, ~7.5k tokens) + ~0.2k prompt, max_tokens 2,000 →
  // 7.7k × $0.15/M + 2k × $0.60/M ≈ $0.0024 (not the ~$0.02 a 500k-char
  // input would cost). ai-limits.test.ts pins the derivation.
  meeting_summary: 0.0024,
  // community-qa: ≤ 8 steps re-sending a growing context (~9k tokens on
  // average → ~72k in) and ≤ 1,500 out per step (COPILOT_MAX_TOKENS_PER_STEP
  // → 12k) ≈ $0.018, plus ≤ 6 docs searches (COPILOT_TOOL_BUDGET) at
  // ~$0.0009 each ($0.0054) → ≈ $0.0234.
  ask_community: 0.0234,
}

/** Days in the worst-case month. */
export const COST_MONTH_DAYS = 30

/**
 * Worst-case AI cost per month for a tier: every bucket maxed every day,
 * a pooled ceiling counted once at its dearest member's per-call cost.
 * BL-106's flat buckets are included unless `includeFlat: false` (the §3
 * figure alone).
 */
export function worstCaseMonthlyAiCostUsd(tier: AiTier, opts: { includeFlat?: boolean } = {}): number {
  opts = { includeFlat: true, ...opts }
  let perDay = 0
  const pooled = new Set<AiUsageBucket>()
  for (const bucket of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
    const cfg = aiLimitFor(bucket, tier)
    if (cfg.flat && !opts.includeFlat) continue
    if (cfg.orgPool) {
      if (cfg.orgPool.some((b) => pooled.has(b))) continue
      cfg.orgPool.forEach((b) => pooled.add(b))
      perDay += cfg.perOrg.limit * Math.max(...cfg.orgPool.map((b) => AI_CALL_COST_ESTIMATE_USD[b]))
    } else {
      perDay += cfg.perOrg.limit * AI_CALL_COST_ESTIMATE_USD[bucket]
    }
  }
  return perDay * COST_MONTH_DAYS
}

/**
 * BL-106: worst-case monthly cost of the flat buckets alone for a tier
 * (null = the base ceilings: legacy and pre-flip orgs).
 */
export function flatCapsWorstCaseMonthlyUsd(tier: AiTier | null = null): number {
  let perDay = 0
  for (const bucket of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
    const cfg = aiLimitFor(bucket, tier)
    if (cfg.flat) perDay += cfg.perOrg.limit * AI_CALL_COST_ESTIMATE_USD[bucket]
  }
  return perDay * COST_MONTH_DAYS
}

/**
 * 30% of a plan's monthly price at a door count, USD: the hard stop of the
 * BL-108 spend meter for a paying org (the old BL-104 "≤ 30%" ceiling).
 */
export function aiCostCeilingUsd(plan: HoaPlanId, doors: number): number {
  return (monthlyPriceCents(plan, doors) * AI_SPEND_TIER_SHARE.boardStop) / 100
}

// ─── BL-108: heavy-use sizing rule ────────────────────────────────────

/**
 * Decision 2026-10-20-ai-spend-ceiling §1: a heavy-use month uses this
 * share of each bucket's daily ceiling every day. Default 25%; the board_ai
 * pool 30%; the Copilot 50%. Meeting summaries are counted per month
 * instead (HEAVY_USE_MONTHLY_CALLS).
 */
export const HEAVY_USE_DEFAULT_SHARE = 0.25
export const HEAVY_USE_DAILY_SHARE: Readonly<Partial<Record<AiUsageBucket, number>>> = {
  board_ai: 0.3,
  compose: 0.3,
  ask_community: 0.5,
}
/** Buckets sized by a monthly call count in the heavy-use month, not a share. */
export const HEAVY_USE_MONTHLY_CALLS: Readonly<Partial<Record<AiUsageBucket, number>>> = {
  meeting_summary: 8,
}
/** The sizing rule: a heavy-use month is at most this share of the price. */
export const HEAVY_USE_PRICE_SHARE = 0.2

/**
 * BL-108: the heavy-use monthly AI cost for a tier (decision §1). A pooled
 * ceiling is counted once, at its dearest member's per-call cost.
 */
export function heavyUseMonthlyAiCostUsd(tier: AiTier): number {
  let month = 0
  const pooled = new Set<AiUsageBucket>()
  for (const bucket of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
    const cfg = aiLimitFor(bucket, tier)
    const monthlyCalls = HEAVY_USE_MONTHLY_CALLS[bucket]
    if (monthlyCalls !== undefined) {
      month += monthlyCalls * AI_CALL_COST_ESTIMATE_USD[bucket]
      continue
    }
    const share = HEAVY_USE_DAILY_SHARE[bucket] ?? HEAVY_USE_DEFAULT_SHARE
    if (cfg.orgPool) {
      if (cfg.orgPool.some((b) => pooled.has(b))) continue
      cfg.orgPool.forEach((b) => pooled.add(b))
      month += share * cfg.perOrg.limit * Math.max(...cfg.orgPool.map((b) => AI_CALL_COST_ESTIMATE_USD[b])) * COST_MONTH_DAYS
    } else {
      month += share * cfg.perOrg.limit * AI_CALL_COST_ESTIMATE_USD[bucket] * COST_MONTH_DAYS
    }
  }
  return month
}

// ─── BL-108: the monthly org AI spend ceiling ─────────────────────────

/** Shares of the monthly price at which each spend tier starts (decision §2). */
export const AI_SPEND_TIER_SHARE = {
  /** One FYI email to the board. */
  notice: 0.2,
  /** Tier 1: resident-facing and automatic AI stops; board banner + email. */
  residentStop: 0.25,
  /** Tier 2: board AI stops too, until the 1st of the month (UTC). */
  boardStop: 0.3,
} as const

/** Trials (no card): $5 a month of AI in total (decision §2). */
export const TRIAL_AI_SPEND_CEILING_USD = 5

/** Platform-wide: alert the platform admin when a day's AI spend passes this. */
export const PLATFORM_AI_DAILY_ALERT_USD = 50

/** Who a bucket serves, for the spend tiers (decision §2). */
export type AiBucketAudience = 'resident' | 'board'

/**
 * Tier 1 stops the `resident` buckets: resident-facing (ask_docs, help_ask,
 * rewrite, arc_precheck, resident_assistant) and automatic (inbox_autodraft
 * fires on open without a click). Tier 2 stops the `board` buckets too.
 */
export const AI_BUCKET_AUDIENCE: Readonly<Record<AiUsageBucket, AiBucketAudience>> = {
  resident_assistant: 'resident',
  ask_docs: 'resident',
  help_ask: 'resident',
  rewrite: 'resident',
  arc_precheck: 'resident',
  inbox_autodraft: 'resident',
  ask_community: 'board',
  meeting_summary: 'board',
  board_ai: 'board',
  compose: 'board',
  follow_up_letter: 'board',
  translate: 'board',
}

/** What the meter needs to know about an org: its tier, its doors, a trial or not. */
export interface AiBudget {
  tier: AiTier
  /** Doors used for the price (larger of declared and on file). */
  doors: number
  /** On the trial footing (no subscription): the flat $5 ceiling applies. */
  trial: boolean
}

export interface AiSpendThresholds {
  noticeUsd: number
  residentStopUsd: number
  boardStopUsd: number
}

/**
 * The spend at which each tier starts, USD. A paying org: 20 / 25 / 30% of
 * its monthly price. A trial: the $5 total is the hard stop (tier 2) and the
 * earlier tiers keep the same proportions ($3.33 notice, $4.17 tier 1), so a
 * trial board still hears before AI stops.
 */
export function aiSpendThresholdsUsd(budget: AiBudget): AiSpendThresholds {
  const basisUsd = budget.trial
    ? TRIAL_AI_SPEND_CEILING_USD / AI_SPEND_TIER_SHARE.boardStop
    : monthlyPriceCents(budget.tier.plan, budget.doors) / 100
  return {
    noticeUsd: basisUsd * AI_SPEND_TIER_SHARE.notice,
    residentStopUsd: basisUsd * AI_SPEND_TIER_SHARE.residentStop,
    boardStopUsd: basisUsd * AI_SPEND_TIER_SHARE.boardStop,
  }
}

export type AiSpendLevel = 'normal' | 'notice' | 'resident_stop' | 'board_stop'

/** The tier this month's spend is in. */
export function aiSpendLevel(spendUsd: number, t: AiSpendThresholds): AiSpendLevel {
  if (spendUsd >= t.boardStopUsd) return 'board_stop'
  if (spendUsd >= t.residentStopUsd) return 'resident_stop'
  if (spendUsd >= t.noticeUsd) return 'notice'
  return 'normal'
}

/** Whether a spend level refuses a bucket. */
export function spendLevelBlocks(bucket: AiUsageBucket, level: AiSpendLevel): boolean {
  if (level === 'board_stop') return true
  return level === 'resident_stop' && AI_BUCKET_AUDIENCE[bucket] === 'resident'
}

/** Estimated spend from per-bucket call counts × AI_CALL_COST_ESTIMATE_USD. */
export function aiSpendFromCountsUsd(counts: Readonly<Partial<Record<AiUsageBucket, number>>>): number {
  let usd = 0
  for (const bucket of Object.keys(AI_CALL_COST_ESTIMATE_USD) as AiUsageBucket[]) {
    usd += (counts[bucket] ?? 0) * AI_CALL_COST_ESTIMATE_USD[bucket]
  }
  return usd
}

/** Midnight UTC on the 1st of `now`'s month. */
export function monthStartUtc(now: number): Date {
  const d = new Date(now)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

/** Midnight UTC on the 1st of the next month: when a spend stop lifts. */
export function nextMonthStartUtc(now: number): Date {
  const d = new Date(now)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
}

/** "YYYY-MM" (UTC) for a month's notices. */
export function monthKeyUtc(now: number): string {
  return monthStartUtc(now).toISOString().slice(0, 7)
}

/** Every bucket's usage action — the meter's and the platform alert's read set. */
export const AI_USAGE_BUCKETS = Object.keys(AI_CALL_COST_ESTIMATE_USD) as AiUsageBucket[]

/** audit_log.action for one bucket's usage rows. */
export function aiUsageAction(bucket: AiUsageBucket): string {
  return `ai.usage.${bucket}`
}
