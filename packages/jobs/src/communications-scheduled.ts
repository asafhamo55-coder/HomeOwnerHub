/**
 * Scheduled communications dispatcher (BL-102 A1), every five minutes.
 *
 * sendCommunication (apps/hoa) stores a "send later" message as
 * status='scheduled' with its recipient rows queued. Until this job existed
 * nothing ever read them, so a scheduled notice silently never went out.
 *
 * Per run:
 *
 *   1. list    communications with status='scheduled' and scheduled_for
 *              <= now (oldest first, capped per run)
 *   2. claim   each with a conditional UPDATE … SET status='sending'
 *              WHERE status='scheduled' … RETURNING id. Postgres applies it
 *              to the row at most once, so exactly one claimant gets the
 *              row back: two overlapping runs, or a Cancel racing the claim,
 *              can never both win. No row back → someone else owns it →
 *              nothing is sent.
 *   3. deliver through the injected app-side function (the same guarded
 *              senders and render path as send-now — BL-004), which
 *              finalises the row as 'sent' / 'failed'.
 *
 * At-most-once by design, like dues reminders: `retries: 0`, because a
 * retried delivery could re-send email that already went out. A claim that
 * crashes before delivering leaves the row in 'sending' for a person to
 * look at — a missed notice is visible on its page; a duplicate one can't
 * be taken back.
 *
 * A factory, like createDuesRemindersJob: the render and the transports live
 * in apps/hoa, which depends on this package.
 *
 * Logs carry communication ids and counts only — never an address, a name
 * or message text.
 */

import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'

/** Most communications one run claims; the next run picks up the rest. */
export const DISPATCH_BATCH = 20

export type ScheduledDeliveryResult =
  | { ok: true; sentCount: number; failedCount: number; skippedCount: number; optedOutCount?: number }
  | { ok: false; error: string }

export interface ScheduledCommunicationsDeps {
  /** Delivers one claimed communication. Must not throw; apps/hoa's
   *  dispatchScheduledCommunication catches everything itself. */
  deliver: (communicationId: string) => Promise<ScheduledDeliveryResult>
}

export interface ScheduledStore {
  /** Ids of scheduled communications due at `nowIso`, oldest first. */
  listDue(nowIso: string, limit: number): Promise<string[]>
  /** The at-most-once claim: true only for the caller that flipped the row
   *  from 'scheduled' to 'sending'. */
  claim(id: string, nowIso: string): Promise<boolean>
  /** Give up on a claimed row the delivery threw on. */
  markFailed(id: string): Promise<void>
}

export interface DispatchLogger {
  info: (msg: string, ...rest: unknown[]) => void
  warn: (msg: string, ...rest: unknown[]) => void
  error: (msg: string, ...rest: unknown[]) => void
}

/** Runs `fn` as a named, memoised step (Inngest's step.run in production). */
export type StepRunner = <T>(name: string, fn: () => Promise<T>) => Promise<T>

export interface DispatchSummary {
  due: number
  claimed: number
  delivered: number
  failed: number
}

type AdminDb = ReturnType<typeof createAdminClient>

export function supabaseScheduledStore(db: AdminDb): ScheduledStore {
  return {
    async listDue(nowIso, limit) {
      const { data, error } = await db
        .from('communications')
        .select('id')
        .eq('status', 'scheduled')
        .lte('scheduled_for', nowIso)
        .is('deleted_at', null)
        .order('scheduled_for', { ascending: true })
        .limit(limit)
      if (error) throw new Error(`[communications-scheduled] list due: ${error.code ?? 'error'}`)
      return ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
    },
    async claim(id, nowIso) {
      const { data, error } = await db
        .from('communications')
        .update({ status: 'sending' })
        .eq('id', id)
        .eq('status', 'scheduled')
        .lte('scheduled_for', nowIso)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`[communications-scheduled] claim: ${error.code ?? 'error'}`)
      return (data ?? []).length === 1
    },
    async markFailed(id) {
      await db.from('communications').update({ status: 'failed' }).eq('id', id).eq('status', 'sending')
    },
  }
}

export async function runScheduledDispatch(
  store: ScheduledStore,
  deps: ScheduledCommunicationsDeps,
  now: Date,
  logger: DispatchLogger,
  step: StepRunner = (_name, fn) => fn(),
): Promise<DispatchSummary> {
  const nowIso = now.toISOString()
  const due = await step('list-due', () => store.listDue(nowIso, DISPATCH_BATCH))
  const summary: DispatchSummary = { due: due.length, claimed: 0, delivered: 0, failed: 0 }

  for (const id of due) {
    const claimed = await step(`claim-${id}`, () => store.claim(id, nowIso))
    if (!claimed) continue
    summary.claimed += 1
    const result = await step(`deliver-${id}`, async (): Promise<ScheduledDeliveryResult> => {
      try {
        return await deps.deliver(id)
      } catch {
        await store.markFailed(id)
        return { ok: false, error: 'delivery threw' }
      }
    })
    if (result.ok) {
      summary.delivered += 1
      logger.info(
        `[communications-scheduled] ${id}: sent ${result.sentCount}, failed ${result.failedCount}, skipped ${result.skippedCount}, opted out ${result.optedOutCount ?? 0}`,
      )
    } else {
      summary.failed += 1
      logger.warn(`[communications-scheduled] ${id}: not delivered`)
    }
  }
  return summary
}

export function createScheduledCommunicationsJob(deps: ScheduledCommunicationsDeps) {
  return inngest.createFunction(
    {
      id: 'communications-scheduled-dispatch',
      name: 'Send scheduled messages',
      concurrency: { limit: 1 },
      retries: 0,
    },
    { cron: '*/5 * * * *' },
    async ({ step, logger }) =>
      runScheduledDispatch(
        supabaseScheduledStore(createAdminClient()),
        deps,
        new Date(),
        logger,
        async (name, fn) => (await step.run(name, fn)) as Awaited<ReturnType<typeof fn>>,
      ),
  )
}
