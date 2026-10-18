/**
 * The dry run: what Import will do with each row (P4 / PR-02). Pure.
 *
 *   new        a home not on file (or another owner for one, see below)
 *   update     a home already on file ('update' mode)
 *   duplicate  skipped: already on file ('skip' mode), or the same home
 *              and owner as an earlier row in this file
 *   error      not imported, with the reason
 *
 * A later row for the same home that names a DIFFERENT owner is not a
 * duplicate: it adds that owner (several owners per lot), so it takes the
 * home's status and says so.
 *
 * `matches[i]` is what the server found for row i (match-home.ts), read
 * once for the whole file by previewRosterMatches.
 */
import { AMBIGUOUS_HOME_REASON, type ExistingHomeMode } from '../import'
import { normalizeAddress } from '../normalize-address'
import { normalizeUnit, type HomeMatch } from '../match-home'
import type { RosterRow, RosterRowInput } from './rows'

/** Rows per commit call. A home is never split, so a chunk can run a little over. */
export const COMMIT_CHUNK_ROWS = 25

export type RosterMode = Exclude<ExistingHomeMode, 'reuse'>
export type RowStatus = 'new' | 'update' | 'duplicate' | 'error'

export interface ClassifiedRow {
  row: RosterRow
  status: RowStatus
  reason?: string
  /** Row number of the row that brings this home in (itself for the first). Null for errors. */
  homeRow: number | null
  propertyId?: string
}

export interface RosterSummary {
  total: number
  new: number
  update: number
  duplicate: number
  error: number
}

export function homeKey(address: string, unit: string | null): string {
  return `${normalizeAddress(address)}|${normalizeUnit(unit)}`
}

const ownerKey = (r: Pick<RosterRow, 'ownerEmail' | 'ownerName'>): string | null =>
  r.ownerEmail ? `e:${r.ownerEmail.toLowerCase()}` : r.ownerName ? `n:${r.ownerName.toLowerCase()}` : null

export function classifyRoster(rows: readonly RosterRow[], matches: readonly (HomeMatch | undefined)[], mode: RosterMode): ClassifiedRow[] {
  const homes = new Map<string, { head: ClassifiedRow; owners: Set<string> }>()
  return rows.map((row, i): ClassifiedRow => {
    if (row.issue) return { row, status: 'error', reason: row.issue, homeRow: null }
    const m = matches[i] ?? { kind: 'none' }
    if (m.kind === 'ambiguous') return { row, status: 'error', reason: AMBIGUOUS_HOME_REASON, homeRow: null }

    const key = m.kind === 'match' ? `p:${m.propertyId}` : homeKey(row.address, row.unit)
    const owner = ownerKey(row)
    const seen = homes.get(key)
    if (seen) {
      const { head } = seen
      if (!owner || seen.owners.has(owner)) {
        return {
          row,
          status: 'duplicate',
          reason: owner ? `Same home and owner as row ${head.row.row}.` : `Same home as row ${head.row.row}.`,
          homeRow: head.row.row,
        }
      }
      seen.owners.add(owner)
      if (head.status === 'duplicate') return { row, status: 'duplicate', reason: head.reason, homeRow: head.row.row, propertyId: head.propertyId }
      return { row, status: head.status, reason: `Adds another owner to the home in row ${head.row.row}.`, homeRow: head.row.row, propertyId: head.propertyId }
    }

    const head: ClassifiedRow =
      m.kind === 'match'
        ? mode === 'skip'
          ? { row, status: 'duplicate', reason: 'Already on file.', homeRow: row.row, propertyId: m.propertyId }
          : { row, status: 'update', homeRow: row.row, propertyId: m.propertyId }
        : { row, status: 'new', homeRow: row.row }
    homes.set(key, { head, owners: new Set(owner ? [owner] : []) })
    return head
  })
}

export function summarize(rows: readonly { status: RowStatus }[]): RosterSummary {
  const s: RosterSummary = { total: rows.length, new: 0, update: 0, duplicate: 0, error: 0 }
  for (const r of rows) s[r.status] += 1
  return s
}

/** One home to write: its first row, then any rows adding another owner. */
export interface CommitHome<R = RosterRowInput> {
  rows: R[]
}

function toInput(r: RosterRow): RosterRowInput {
  // The balance stays in the browser: an import never posts money.
  const { balance: _balance, issue: _issue, ...input } = r
  return input
}

/** The homes Import will send, in file order. Errors and duplicates stay behind. */
export function planCommit(classified: readonly ClassifiedRow[]): CommitHome[] {
  const homes = new Map<number, CommitHome>()
  for (const c of classified) {
    if (c.status === 'error' || c.status === 'duplicate' || c.homeRow === null) continue
    const home = homes.get(c.homeRow) ?? { rows: [] }
    home.rows.push(toInput(c.row))
    homes.set(c.homeRow, home)
  }
  return [...homes.values()]
}

/** Chunks of at most `maxRows` rows; a home is never split across chunks. */
export function chunkHomes<H extends { rows: unknown[] }>(homes: readonly H[], maxRows: number): H[][] {
  const chunks: H[][] = []
  let current: H[] = []
  let size = 0
  for (const h of homes) {
    if (current.length > 0 && size + h.rows.length > maxRows) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(h)
    size += h.rows.length
  }
  if (current.length) chunks.push(current)
  return chunks
}
