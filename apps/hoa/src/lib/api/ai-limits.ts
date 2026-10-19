// BL-078 — the one place the AI rate limits live (RC-13: shared, not
// per-process). Every model call costs money, so each AI route a resident or
// any member can call over and over draws on two windows:
//
//   perUser  — one person clicking repeatedly (hourly).
//   perOrg   — a whole community's daily ceiling, so many residents (or one
//              person with several logins) cannot run the bill up.
//
// Board-only AI routes (the W37 board review, violation drafting, digests,
// parse/suggest) are not listed, except the BL-025 translation and the
// follow-up letters below: they sit behind requireRouteBoardOrAdmin and
// are not limited here. Violation drafting from the wizard and the /inspect
// offline queue stays unlimited; only follow-up letters draw on a bucket.
//
// The mechanism (lib/api/rate-limit.ts) counts rows in audit_log with
// action `ai.usage.<bucket>`. Changing a number here takes effect on the next
// request; no migration, no cache.

export type AiUsageBucket =
  | 'arc_precheck'
  | 'ask_docs'
  | 'help_ask'
  | 'rewrite'
  | 'translate'
  | 'follow_up_letter'
  | 'resident_assistant'

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
  // POST /api/ai/translate-communication — "Add Spanish version" in the
  // communications wizard (BL-025). Board-only, but each click is a long
  // model call, so it draws on the shared ledger like the routes above.
  translate: {
    perUser: { limit: 20, windowMs: HOUR_MS },
    perOrg: { limit: 200, windowMs: DAY_MS },
    noun: 'translations',
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
}

/** audit_log.action for one bucket's usage rows. */
export function aiUsageAction(bucket: AiUsageBucket): string {
  return `ai.usage.${bucket}`
}
