// Entry points for poll emails.
//
// NOT a 'use server' file: both take an already-authorised caller and must
// never be callable from a browser. Only polls/actions.ts (after
// requireBoardOrAdminForAction) and the Inngest route import them.

import { createAdminClient } from '@homeowner-portal/db'
import type { PollResultRow } from '@homeowner-portal/db/polls-types'
import { appUrl, sendEmailBatch } from '@/lib/email'
import { runPollEmail, type PollEmailDeps, type PollEmailKind, type PollEmailResult } from './run'
import { supabasePollEmailStore, tallyFromTables } from './store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/**
 * `sendEmailBatch` is the app's GUARDED batch sender: every recipient passes
 * the outbound safety guard (BL-004) before Resend is called. Do not replace
 * it with a raw transport.
 */
export const pollEmailDeps: PollEmailDeps = {
  sendEmailBatch,
  emailConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  portalUrl: appUrl,
  now: () => new Date(),
}

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.info(msg, meta ?? {}),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta ?? {}),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta ?? {}),
}

/**
 * The board's choice, awaited so the board is told what happened. `db` is the
 * board member's RLS client; the tally comes from `loadTally` (poll_results()).
 */
export function sendPollEmailNow(
  db: Db,
  loadTally: (pollId: string) => Promise<PollResultRow[]>,
  input: { kind: PollEmailKind; pollId: string; associationId: string },
  deps: PollEmailDeps = pollEmailDeps,
): Promise<PollEmailResult> {
  return runPollEmail(supabasePollEmailStore(db, loadTally), deps, { ...input, trigger: 'board' }, logger)
}

/** The daily job's delivery for a poll whose end date passed. Never throws. */
export async function deliverEndedPollResults(
  poll: { pollId: string; associationId: string },
  deps: PollEmailDeps = pollEmailDeps,
): Promise<PollEmailResult> {
  const db = createAdminClient() as unknown as Db
  return runPollEmail(
    supabasePollEmailStore(db, (id) => tallyFromTables(db, id)),
    deps,
    { kind: 'results', trigger: 'auto', pollId: poll.pollId, associationId: poll.associationId },
    logger,
  )
}
