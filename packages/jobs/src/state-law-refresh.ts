import { createAdminClient } from '@homeowner-portal/db'
import {
  SOURCE_STATES,
  adapterFor,
  applyRemoval,
  applyStatuteWrite,
  applyUnchanged,
  defaultEmbed,
  loadExistingStatutes,
  loadUnsentChanges,
  markChangesSent,
  planStatuteSync,
  repairMissingChunks,
  type EmbedFn,
  type FetchedSections,
  type PendingChange,
  type StateLawAdapter,
  type StatuteChange,
  type StatuteDb,
  type StatuteSyncPlan,
} from '@homeowner-portal/workflows/state-law-ingest'
import { inngest } from './client'

/**
 * Weekly State Law refresh — fetches official statute text, detects
 * changes by content hash, and emits change events.
 *
 * Design: docs/superpowers/specs/2026-08-18-state-law-ingestion-design.md §3,
 * built as sub-project F phase 0 (docs/specs/2026-10-15-sub-project-F-law-to-bylaw.md §3).
 *
 * Per state with a source adapter (FL, CA, TX from their official sites; GA
 * from a vetted snapshot committed to the repo, as Georgia has no fetchable
 * official text — see sources/georgia.ts):
 *   fetch → normalise → SHA-256 per section → diff against state_statutes
 *   - hash unchanged            → last_checked_at only
 *   - hash changed / new        → verbatim body + content_hash, re-chunk,
 *                                 re-embed, fetched_at = now, change logged
 *   - in DB, absent from source → superseded_at, change logged
 * then every not-yet-emitted change-log row becomes an Inngest event:
 *   law/statute.changed  {state, statute_id, code_citation, old_hash, new_hash, change_kind}
 *                        (old_hash null for a new or reinstated citation)
 *   law/statute.removed  {state, statute_id, code_citation, old_hash}
 *
 * No browser and no LLM: a plain HTTP GET per chapter (FL, TX), a few
 * byte-range reads of the bulk archive (CA, ~27 MB, ~26 s measured
 * 2026-10-20), or no request at all (GA), so this runs on Vercel. The fetch is one step and must fit
 * the 60 s function limit; each section write is its own step, so that
 * limit applies to one section's chunk+embed, not to the whole chapter.
 *
 * Triggered weekly, or on demand by `law/refresh.requested` (sent from
 * POST /api/admin/refresh-state-law, optionally narrowed to one state).
 */

/** Non-generic on purpose — see ticket-notifications.ts's step interface. */
export interface StateLawRefreshStep {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>
  sendEvent(id: string, events: StatuteLawEvent[]): Promise<unknown>
}

export interface StateLawRefreshLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export type StatuteLawEvent =
  | {
      id: string
      name: 'law/statute.changed'
      data: {
        state: string
        statute_id: string
        code_citation: string
        change_kind: 'added' | 'changed' | 'reinstated'
        old_hash: string | null
        new_hash: string
      }
    }
  | {
      id: string
      name: 'law/statute.removed'
      data: { state: string; statute_id: string; code_citation: string; old_hash: string }
    }

/**
 * Change-log row → event. The event id is derived from the change-log id,
 * so a re-emission (mark-sent failed after send) is deduplicated by Inngest.
 */
export function toStatuteEvent(c: PendingChange): StatuteLawEvent {
  if (c.change_kind === 'removed') {
    return {
      id: `statute-change-${c.id}`,
      name: 'law/statute.removed',
      data: {
        state: c.state,
        statute_id: c.statute_id,
        code_citation: c.code_citation,
        old_hash: c.old_hash ?? '',
      },
    }
  }
  return {
    id: `statute-change-${c.id}`,
    name: 'law/statute.changed',
    data: {
      state: c.state,
      statute_id: c.statute_id,
      code_citation: c.code_citation,
      change_kind: c.change_kind,
      old_hash: c.change_kind === 'changed' ? c.old_hash : null,
      new_hash: c.new_hash ?? '',
    },
  }
}

export interface StateRefreshReport {
  state: string
  sourceName?: string
  fetched?: number
  added: number
  changed: number
  reinstated: number
  removed: number
  unchanged: number
  backfilledHashes: number
  repairedChunks: number
  error?: string
}

export interface StateLawRefreshResult {
  states: StateRefreshReport[]
  eventsSent: number
}

export interface StateLawRefreshDeps {
  db: StatuteDb
  step: StateLawRefreshStep
  logger: StateLawRefreshLogger
  /** Defaults to the network adapters for SOURCE_STATES. Tests inject
   *  fixture-backed adapters. */
  adapters?: StateLawAdapter[]
  embed?: EmbedFn
  /** Narrow to these states (from law/refresh.requested). */
  onlyStates?: string[]
  now?: () => Date
}

function emptyReport(state: string): StateRefreshReport {
  return {
    state,
    added: 0,
    changed: 0,
    reinstated: 0,
    removed: 0,
    unchanged: 0,
    backfilledHashes: 0,
    repairedChunks: 0,
  }
}

async function refreshState(
  deps: StateLawRefreshDeps,
  adapter: StateLawAdapter,
  embed: EmbedFn,
): Promise<StateRefreshReport> {
  const { db, step } = deps
  const state = adapter.state
  const report = emptyReport(state)

  const fetched = (await step.run(`fetch-${state}`, () => adapter.fetchSections())) as FetchedSections
  report.sourceName = fetched.sourceName
  report.fetched = fetched.records.length

  // `covers` is a function and cannot cross a step boundary, so planning
  // reads the DB and diffs inside one step; the plan itself is plain data.
  const plan = (await step.run(`plan-${state}`, async () =>
    planStatuteSync({
      state,
      sourceName: fetched.sourceName,
      records: fetched.records,
      existing: await loadExistingStatutes(db, state),
      covers: adapter.covers,
    }),
  )) as StatuteSyncPlan

  const opts = { state, sourceName: plan.sourceName, now: deps.now }

  const touched = (await step.run(`unchanged-${state}`, () => applyUnchanged(db, plan.unchanged, opts))) as {
    checked: number
    backfilled: number
  }
  report.unchanged = touched.checked
  report.backfilledHashes = touched.backfilled

  for (const write of plan.writes) {
    const change = (await step.run(`write-${state}-${write.record.code_citation}`, () =>
      applyStatuteWrite(db, write, { ...opts, embed }),
    )) as StatuteChange
    report[change.kind as 'added' | 'changed' | 'reinstated'] += 1
  }

  for (const removal of plan.removals) {
    await step.run(`remove-${state}-${removal.codeCitation}`, () => applyRemoval(db, removal, opts))
    report.removed += 1
  }

  const repaired = (await step.run(`repair-chunks-${state}`, () =>
    repairMissingChunks(
      db,
      state,
      plan.unchanged.map((u) => u.statuteId),
      embed,
    ),
  )) as string[]
  report.repairedChunks = repaired.length

  return report
}

export async function runStateLawRefresh(deps: StateLawRefreshDeps): Promise<StateLawRefreshResult> {
  const { db, step, logger } = deps
  const embed = deps.embed ?? defaultEmbed((m) => logger.warn(m))
  const adapters =
    deps.adapters ??
    SOURCE_STATES.map((s) => adapterFor(s)).filter((a): a is StateLawAdapter => a !== null)
  const selected = deps.onlyStates?.length
    ? adapters.filter((a) => deps.onlyStates!.includes(a.state))
    : adapters

  const states: StateRefreshReport[] = []
  const failures: string[] = []
  for (const adapter of selected) {
    try {
      const report = await refreshState(deps, adapter, embed)
      states.push(report)
      logger.info(
        `[state-law-refresh] ${report.state} (${report.sourceName}): fetched ${report.fetched}, ` +
          `+${report.added} added, ${report.changed} changed, ${report.reinstated} reinstated, ` +
          `${report.removed} removed, ${report.unchanged} unchanged ` +
          `(${report.backfilledHashes} hashes backfilled, ${report.repairedChunks} chunk sets repaired)`,
      )
    } catch (err) {
      // One state's broken source must not stop another state's refresh,
      // nor the outbox below. The run is still failed at the end.
      const message = err instanceof Error ? err.message : String(err)
      failures.push(`${adapter.state}: ${message}`)
      states.push({ ...emptyReport(adapter.state), error: message })
      logger.error(`[state-law-refresh] ${adapter.state} failed: ${message}`)
    }
  }

  // Outbox: emits everything not yet emitted, including changes a previous
  // run wrote but died before announcing.
  const pending = (await step.run('load-outbox', () => loadUnsentChanges(db))) as PendingChange[]
  if (pending.length > 0) {
    await step.sendEvent('emit-statute-events', pending.map(toStatuteEvent))
    await step.run('mark-outbox-sent', () =>
      markChangesSent(
        db,
        pending.map((p) => p.id),
        (deps.now ?? (() => new Date()))(),
      ),
    )
  }

  if (failures.length > 0) {
    throw new Error(`state-law-refresh failed for ${failures.join(' | ')}`)
  }
  return { states, eventsSent: pending.length }
}

export const stateLawRefreshJob = inngest.createFunction(
  {
    id: 'state-law-refresh',
    name: 'State Law Weekly Refresh',
    // A cron run and an admin-requested run must not diff the same rows
    // concurrently.
    concurrency: { limit: 1 },
    retries: 3,
  },
  [{ cron: 'TZ=America/New_York 0 3 * * 1' }, { event: 'law/refresh.requested' }],
  async ({ event, step, logger }) => {
    const requested = (event?.data as { state?: string } | undefined)?.state
    return runStateLawRefresh({
      db: createAdminClient(),
      step: step as unknown as StateLawRefreshStep,
      logger,
      onlyStates: requested ? [requested.toUpperCase()] : undefined,
    })
  },
)

/**
 * Listener for statute-change events.
 *
 * Phase 0 only reports reach: how many associations are governed by the
 * changed state's law (coalesce(governing_law_state, state), F spec §4).
 * Phase 3 replaces this body with the per-association re-judge fan-out.
 * It exists now so the events have a registered consumer from the day they
 * are first sent (tests/integration/contracts/inngest-wiring.test.ts).
 */
export const lawStatuteChangedJob = inngest.createFunction(
  { id: 'law-statute-changed', name: 'Law: statute changed (phase 0 reach report)' },
  [{ event: 'law/statute.changed' }, { event: 'law/statute.removed' }],
  async ({ event, step, logger }) => {
    const data = event.data as { state: string; code_citation: string; statute_id: string }
    const affected = (await step.run('count-governed-associations', async () => {
      const db = createAdminClient()
      const { data: rows, error } = await db
        .from('associations')
        .select('id, state, governing_law_state')
      if (error) throw new Error(`count associations: ${error.message}`)
      return (rows ?? []).filter((a) => (a.governing_law_state ?? a.state) === data.state).length
    })) as number
    logger.info(
      `[law-statute-changed] ${event.name} ${data.code_citation}: ${affected} association(s) governed by ${data.state} law`,
    )
    return { statute_id: data.statute_id, affected_associations: affected }
  },
)
