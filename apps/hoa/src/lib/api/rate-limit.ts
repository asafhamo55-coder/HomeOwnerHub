// BL-078 — shared rate limiting for the AI routes residents and members can
// call repeatedly (RC-13: no per-process state).
//
// Mechanism: a usage ledger in the existing `audit_log` table, written with
// the service role. Why audit_log and not ai_runs or a KV:
//   - No Upstash / Vercel KV is configured in this repo, and adding a paid
//     service is out of scope.
//   - ai_runs has no user column, and two of the limited routes (help/ask,
//     rewrite) never write an ai_runs row at all.
//   - audit_log already has org_id, user_id, action, entity_id and
//     created_at, plus an (org_id, created_at DESC) index. No migration.
//
// Each limited call (after auth, role and body validation) reads the two
// windows from lib/api/ai-limits.ts, then appends one row
// `{ action: 'ai.usage.<bucket>', org_id, user_id }` BEFORE the model call,
// so a failed or slow call still counts. A window is full when its
// limit-th newest row is still inside it; Retry-After is when that row ages
// out. One `range(n-1, n-1)` read per window returns at most one row.
//
// Accepted trade-offs:
//   - Check-then-insert is not atomic: a burst of parallel clicks can pass
//     a few calls over the limit. The limit is a cost ceiling, not a quota.
//   - A failed ledger read or write fails OPEN (logged by code): a database
//     hiccup must not take away a resident's ARC form help, and the same
//     outage would make the model call's own audit row fail anyway.
//
// No question text, names or emails go into the row or a log: ids and codes.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, type Database } from '@homeowner-portal/db'
import { ApiRouteError } from './errors'
import { requireRouteUser } from './auth'
import { logRouteFailure } from './log'
import { PRICING_V2, onTrialFooting } from '@homeowner-portal/billing'
import {
  AI_RATE_LIMITS,
  aiLimitFor,
  aiSpendLevel,
  aiSpendThresholdsUsd,
  aiTierFor,
  aiUsageAction,
  spendLevelBlocks,
  type AiBudget,
  type AiRateLimit,
  type AiSpendLevel,
  type AiTier,
  type AiUsageBucket,
  type RateWindow,
} from './ai-limits'
import {
  aiKillSwitchOn,
  aiPausedError,
  readMonthlyAiSpend,
  resumeDateLabel,
  secondsUntilNextMonth,
} from './ai-spend'

type Db = SupabaseClient<Database>

export type RateScope = 'user' | 'org'

export type WindowDecision = { ok: true } | { ok: false; retryAfterSeconds: number }

export type RateDecision =
  | { ok: true }
  /** `window: 'daily'` when the binding user window is the bucket's perUserDaily. */
  | { ok: false; scope: RateScope; retryAfterSeconds: number; window?: 'daily' }

/**
 * One window. `limitThNewestAt` is the created_at (ms) of the limit-th newest
 * usage row inside the window, or null when there are fewer than `limit`.
 */
export function decideWindow(window: RateWindow, limitThNewestAt: number | null, now: number): WindowDecision {
  if (limitThNewestAt === null) return { ok: true }
  const freesAt = limitThNewestAt + window.windowMs
  if (freesAt <= now) return { ok: true }
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((freesAt - now) / 1000)) }
}

/** Same rule over a full list of usage timestamps (ms) — handy for tests and reasoning. */
export function decideFromTimestamps(window: RateWindow, timestamps: number[], now: number): WindowDecision {
  const inWindow = timestamps.filter((t) => t > now - window.windowMs && t <= now).sort((a, b) => b - a)
  return decideWindow(window, inWindow.length >= window.limit ? inWindow[window.limit - 1]! : null, now)
}

/** Both windows; when both are full, the one that frees up later wins. */
export function combineDecisions(user: WindowDecision, org: WindowDecision): RateDecision {
  if (user.ok && org.ok) return { ok: true }
  const u = user.ok ? 0 : user.retryAfterSeconds
  const o = org.ok ? 0 : org.retryAfterSeconds
  return o > u ? { ok: false, scope: 'org', retryAfterSeconds: o } : { ok: false, scope: 'user', retryAfterSeconds: u }
}

/**
 * A person's two windows (hourly, and the optional daily one): the one that
 * frees up later decides, and says whether it was the daily one.
 */
export function combineUserWindows(
  hourly: WindowDecision,
  daily: WindowDecision,
): WindowDecision & { daily?: true } {
  if (daily.ok) return hourly
  if (hourly.ok || daily.retryAfterSeconds > hourly.retryAfterSeconds) return { ...daily, daily: true }
  return hourly
}

/** "a minute" / "about 12 minutes" / "about 5 hours". */
export function describeWait(seconds: number): string {
  if (seconds <= 90) return 'a minute'
  if (seconds < 90 * 60) return `about ${Math.ceil(seconds / 60)} minutes`
  // BL-108: a spend-ceiling wait runs to the 1st of the month.
  if (seconds >= 48 * 3600) return `about ${Math.ceil(seconds / 86400)} days`
  const hours = Math.ceil(seconds / 3600)
  return hours === 1 ? 'about an hour' : `about ${hours} hours`
}

function windowPhrase(windowMs: number): string {
  if (windowMs === 60 * 60 * 1000) return 'an hour'
  if (windowMs === 24 * 60 * 60 * 1000) return 'a day'
  return `per ${Math.round(windowMs / 60000)} minutes`
}

/** The message a person sees on a 429. */
export function rateLimitMessage(
  cfg: AiRateLimit,
  scope: RateScope,
  retryAfterSeconds: number,
  window?: 'daily',
): string {
  const wait = describeWait(retryAfterSeconds)
  const userWindow = window === 'daily' && cfg.perUserDaily ? cfg.perUserDaily : cfg.perUser
  const head =
    scope === 'user'
      ? `You’ve reached the limit of ${userWindow.limit} ${cfg.noun} ${windowPhrase(userWindow.windowMs)}. Try again in ${wait}.`
      : `Your community has reached its limit of ${cfg.perOrg.limit} ${cfg.orgNoun ?? cfg.noun} ${windowPhrase(cfg.perOrg.windowMs)}. Try again in ${wait}.`
  return cfg.suffix ? `${head} ${cfg.suffix}` : head
}

/** Seconds a client is told to wait when a bucket is not on the org's plan (limit 0). */
export const NOT_ON_PLAN_RETRY_SECONDS = 24 * 60 * 60

/**
 * BL-106: the 429 for a bucket whose per-org ceiling is 0 on this org's plan
 * (Copilot on Essentials). No ledger read: nothing can ever fit.
 */
export function notOnPlanError(cfg: AiRateLimit): ApiRouteError {
  const head = `${cfg.noun.charAt(0).toUpperCase()}${cfg.noun.slice(1)} aren’t included in your community’s plan.`
  return new ApiRouteError(
    'rate_limited',
    cfg.suffix ? `${head} ${cfg.suffix}` : head,
    { reason: 'plan_limit', retryAfterSeconds: NOT_ON_PLAN_RETRY_SECONDS },
    { 'Retry-After': String(NOT_ON_PLAN_RETRY_SECONDS) },
  )
}

/** The 429 envelope: code rate_limited, reason, retryAfterSeconds, and a Retry-After header. */
export function rateLimitedError(
  bucket: AiUsageBucket,
  decision: Extract<RateDecision, { ok: false }>,
  /** The org's own limits (aiLimitFor); defaults to the base ceilings. */
  cfg: AiRateLimit = AI_RATE_LIMITS[bucket],
): ApiRouteError {
  return new ApiRouteError(
    'rate_limited',
    rateLimitMessage(cfg, decision.scope, decision.retryAfterSeconds, decision.window),
    { reason: decision.scope === 'user' ? 'user_limit' : 'org_limit', retryAfterSeconds: decision.retryAfterSeconds },
    { 'Retry-After': String(decision.retryAfterSeconds) },
  )
}

/**
 * BL-108: the 429 for a call the monthly spend ceiling refuses.
 *   - Tier 1 (a resident-facing or automatic bucket): the bucket's existing
 *     org-limit message, with the wait running to the 1st (UTC).
 *   - Tier 2 (every bucket): "this month's AI budget", paused until the 1st.
 * reason `spend_ceiling` either way, so a client can tell it from a daily cap.
 */
export function spendCeilingError(cfg: AiRateLimit, level: AiSpendLevel, now: number): ApiRouteError {
  const retryAfterSeconds = secondsUntilNextMonth(now)
  const message =
    level === 'board_stop'
      ? [
          `Your community has used this month’s AI budget, so AI features are paused until ${resumeDateLabel(now)}.`,
          cfg.suffix,
        ]
          .filter(Boolean)
          .join(' ')
      : rateLimitMessage(cfg, 'org', retryAfterSeconds)
  return new ApiRouteError(
    'rate_limited',
    message,
    { reason: 'spend_ceiling', retryAfterSeconds },
    { 'Retry-After': String(retryAfterSeconds) },
  )
}

async function limitThNewest(
  db: Db,
  action: string | readonly string[],
  window: RateWindow,
  scope: { orgId: string; userId?: string },
  now: number,
): Promise<number | null> {
  const base = db.from('audit_log').select('created_at')
  let q = (typeof action === 'string' ? base.eq('action', action) : base.in('action', [...action])).eq('org_id', scope.orgId)
  if (scope.userId) q = q.eq('user_id', scope.userId)
  const { data, error } = await q
    .gte('created_at', new Date(now - window.windowMs).toISOString())
    .order('created_at', { ascending: false })
    .range(window.limit - 1, window.limit - 1)
  if (error) throw error
  const at = data?.[0]?.created_at
  return at ? Date.parse(at) : null
}

/**
 * BL-104: the plan and band an org's AI ceilings come from. Doors = the
 * larger of the declared doors_count and the homes on file, so an org is
 * never put in a smaller band than either says. null = today's limits:
 * every org before PRICING_V2 (no read at all), grandfathered and pre-flip
 * orgs after it (aiTierFor), or an orgs row that can't be read (fail open).
 */
export async function loadAiTier(db: Db, orgId: string, pricingV2: boolean = PRICING_V2): Promise<AiTier | null> {
  return (await loadAiBudget(db, orgId, pricingV2))?.tier ?? null
}

/**
 * BL-108: loadAiTier plus what the spend meter needs (the doors the price
 * comes from, and whether the org is on the trial footing). null exactly
 * when loadAiTier is null: no meter for legacy / pre-flip orgs, and no read
 * at all before PRICING_V2.
 */
export async function loadAiBudget(db: Db, orgId: string, pricingV2: boolean = PRICING_V2): Promise<AiBudget | null> {
  if (!pricingV2) return null
  const [orgRes, countRes] = await Promise.all([
    db.from('orgs').select('plan, doors_count').eq('id', orgId).maybeSingle(),
    db.from('hoa_properties').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
  ])
  if (orgRes.error || !orgRes.data) return null
  const declared = orgRes.data.doors_count ?? 0
  const onFile = countRes.error ? 0 : (countRes.count ?? 0)
  const doors = Math.max(declared, onFile)
  const tier = aiTierFor({ plan: orgRes.data.plan, doors }, pricingV2)
  if (!tier) return null
  return { tier, doors, trial: onTrialFooting(orgRes.data.plan, pricingV2) }
}

/** BL-108: tells the board a spend level was reached (once a month per level). Never throws. */
export type AiSpendNotifier = (orgId: string, level: Exclude<AiSpendLevel, 'normal'>, now: number) => Promise<void>

const defaultSpendNotifier: AiSpendNotifier = async (orgId, level, now) => {
  // Lazy: the email transport and audience helpers load only when a metered
  // org actually crosses a level (never before PRICING_V2).
  const { notifyAiSpendLevel } = await import('./ai-spend-notice')
  await notifyAiSpendLevel(orgId, level, now)
}

/**
 * BL-108: the monthly spend check for a metered org. Throws the spend 429
 * when this month's level refuses the bucket.
 *
 * A meter that cannot be read does NOT block AI: the per-bucket caps still
 * apply on this call (they run next, from the ledger), and the failure is
 * logged with ids only. Blocking every AI call on a meter error would turn a
 * database hiccup into an outage, and the caps alone bound a day's cost.
 */
async function checkSpend(
  bucket: AiUsageBucket,
  cfg: AiRateLimit,
  budget: AiBudget,
  orgId: string,
  db: Db,
  now: number,
  notify: AiSpendNotifier,
): Promise<void> {
  let level: AiSpendLevel
  try {
    const reading = await readMonthlyAiSpend(db, orgId, now)
    level = aiSpendLevel(reading.spendUsd, aiSpendThresholdsUsd(budget))
  } catch (err) {
    logRouteFailure(`ai.spend.read.${bucket}`, err, { orgId })
    return
  }
  if (level !== 'normal') {
    try {
      await notify(orgId, level, now)
    } catch (err) {
      logRouteFailure('ai.spend.notify', err, { orgId, level })
    }
  }
  if (spendLevelBlocks(bucket, level)) throw spendCeilingError(cfg, level, now)
}

export interface UsageGrant {
  /** The audit_log row id of this call's ledger entry; null if the write failed open. */
  usageId: string | null
}

/**
 * Check both windows, then record this call. Throws the 429 ApiRouteError
 * when a window is full. Injectable db and clock for tests.
 */
export async function checkAndRecordAiUsage(
  bucket: AiUsageBucket,
  who: { orgId: string; userId: string },
  /**
   * `tier`: the org's plan and band (BL-104); null = the base ceilings.
   * `budget` (BL-108): tier + doors + trial, which also turns the monthly
   * spend meter on; null = no meter. Both omitted = read from orgs
   * (loadAiBudget). A `tier` alone means "no meter".
   * `notify`: the board notice at a spend level; `env`: for the kill switch.
   */
  deps: {
    db?: Db
    now?: () => number
    tier?: AiTier | null
    budget?: AiBudget | null
    notify?: AiSpendNotifier
    env?: Readonly<Record<string, string | undefined>>
  } = {},
): Promise<UsageGrant> {
  // BL-108 platform kill switch: refuse before any read or ledger write.
  if (aiKillSwitchOn(deps.env)) throw aiPausedError()

  const db = deps.db ?? createAdminClient()
  const now = (deps.now ?? Date.now)()
  const action = aiUsageAction(bucket)
  let cfg: AiRateLimit = AI_RATE_LIMITS[bucket]

  try {
    let tier: AiTier | null = null
    let budget: AiBudget | null = null
    if (deps.budget !== undefined) {
      budget = deps.budget
      tier = budget?.tier ?? null
    } else if (deps.tier !== undefined) tier = deps.tier
    else {
      try {
        budget = await loadAiBudget(db, who.orgId)
        tier = budget?.tier ?? null
      } catch (err) {
        logRouteFailure(`ai.rate-limit.tier.${bucket}`, err, { orgId: who.orgId })
      }
    }
    cfg = aiLimitFor(bucket, tier)
    if (cfg.perOrg.limit <= 0) throw notOnPlanError(cfg)
    if (budget) await checkSpend(bucket, cfg, budget, who.orgId, db, now, deps.notify ?? defaultSpendNotifier)
    const orgActions = cfg.orgPool ? cfg.orgPool.map(aiUsageAction) : action
    const daily = cfg.perUserDaily
    const [userAt, orgAt, userDayAt] = await Promise.all([
      limitThNewest(db, action, cfg.perUser, who, now),
      limitThNewest(db, orgActions, cfg.perOrg, { orgId: who.orgId }, now),
      daily ? limitThNewest(db, action, daily, who, now) : Promise.resolve(null),
    ])
    const user = combineUserWindows(
      decideWindow(cfg.perUser, userAt, now),
      daily ? decideWindow(daily, userDayAt, now) : { ok: true },
    )
    const combined = combineDecisions(user, decideWindow(cfg.perOrg, orgAt, now))
    const decision: RateDecision =
      !combined.ok && combined.scope === 'user' && !user.ok && user.daily ? { ...combined, window: 'daily' } : combined
    if (!decision.ok) throw rateLimitedError(bucket, decision, cfg)
  } catch (err) {
    if (err instanceof ApiRouteError) throw err
    logRouteFailure(`ai.rate-limit.read.${bucket}`, err, { orgId: who.orgId })
    // fail open (see header)
  }

  const { data, error } = await db
    .from('audit_log')
    .insert({ action, org_id: who.orgId, user_id: who.userId, metadata: {} })
    .select('id')
    .single()
  if (error || !data) {
    logRouteFailure(`ai.rate-limit.write.${bucket}`, error ?? new Error('no_row'), { orgId: who.orgId })
    return { usageId: null }
  }
  return { usageId: data.id }
}

/**
 * Route entry: resolve the caller and draw on the bucket. Call it after
 * auth, role and body validation (RC-3) and before the model call.
 */
export async function requireAiQuota(bucket: AiUsageBucket, orgId: string): Promise<UsageGrant & { userId: string }> {
  const { userId } = await requireRouteUser()
  const grant = await checkAndRecordAiUsage(bucket, { orgId, userId })
  return { ...grant, userId }
}

/**
 * Point a usage row at the ai_runs row it produced, so the run can later be
 * proven to be this user's (BL-078 run-id binding). Never throws.
 */
export async function linkAiUsageToRun(usageId: string | null, runId: string, deps: { db?: Db } = {}): Promise<void> {
  if (!usageId) return
  try {
    const db = deps.db ?? createAdminClient()
    const { error } = await db
      .from('audit_log')
      .update({ entity_type: 'ai_run', entity_id: runId })
      .eq('id', usageId)
    if (error) logRouteFailure('ai.rate-limit.link', error, { usageId })
  } catch (err) {
    logRouteFailure('ai.rate-limit.link', err, { usageId })
  }
}
