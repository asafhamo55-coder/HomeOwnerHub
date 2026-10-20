// BL-108 — the monthly org AI spend meter and the platform kill switch
// (docs/decisions/2026-10-20-ai-spend-ceiling.md §2).
//
// The meter: this calendar month's (UTC) audit_log `ai.usage.<bucket>` rows
// for one org, counted per bucket (one count-only query per bucket, so no
// row cap applies — RC-9), × AI_CALL_COST_ESTIMATE_USD. The estimates are
// worst-case per call, so the meter over-reads real spend; that is the safe
// direction for a ceiling.
//
// Only orgs with an AiBudget are metered: new-plan orgs (and trials) once
// PRICING_V2 is on. Before the flip loadAiBudget returns null without a
// read, so the meter never runs and nothing changes today.
//
// The 60-second cache (decision: "cached 60 seconds"). RC-13 forbids
// per-process state as a LIMITER, because serverless instances do not share
// memory. This is not a limiter: the per-bucket ceilings (the shared
// audit_log ledger in rate-limit.ts) stay the hard limit on every call. The
// cache only spares the 12 count queries on back-to-back calls; each
// instance re-reads at most once a minute, and the spend tiers are monthly
// budgets where a minute of staleness costs cents. A cold instance reads
// fresh.
//
// No names, emails, questions or amounts of anything but money go into a
// log line: ids, counts and codes.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { ApiRouteError } from './errors'
import {
  AI_USAGE_BUCKETS,
  aiSpendFromCountsUsd,
  aiUsageAction,
  monthKeyUtc,
  monthStartUtc,
  nextMonthStartUtc,
  type AiSpendLevel,
  type AiUsageBucket,
} from './ai-limits'

type Db = SupabaseClient<Database>

export const AI_SPEND_CACHE_MS = 60_000

export interface AiSpendReading {
  /** Estimated USD this month (worst-case per-call estimates). */
  spendUsd: number
  /** Calls per bucket this month. */
  counts: Partial<Record<AiUsageBucket, number>>
  /** "YYYY-MM" (UTC). */
  month: string
}

const spendCache = new Map<string, { at: number; reading: AiSpendReading }>()

/** Tests only: forget every cached reading. */
export function resetAiSpendCache(): void {
  spendCache.clear()
}

/**
 * This month's AI spend for one org. Throws on a read error (the caller
 * decides what a failed meter means — see checkAndRecordAiUsage).
 */
export async function readMonthlyAiSpend(
  db: Db,
  orgId: string,
  now: number,
  opts: { cacheMs?: number } = {},
): Promise<AiSpendReading> {
  const month = monthKeyUtc(now)
  const cacheMs = opts.cacheMs ?? AI_SPEND_CACHE_MS
  const hit = spendCache.get(orgId)
  if (hit && hit.reading.month === month && now - hit.at < cacheMs) return hit.reading

  const since = monthStartUtc(now).toISOString()
  const results = await Promise.all(
    AI_USAGE_BUCKETS.map(async (bucket) => {
      const { count, error } = await db
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('action', aiUsageAction(bucket))
        .gte('created_at', since)
      if (error) throw error
      return [bucket, count ?? 0] as const
    }),
  )
  const counts: Partial<Record<AiUsageBucket, number>> = Object.fromEntries(results)
  const reading = { spendUsd: aiSpendFromCountsUsd(counts), counts, month }
  spendCache.set(orgId, { at: now, reading })
  return reading
}

/** "November 1" — the day a spend stop lifts. */
export function resumeDateLabel(now: number): string {
  return nextMonthStartUtc(now).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** Seconds until the 1st of next month (UTC), at least 1. */
export function secondsUntilNextMonth(now: number): number {
  return Math.max(1, Math.ceil((nextMonthStartUtc(now).getTime() - now) / 1000))
}

// ─── Platform kill switch ─────────────────────────────────────────────

// BL-112: the flag and its parser live in the shared AI client layer
// (packages/ai/src/guard.ts), which also stops every model and embedding
// call at the client — jobs included. Re-exported so BL-108 callers keep
// their import path and there is one definition of "on".
export { AI_KILL_SWITCH_ENV, aiKillSwitchOn } from '@homeowner-portal/ai/guard'

export const AI_PAUSED_MESSAGE =
  'AI features are paused for a short while. Everything else works as usual. Please try again later.'

/** The friendly 503 every AI call gets while the kill switch is on. */
export function aiPausedError(): ApiRouteError {
  return new ApiRouteError('upstream_unavailable', AI_PAUSED_MESSAGE, { reason: 'ai_paused' })
}

// ─── Board-facing copy (banner and emails) ────────────────────────────

/** The dashboard banner: only while AI is paused (tier 1 or 2), else null. */
export function aiSpendBannerCopy(level: AiSpendLevel, now: number): AiSpendNoticeCopy | null {
  return level === 'resident_stop' || level === 'board_stop' ? aiSpendNoticeCopy(level, now) : null
}

export interface AiSpendNoticeCopy {
  title: string
  body: string
}

/** What the board is told at each level. null for 'normal'. */
export function aiSpendNoticeCopy(level: AiSpendLevel, now: number): AiSpendNoticeCopy | null {
  const resume = resumeDateLabel(now)
  switch (level) {
    case 'normal':
      return null
    case 'notice':
      return {
        title: 'Your community has used 20% of this month’s AI budget',
        body: `Nothing changes yet. If AI use keeps growing, resident-facing and automatic AI features pause at 25% of the budget and board AI features at 30%, until ${resume}.`,
      }
    case 'resident_stop':
      return {
        title: `Resident AI features are paused until ${resume}`,
        body: `Your community has used 25% of this month’s AI budget. Ask the Docs, help questions, Rewrite, rules pre-checks, the resident assistant and automatic inbox drafts are paused until ${resume}. Board AI features keep working until the budget reaches 30%.`,
      }
    case 'board_stop':
      return {
        title: `AI features are paused until ${resume}`,
        body: `Your community has used this month’s AI budget. All AI features, including the Copilot and meeting summaries, are paused until ${resume}. Everything else works as usual.`,
      }
  }
}
