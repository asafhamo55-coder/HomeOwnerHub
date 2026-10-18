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
import { AI_RATE_LIMITS, aiUsageAction, type AiRateLimit, type AiUsageBucket, type RateWindow } from './ai-limits'

type Db = SupabaseClient<Database>

export type RateScope = 'user' | 'org'

export type WindowDecision = { ok: true } | { ok: false; retryAfterSeconds: number }

export type RateDecision = { ok: true } | { ok: false; scope: RateScope; retryAfterSeconds: number }

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

/** "a minute" / "about 12 minutes" / "about 5 hours". */
export function describeWait(seconds: number): string {
  if (seconds <= 90) return 'a minute'
  if (seconds < 90 * 60) return `about ${Math.ceil(seconds / 60)} minutes`
  const hours = Math.ceil(seconds / 3600)
  return hours === 1 ? 'about an hour' : `about ${hours} hours`
}

function windowPhrase(windowMs: number): string {
  if (windowMs === 60 * 60 * 1000) return 'an hour'
  if (windowMs === 24 * 60 * 60 * 1000) return 'a day'
  return `per ${Math.round(windowMs / 60000)} minutes`
}

/** The message a person sees on a 429. */
export function rateLimitMessage(cfg: AiRateLimit, scope: RateScope, retryAfterSeconds: number): string {
  const wait = describeWait(retryAfterSeconds)
  const head =
    scope === 'user'
      ? `You’ve reached the limit of ${cfg.perUser.limit} ${cfg.noun} ${windowPhrase(cfg.perUser.windowMs)}. Try again in ${wait}.`
      : `Your community has reached its limit of ${cfg.perOrg.limit} ${cfg.noun} ${windowPhrase(cfg.perOrg.windowMs)}. Try again in ${wait}.`
  return cfg.suffix ? `${head} ${cfg.suffix}` : head
}

/** The 429 envelope: code rate_limited, reason, retryAfterSeconds, and a Retry-After header. */
export function rateLimitedError(bucket: AiUsageBucket, decision: Extract<RateDecision, { ok: false }>): ApiRouteError {
  const cfg = AI_RATE_LIMITS[bucket]
  return new ApiRouteError(
    'rate_limited',
    rateLimitMessage(cfg, decision.scope, decision.retryAfterSeconds),
    { reason: decision.scope === 'user' ? 'user_limit' : 'org_limit', retryAfterSeconds: decision.retryAfterSeconds },
    { 'Retry-After': String(decision.retryAfterSeconds) },
  )
}

async function limitThNewest(
  db: Db,
  action: string,
  window: RateWindow,
  scope: { orgId: string; userId?: string },
  now: number,
): Promise<number | null> {
  let q = db
    .from('audit_log')
    .select('created_at')
    .eq('action', action)
    .eq('org_id', scope.orgId)
  if (scope.userId) q = q.eq('user_id', scope.userId)
  const { data, error } = await q
    .gte('created_at', new Date(now - window.windowMs).toISOString())
    .order('created_at', { ascending: false })
    .range(window.limit - 1, window.limit - 1)
  if (error) throw error
  const at = data?.[0]?.created_at
  return at ? Date.parse(at) : null
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
  deps: { db?: Db; now?: () => number } = {},
): Promise<UsageGrant> {
  const db = deps.db ?? createAdminClient()
  const now = (deps.now ?? Date.now)()
  const cfg = AI_RATE_LIMITS[bucket]
  const action = aiUsageAction(bucket)

  try {
    const [userAt, orgAt] = await Promise.all([
      limitThNewest(db, action, cfg.perUser, who, now),
      limitThNewest(db, action, cfg.perOrg, { orgId: who.orgId }, now),
    ])
    const decision = combineDecisions(decideWindow(cfg.perUser, userAt, now), decideWindow(cfg.perOrg, orgAt, now))
    if (!decision.ok) throw rateLimitedError(bucket, decision)
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
