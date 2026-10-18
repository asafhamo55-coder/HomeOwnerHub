/**
 * Running a large import in chunks, and reporting it (P4 / PR-02). Pure:
 * the browser drives it, calling commitRosterChunk once per chunk, so a
 * 5,000-row file never becomes one long request.
 *
 * A chunk that fails (an error result, or a thrown call: network, timeout)
 * marks only its own rows as errors and the run carries on: the engine is
 * idempotent, so importing the error file again later is safe. Three
 * failed chunks in a row (signed out, the server down) stop the run; the
 * remaining rows are reported as not imported.
 */
import { csvDocument } from '@/lib/csv'
import { chunkHomes, type ClassifiedRow, type CommitHome } from './classify'
import type { ChunkResult, RowResult } from './commit'

export const CHUNK_FAILED_REASON = 'Couldn’t save this row (a connection or server problem). Import the error file again to retry.'
export const STOPPED_REASON = 'Not imported: the import stopped after repeated failures. Import the error file again to retry.'
const MAX_CONSECUTIVE_FAILURES = 3

export interface RunOptions {
  chunkRows: number
  commit: (chunk: CommitHome[]) => Promise<ChunkResult>
  /** Rows done so far, rows in all. */
  onProgress: (done: number, total: number) => void
}

export async function runChunks(homes: readonly CommitHome[], opts: RunOptions): Promise<RowResult[]> {
  const chunks = chunkHomes(homes, opts.chunkRows)
  const total = homes.reduce((n, h) => n + h.rows.length, 0)
  const results: RowResult[] = []
  let done = 0
  let failures = 0
  for (const chunk of chunks) {
    const rows = chunk.flatMap((h) => h.rows.map((r) => r.row))
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      results.push(...rows.map((row) => ({ row, status: 'error' as const, reason: STOPPED_REASON })))
      continue
    }
    let outcome: ChunkResult
    try {
      outcome = await opts.commit(chunk)
    } catch {
      outcome = { ok: false, error: CHUNK_FAILED_REASON }
    }
    if (outcome.ok) {
      failures = 0
      results.push(...outcome.results)
    } else {
      failures += 1
      results.push(...rows.map((row) => ({ row, status: 'error' as const, reason: outcome.ok ? undefined : outcome.error })))
    }
    done += rows.length
    opts.onProgress(done, total)
  }
  return results
}

/** Every row of the file: the server's answer for rows sent, the dry run's for the rest. */
export function finalResults(classified: readonly ClassifiedRow[], committed: readonly RowResult[]): RowResult[] {
  const byRow = new Map(committed.map((r) => [r.row, r]))
  return classified.map(
    (c) => byRow.get(c.row.row) ?? { row: c.row.row, status: c.status, reason: c.reason, propertyId: c.propertyId ?? null },
  )
}

/** The rows that didn't import, with why: fix them and import this file again. */
export function errorRowsCsv(classified: readonly ClassifiedRow[], results: readonly RowResult[]): string {
  const rows = new Map(classified.map((c) => [c.row.row, c.row]))
  return csvDocument(
    ['Row', 'Property address', 'Unit / Lot #', 'Owner name', 'Owner email', 'Owner phone', 'Problem'],
    results
      .filter((r) => r.status === 'error')
      .map((r) => {
        const src = rows.get(r.row)
        return [r.row, src?.address ?? '', src?.unit ?? '', src?.ownerName ?? '', src?.ownerEmail ?? '', src?.ownerPhone ?? '', r.reason ?? '']
      }),
  )
}
