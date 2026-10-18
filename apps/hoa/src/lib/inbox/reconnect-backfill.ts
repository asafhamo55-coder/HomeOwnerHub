/**
 * BL-018 — what a (re)connect should ask the backfill job to do.
 *
 * Before this, every OAuth callback fired a full 12-month
 * `mailbox/backfill.requested`. Reconnecting a mailbox whose history was
 * already imported reset the "Importing history… N of ~M" counter and
 * re-walked a year of Gmail (harmless to the data — ingest is idempotent —
 * but slow, quota-hungry and alarming to watch).
 *
 * Backfill state already lives on mailbox_accounts (no migration):
 *   - `backfill_status` 'done' means the chain reached the end;
 *   - `backfill_progress.scope` (written by mailbox-backfill.ts from this
 *     change on) records the scope that import ran under;
 *   - `sync_cursor` (Gmail history id) and `last_synced_at` say where the
 *     incremental sync stopped.
 *
 * Decision:
 *   - not 'done' (pending / failed / running — including a WEDGED
 *     running chain): full backfill, exactly as before, so reconnecting
 *     stays the recovery path for a broken import.
 *   - 'done' but the scope changed since: full backfill under the new scope.
 *     A row completed before the stamp existed has no stamp; it is treated
 *     as unchanged (the scope picker never re-ran a backfill either).
 *   - 'done', last synced within HISTORY_SAFE_DAYS: skip. The 2-minute
 *     sync resumes from `sync_cursor`; if that history id has expired it
 *     falls back to its 7-day dated window, which covers the gap.
 *   - 'done', longer gap: a BOUNDED backfill from a day before the last
 *     sync (capped at the 12-month horizon) — the history id has almost
 *     certainly expired and the sync's 7-day fallback would leave a hole.
 *   - 'done' with no sync point to measure from: full.
 */

export const BACKFILL_MONTHS = 12
/** Gmail keeps history for at least about a week; stay inside it. */
export const HISTORY_SAFE_DAYS = 6
const DAY_MS = 86_400_000

export interface ConnectBackfillAccount {
  backfill_status: string | null
  backfill_progress: unknown
  scope_mode: string
  scope_value: string | null
  last_synced_at: string | null
  sync_cursor: string | null
}

export type ConnectBackfillPlan =
  | { kind: 'full'; reason: 'not_complete' | 'scope_changed' | 'no_sync_point' | 'unknown' }
  | { kind: 'skip'; reason: 'incremental' }
  | { kind: 'bounded'; reason: 'long_gap'; afterDate: string }

/** The scope a backfill ran under, as stored in `backfill_progress.scope`. */
export function backfillScopeStamp(scopeMode: string, scopeValue: string | null): string {
  return `${scopeMode}:${scopeValue ?? ''}`
}

/** Gmail search `after:` date (YYYY/MM/DD, UTC). */
export function gmailAfterDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '/')
}

export function planConnectBackfill(account: ConnectBackfillAccount, now: Date): ConnectBackfillPlan {
  if (account.backfill_status !== 'done') return { kind: 'full', reason: 'not_complete' }

  const progress =
    account.backfill_progress && typeof account.backfill_progress === 'object'
      ? (account.backfill_progress as Record<string, unknown>)
      : {}
  const stamp = typeof progress.scope === 'string' ? progress.scope : null
  if (stamp !== null && stamp !== backfillScopeStamp(account.scope_mode, account.scope_value)) {
    return { kind: 'full', reason: 'scope_changed' }
  }

  const lastSynced = account.last_synced_at ? new Date(account.last_synced_at) : null
  if (!lastSynced || Number.isNaN(lastSynced.getTime()) || !account.sync_cursor) {
    return { kind: 'full', reason: 'no_sync_point' }
  }

  const gapMs = now.getTime() - lastSynced.getTime()
  if (gapMs <= HISTORY_SAFE_DAYS * DAY_MS) return { kind: 'skip', reason: 'incremental' }

  const horizon = new Date(now)
  horizon.setUTCMonth(horizon.getUTCMonth() - BACKFILL_MONTHS)
  const from = new Date(Math.max(lastSynced.getTime() - DAY_MS, horizon.getTime()))
  return { kind: 'bounded', reason: 'long_gap', afterDate: gmailAfterDate(from) }
}
