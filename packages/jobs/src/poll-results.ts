/**
 * Poll results by email when a poll's end date passes: ONE daily run.
 *
 * Nothing else closes a poll at its end date. A poll stays status 'open' in
 * the table and every screen reads it as finished through effectiveStatus()
 * (apps/hoa/src/lib/polls/rules.ts), so without this job a poll that simply
 * ran out would never get a results email. A board that presses Close sends
 * its own (the Close action), under the same deterministic communications id,
 * so the two can never both send.
 *
 * Per run:
 *   1. list    polls still 'open' whose end passed in the last three days
 *              (three, not one, so a missed or failed run catches up; older
 *              ones are left alone on purpose)
 *   2. deliver each through the injected app-side function. It sends only
 *              when the board chose "Email residents about this poll" at
 *              open, the results are visible to residents, and the results
 *              email has not gone out. Everything else is a cheap no-op.
 *
 * One step.run for the whole batch, one run a day: this stays a single
 * execution on the Inngest Hobby budget however many polls are due.
 *
 * At-most-once, `retries: 0`, like the other resident-facing sends: a retry
 * could email twice if the first attempt died mid-send. The idempotency key
 * is the communications row; a missed email is visible on the poll page.
 *
 * Logs carry poll ids and counts only.
 */

import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'

/**
 * Most emails one run sends. A run reads up to LIST_LIMIT candidates (cheap:
 * polls the board never emailed, or already sent, cost one lookup and no
 * email) but stops after this many that actually go out, so one run can never
 * mass-mail the whole backlog. The next day's run picks up the rest inside
 * the catch-up window.
 */
export const MAX_SENDS_PER_RUN = 10
const LIST_LIMIT = 200

/** Days after the end date during which a missed results email is still sent. */
export const RESULTS_CATCH_UP_DAYS = 3

export interface PollResultsDeps {
  /** Sends one poll's results email if it is due. Must not throw. */
  deliver: (poll: { pollId: string; associationId: string }) => Promise<{ status: string; sent: number }>
}

export interface PollResultsLogger {
  info: (msg: string, ...rest: unknown[]) => void
  warn: (msg: string, ...rest: unknown[]) => void
  error: (msg: string, ...rest: unknown[]) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface DuePoll {
  pollId: string
  associationId: string
}

/** Open polls whose end passed within the catch-up window. */
export async function listDuePolls(db: Db, now: Date): Promise<DuePoll[]> {
  const since = new Date(now.getTime() - RESULTS_CATCH_UP_DAYS * 24 * 3600 * 1000).toISOString()
  const { data, error } = await db
    .from('polls')
    .select('id, association_id')
    .eq('status', 'open')
    .not('closes_at', 'is', null)
    .lte('closes_at', now.toISOString())
    .gte('closes_at', since)
    .order('closes_at', { ascending: true })
    .limit(LIST_LIMIT)
  if (error) throw new Error(`poll-results: list failed (${error.code ?? 'unknown'})`)
  return ((data ?? []) as Array<{ id: string; association_id: string }>).map((r) => ({
    pollId: r.id,
    associationId: r.association_id,
  }))
}

export async function runPollResults(
  db: Db,
  deps: PollResultsDeps,
  now: Date,
  logger: PollResultsLogger,
): Promise<{ due: number; sent: number; skipped: number }> {
  const due = await listDuePolls(db, now)
  let sent = 0
  let skipped = 0
  for (const poll of due) {
    if (sent >= MAX_SENDS_PER_RUN) {
      skipped += 1
      continue
    }
    try {
      const r = await deps.deliver(poll)
      if (r.status === 'sent' || r.status === 'held' || r.status === 'failed') sent += 1
      else skipped += 1
    } catch (err) {
      skipped += 1
      logger.error('[poll-results] deliver threw', { pollId: poll.pollId, error: err instanceof Error ? err.name : 'unknown' })
    }
  }
  logger.info('[poll-results] done', { due: due.length, sent, skipped })
  return { due: due.length, sent, skipped }
}

export function createPollResultsJob(deps: PollResultsDeps) {
  return inngest.createFunction(
    {
      id: 'poll-results-email',
      name: 'Email results of polls that ended',
      concurrency: { limit: 1 },
      retries: 0,
    },
    { cron: 'TZ=America/New_York 0 9 * * *' },
    async ({ step, logger }) =>
      step.run('email-ended-poll-results', () => runPollResults(createAdminClient(), deps, new Date(), logger)),
  )
}
