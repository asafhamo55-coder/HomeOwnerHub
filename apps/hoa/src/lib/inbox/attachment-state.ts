/**
 * BL-017 — what the thread view says about one inbox attachment, and
 * whether a board member can retry it.
 *
 * Shared by the thread view (MessageThread), the board-only retry action
 * (attachment-retry.ts) and the fetch job
 * (packages/jobs/src/mailbox-attachments.ts), so the three agree on what
 * "retryable" means and on the attempt budget.
 *
 * No migration: the state lives in the existing `fetch_status`,
 * `fetch_attempts`, `fetch_error` and `created_at` columns.
 */

/** Automatic attempts before an attachment is marked 'failed'. */
export const MAX_FETCH_ATTEMPTS = 4

/**
 * Earliest time attempt N may run, measured from the row's `created_at`
 * (index = attempts already made). There is no "last attempted at"
 * column and BL-017 ships without a migration, so the backoff is anchored
 * to when the attachment was queued: a fresh attachment is tried at once,
 * then no sooner than 5 minutes, 30 minutes and 2 hours after it arrived.
 * Combined with the 15-minute cron, a short Gmail blip costs one attempt,
 * not the whole budget.
 *
 * After a manual Retry the attempts reset to 0 and `created_at` is long
 * past, so the retried attempts run on consecutive cron ticks (still at
 * most MAX_FETCH_ATTEMPTS of them, 15 minutes apart). That is deliberate:
 * a person asked for it now.
 */
export const RETRY_DELAYS_MS = [0, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as const

/** Written by the job when the account is disconnected (see job). */
export const DISCONNECTED_FETCH_ERROR =
  'Mailbox was disconnected before this attachment was downloaded.'
/** Written by the job when the message/thread row or Gmail id is gone. */
export const MISSING_SOURCE_FETCH_ERROR = 'Missing message, thread, or Gmail attachment id.'

/**
 * Failures a retry cannot fix: the file is over the size cap, or Gmail
 * never gave us an id to fetch it by. (ingest.ts writes the first two.)
 * Everything else — network errors, Gmail 5xx, an expired token, a
 * mailbox that was disconnected and has since been reconnected — can
 * succeed on another try.
 */
const PERMANENT_ERRORS: Array<(error: string) => boolean> = [
  (e) => /^Exceeds \d+ byte limit\.$/.test(e),
  (e) => e.startsWith('No Gmail attachment id'),
  (e) => e === MISSING_SOURCE_FETCH_ERROR,
]

export function isRetryableFetchError(fetchError: string | null | undefined): boolean {
  if (!fetchError) return true
  return !PERMANENT_ERRORS.some((test) => test(fetchError))
}

export type AttachmentView =
  | { kind: 'stored' }
  | { kind: 'downloading' }
  /** Pending again after a failed attempt — the job will try again. */
  | { kind: 'retrying'; attempt: number; of: number }
  /** Gave up; a board member can retry. */
  | { kind: 'failed'; canRetry: true; reason: 'disconnected' | 'error' }
  /** Gave up for good; only Gmail has it. */
  | { kind: 'failed'; canRetry: false; reason: 'too_large' | 'unavailable' }

export function attachmentView(input: {
  fetchStatus: string
  fetchError?: string | null
  fetchAttempts?: number | null
}): AttachmentView {
  const attempts = input.fetchAttempts ?? 0
  if (input.fetchStatus === 'stored') return { kind: 'stored' }
  if (input.fetchStatus === 'pending') {
    return attempts > 0
      ? { kind: 'retrying', attempt: Math.min(attempts + 1, MAX_FETCH_ATTEMPTS), of: MAX_FETCH_ATTEMPTS }
      : { kind: 'downloading' }
  }
  const error = input.fetchError ?? null
  if (!isRetryableFetchError(error)) {
    return {
      kind: 'failed',
      canRetry: false,
      reason: error && error.startsWith('Exceeds ') ? 'too_large' : 'unavailable',
    }
  }
  return {
    kind: 'failed',
    canRetry: true,
    reason: error === DISCONNECTED_FETCH_ERROR ? 'disconnected' : 'error',
  }
}

/**
 * Whether a pending row has waited long enough for its next attempt.
 * Mirrors `dueForAttemptFilter` (the SQL form the job uses); kept as a
 * function so the schedule itself is unit-testable.
 */
export function isDueForAttempt(
  row: { fetch_attempts: number; created_at: string },
  now: Date,
): boolean {
  if (row.fetch_attempts >= MAX_FETCH_ATTEMPTS) return false
  const delay = RETRY_DELAYS_MS[row.fetch_attempts] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
  return new Date(row.created_at).getTime() + delay <= now.getTime()
}

/**
 * PostgREST `or=` filter selecting rows whose next attempt is due:
 * `fetch_attempts = 0`, or `fetch_attempts = k AND created_at <= now - delay[k]`.
 */
export function dueForAttemptFilter(now: Date): string {
  const clauses: string[] = []
  for (let k = 0; k < MAX_FETCH_ATTEMPTS; k++) {
    const delay = RETRY_DELAYS_MS[k] ?? 0
    if (delay === 0) {
      clauses.push(`fetch_attempts.eq.${k}`)
    } else {
      const cutoff = new Date(now.getTime() - delay).toISOString()
      clauses.push(`and(fetch_attempts.eq.${k},created_at.lte."${cutoff}")`)
    }
  }
  return clauses.join(',')
}
