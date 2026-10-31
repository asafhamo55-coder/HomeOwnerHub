import * as Sentry from '@sentry/nextjs'
import { InngestMiddleware } from 'inngest'

// Reports every failed Inngest function attempt and failed step to Sentry.
//
// Registered once on the client (./client.ts), so all 16 functions are
// covered and a 17th is covered without anyone remembering to add an
// onFailure handler. Before this, a failing job was visible only in the
// Inngest dashboard — nobody was told.
//
// Tags carry the function id, run id, step and attempt; the event payload
// is deliberately NOT attached — it holds residents' mail, addresses and
// ledger rows. A failed attempt that will be retried is a `warning`; the
// last attempt is an `error`, so an alert rule on level:error fires once
// per run that actually gave up rather than once per retry.

export type CaptureFn = (error: unknown, context: Sentry.ExclusiveEventHintOrCaptureContext) => unknown

export type MessageCaptureFn = (message: string, context: Sentry.ExclusiveEventHintOrCaptureContext) => unknown

/**
 * Report-only signal for a job that finished "successfully" but skipped or
 * failed part of its work (the nightly money jobs swallow per-association
 * and per-rule failures so one tenant cannot block the rest). One call per
 * run, after the loop. Never throws and never changes the job's outcome, so
 * Inngest does not retry and nothing is re-posted.
 *
 * `counts` and `ids` only: ids are opaque uuids, and no address, name,
 * amount or message body may be passed.
 */
export function reportJobFailures(
  jobId: string,
  counts: Record<string, number>,
  ids: string[],
  capture: MessageCaptureFn = Sentry.captureMessage,
): void {
  try {
    capture(`${jobId}: ${ids.length} item(s) failed`, {
      level: 'error',
      tags: { source: 'inngest', 'inngest.function': jobId, 'inngest.report_only': 'true' },
      extra: { counts, ids: ids.slice(0, 50), idCount: ids.length },
      fingerprint: ['inngest', jobId, 'partial-failure'],
    })
  } catch {
    // Reporting must never fail a money job.
  }
}

// Inngest's default when a function sets no `retries`: 3 retries, 4 attempts.
const DEFAULT_MAX_ATTEMPTS = 4

export function createFailureReportingMiddleware(capture: CaptureFn = Sentry.captureException) {
  return new InngestMiddleware({
    name: 'Sentry failure reporting',
    init() {
      return {
        onFunctionRun({ fn, ctx }) {
          let attempt = 0
          let maxAttempts = DEFAULT_MAX_ATTEMPTS
          return {
            transformInput({ ctx: full }) {
              attempt = full.attempt
              maxAttempts = full.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
            },
            transformOutput({ result, step }) {
              if (result.error === undefined || result.error === null) return
              const isFinal = attempt + 1 >= maxAttempts
              capture(result.error, {
                level: isFinal ? 'error' : 'warning',
                tags: {
                  source: 'inngest',
                  'inngest.function': fn.id(),
                  'inngest.run_id': ctx.runId,
                  'inngest.attempt': String(attempt),
                  'inngest.final_attempt': String(isFinal),
                  ...(step ? { 'inngest.step': step.displayName ?? step.name ?? 'unknown' } : {}),
                },
                fingerprint: ['inngest', fn.id(), '{{ default }}'],
              })
            },
          }
        },
      }
    },
  })
}
