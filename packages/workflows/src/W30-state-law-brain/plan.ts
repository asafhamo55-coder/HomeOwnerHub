// Pure diff between what an official source publishes and what
// state_statutes holds. No I/O: sync.ts executes the plan.
//
// Ingestion design §3 (docs/superpowers/specs/2026-08-18-state-law-ingestion-design.md):
//   hash unchanged             → touch last_checked_at only
//   hash changed / new         → write verbatim body, re-chunk, log change
//   in DB, absent from source  → set superseded_at
// plus one case the design did not name: a citation that was superseded and
// has reappeared at the source is reinstated (and reported as new).

import { statuteContentHash } from './sources/normalize'
import type { StatuteRecord } from './sources/types'

export interface ExistingStatuteRow {
  id: string
  code_citation: string
  title: string
  category: string | null
  body: string
  source_url: string | null
  source_name: string | null
  content_hash: string | null
  superseded_at: string | null
}

export type ChangeKind = 'added' | 'changed' | 'reinstated' | 'removed'

export interface PlannedWrite {
  kind: 'added' | 'changed' | 'reinstated'
  /** null for `added` — the row does not exist yet. */
  statuteId: string | null
  record: StatuteRecord
  /** Hash of the stored body before this write; null for `added`. */
  oldHash: string | null
  newHash: string
}

export interface PlannedUnchanged {
  statuteId: string
  record: StatuteRecord
  newHash: string
  /** The stored row has no content_hash yet (pre-0062 row whose body
   *  already matches the source) — write it without logging a change. */
  backfillHash: boolean
  /** title / category / source_url / source_name moved without the body
   *  moving (e.g. a new edition year). Refreshed silently. */
  metadataChanged: boolean
}

export interface PlannedRemoval {
  statuteId: string
  codeCitation: string
  oldHash: string
}

export interface StatuteSyncPlan {
  state: string
  sourceName: string
  writes: PlannedWrite[]
  unchanged: PlannedUnchanged[]
  removals: PlannedRemoval[]
}

export interface PlanInput {
  state: string
  sourceName: string
  records: StatuteRecord[]
  existing: ExistingStatuteRow[]
  /** Adapter scope: only covered rows may be superseded. */
  covers: (codeCitation: string) => boolean
}

/**
 * Removing more than this share of the covered, live rows in one pass is
 * treated as a parser or source failure, not as the legislature repealing
 * most of a chapter overnight. Throwing leaves the law as it was; a human
 * looks at the failed run.
 */
export const MAX_REMOVAL_SHARE = 0.25
/** Small sets (a 4-row starter fixture) may lose a few rows legitimately. */
export const REMOVAL_FLOOR = 5

export class SuspiciousSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SuspiciousSourceError'
  }
}

/** content_hash is authoritative once written. For a pre-0062 row with no
 *  hash, the stored body is hashed — it was never normalised, so this is
 *  exactly "would the new body differ from what is stored". */
export function storedHash(row: Pick<ExistingStatuteRow, 'content_hash' | 'body'>): string {
  return row.content_hash ?? statuteContentHash(row.body)
}

export function planStatuteSync(input: PlanInput): StatuteSyncPlan {
  const seen = new Set<string>()
  for (const r of input.records) {
    if (seen.has(r.code_citation)) {
      throw new SuspiciousSourceError(`duplicate citation from source: ${r.code_citation}`)
    }
    seen.add(r.code_citation)
  }

  const byCitation = new Map(input.existing.map((row) => [row.code_citation, row]))
  const writes: PlannedWrite[] = []
  const unchanged: PlannedUnchanged[] = []

  for (const record of input.records) {
    const newHash = statuteContentHash(record.body)
    const row = byCitation.get(record.code_citation)
    if (!row) {
      writes.push({ kind: 'added', statuteId: null, record, oldHash: null, newHash })
      continue
    }
    const oldHash = storedHash(row)
    if (row.superseded_at !== null) {
      writes.push({ kind: 'reinstated', statuteId: row.id, record, oldHash, newHash })
    } else if (oldHash !== newHash) {
      writes.push({ kind: 'changed', statuteId: row.id, record, oldHash, newHash })
    } else {
      unchanged.push({
        statuteId: row.id,
        record,
        newHash,
        backfillHash: row.content_hash === null,
        metadataChanged:
          row.title !== record.title ||
          row.category !== record.category ||
          row.source_url !== record.source_url ||
          row.source_name !== input.sourceName,
      })
    }
  }

  const covered = input.existing.filter(
    (row) => row.superseded_at === null && input.covers(row.code_citation),
  )
  const removals: PlannedRemoval[] = covered
    .filter((row) => !seen.has(row.code_citation))
    .map((row) => ({ statuteId: row.id, codeCitation: row.code_citation, oldHash: storedHash(row) }))

  const limit = Math.max(REMOVAL_FLOOR, Math.floor(covered.length * MAX_REMOVAL_SHARE))
  if (removals.length > limit) {
    throw new SuspiciousSourceError(
      `${input.state}: source omits ${removals.length} of ${covered.length} live sections ` +
        `(limit ${limit}); refusing to supersede — check the adapter/parser`,
    )
  }

  return { state: input.state, sourceName: input.sourceName, writes, unchanged, removals }
}
