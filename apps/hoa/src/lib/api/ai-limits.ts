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
// (ask-community) are NOT in `board_ai`: since BL-106 each has its own flat
// bucket (`meeting_summary`, `ask_community`), outside the decision §3 sum.
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
// `meeting_summary` and `ask_community` are `flat`: the same ceiling at every
// plan and band, never scaled, and kept out of worstCaseMonthlyAiCostUsd so
// the §3 ≤30% check for the BL-104 buckets is unchanged. Their own worst
// case is flatCapsWorstCaseMonthlyUsd().

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
  // suggest-fields. (Not meeting-summary or ask-community: BL-106 buckets
  // below.) One combined per-org
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
  // and may retry a few times, so 10 a day per community is far above real
  // use; the per-person window stops a stuck retry loop. Flat (see above).
  meeting_summary: {
    perUser: { limit: 5, windowMs: HOUR_MS },
    perOrg: { limit: 10, windowMs: DAY_MS },
    noun: 'meeting summaries',
    suffix: 'You can still write the minutes yourself.',
    flat: true,
  },
  // BL-106 — POST /api/ai/ask-community, the board Copilot and dashboard Ask
  // page. Board-only. Each question is a tool loop (up to 8 model steps and
  // 16 tool runs, some of them docs searches with their own model call), so
  // it is the dearest call per click. 25 a day per community and 15 an hour
  // per person cover a busy board's day of questions. Flat (see above).
  ask_community: {
    perUser: { limit: 15, windowMs: HOUR_MS },
    perOrg: { limit: 25, windowMs: DAY_MS },
    noun: 'Copilot questions',
    flat: true,
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
  if (!tier || base.flat) return base
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
  // BL-106, from the code's own budgets (decision amendment):
  // packages/ai summarizeMeeting slices the transcript to 30,000 chars
  // (~7.5k tokens) + ~0.2k prompt, max_tokens 2,000 →
  // 7.7k × $0.15/M + 2k × $0.60/M ≈ $0.0024.
  meeting_summary: 0.0024,
  // community-qa/loop.ts: ≤ 8 steps re-sending a growing context (~9k tokens
  // on average → ~72k in) and ~1k out per step (8k; the loop sets no
  // max_tokens, so this is an assumption) ≈ $0.0156, plus up to 16 tool runs
  // that could all be docs searches at ~$0.0009 each ($0.0144) → ≈ $0.03.
  ask_community: 0.03,
}

/** Days in the worst-case month. */
export const COST_MONTH_DAYS = 30

/**
 * Worst-case AI cost per month for a tier: every bucket maxed every day,
 * a pooled ceiling counted once at its dearest member's per-call cost.
 */
export function worstCaseMonthlyAiCostUsd(tier: AiTier): number {
  let perDay = 0
  const pooled = new Set<AiUsageBucket>()
  for (const bucket of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
    const cfg = aiLimitFor(bucket, tier)
    if (cfg.flat) continue // BL-106: accounted in flatCapsWorstCaseMonthlyUsd
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
 * BL-106: worst-case monthly cost of the flat buckets — every one maxed
 * every day at its per-call estimate. The same at every plan and band.
 */
export function flatCapsWorstCaseMonthlyUsd(): number {
  let perDay = 0
  for (const bucket of Object.keys(AI_RATE_LIMITS) as AiUsageBucket[]) {
    const cfg = AI_RATE_LIMITS[bucket]
    if (cfg.flat) perDay += cfg.perOrg.limit * AI_CALL_COST_ESTIMATE_USD[bucket]
  }
  return perDay * COST_MONTH_DAYS
}

/** The ≤30% rule's ceiling for a plan at a door count (monthly price × 0.30), USD. */
export function aiCostCeilingUsd(plan: HoaPlanId, doors: number): number {
  return (monthlyPriceCents(plan, doors) * 0.3) / 100
}

/** audit_log.action for one bucket's usage rows. */
export function aiUsageAction(bucket: AiUsageBucket): string {
  return `ai.usage.${bucket}`
}
