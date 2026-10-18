// BL-078 — the one place the AI rate limits live (RC-13: shared, not
// per-process). Every model call costs money, so each AI route a resident or
// any member can call over and over draws on two windows:
//
//   perUser  — one person clicking repeatedly (hourly).
//   perOrg   — a whole community's daily ceiling, so many residents (or one
//              person with several logins) cannot run the bill up.
//
// Board-only AI routes (the W37 board review, violation drafting, digests,
// parse/suggest) are not listed: they sit behind requireRouteBoardOrAdmin and
// are not limited here.
//
// The mechanism (lib/api/rate-limit.ts) counts rows in audit_log with
// action `ai.usage.<bucket>`. Changing a number here takes effect on the next
// request; no migration, no cache.

export type AiUsageBucket = 'arc_precheck' | 'ask_docs' | 'help_ask' | 'rewrite'

export interface RateWindow {
  /** Max calls inside the window. */
  limit: number
  /** Sliding window length. */
  windowMs: number
}

export interface AiRateLimit {
  perUser: RateWindow
  perOrg: RateWindow
  /** Plural noun for the 429 message: "10 rules checks an hour". */
  noun: string
  /** Optional sentence appended to the 429 message. */
  suffix?: string
}

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

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
}

/** audit_log.action for one bucket's usage rows. */
export function aiUsageAction(bucket: AiUsageBucket): string {
  return `ai.usage.${bucket}`
}
