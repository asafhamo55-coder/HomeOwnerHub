import { describe, expect, it, vi } from 'vitest'
import { CHUNK_FAILED_REASON, STOPPED_REASON, errorRowsCsv, finalResults, runChunks } from './run'
import type { ClassifiedRow, CommitHome } from './classify'
import type { RosterRow, RosterRowInput } from './rows'
import type { ChunkResult } from './commit'

// Synthetic rows only.
const input = (n: number, address = `${n} Test Way`): RosterRowInput => ({
  row: n,
  address,
  unit: null,
  city: null,
  state: null,
  zip: null,
  ownerName: null,
  ownerEmail: null,
  ownerPhone: null,
  mailingAddress: null,
  tenure: null,
})
const homes = (...ns: number[]): CommitHome[] => ns.map((n) => ({ rows: [input(n)] }))
const allNew = async (chunk: CommitHome[]): Promise<ChunkResult> => ({ ok: true, results: chunk.flatMap((h) => h.rows.map((r) => ({ row: r.row, status: 'new' as const }))) })

describe('runChunks (large files in chunks)', () => {
  it('commits chunk by chunk and reports progress after each', async () => {
    const progress = vi.fn()
    const commit = vi.fn(allNew)
    const results = await runChunks(homes(2, 3, 4, 5, 6), { chunkRows: 2, commit, onProgress: progress })
    expect(commit).toHaveBeenCalledTimes(3)
    expect(progress.mock.calls).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ])
    expect(results.map((r) => r.status)).toEqual(['new', 'new', 'new', 'new', 'new'])
  })

  it('a chunk failing in the middle marks only its rows, and the rest still import', async () => {
    const commit = vi.fn(async (chunk: CommitHome[]): Promise<ChunkResult> => {
      if (chunk[0].rows[0].row === 4) return { ok: false, error: 'Couldn’t save these rows. Try again.' }
      return allNew(chunk)
    })
    const results = await runChunks(homes(2, 3, 4, 5, 6, 7), { chunkRows: 2, commit, onProgress: () => {} })
    expect(results.map((r) => [r.row, r.status])).toEqual([
      [2, 'new'],
      [3, 'new'],
      [4, 'error'],
      [5, 'error'],
      [6, 'new'],
      [7, 'new'],
    ])
    // The server's own (user-facing) message explains the failed rows.
    expect(results[2].reason).toBe('Couldn’t save these rows. Try again.')
  })

  it('a thrown chunk (network, timeout) counts as a failed chunk', async () => {
    const commit = vi.fn(async (chunk: CommitHome[]) => {
      if (chunk[0].rows[0].row === 2) throw new Error('fetch failed')
      return allNew(chunk)
    })
    const results = await runChunks(homes(2, 3), { chunkRows: 1, commit, onProgress: () => {} })
    expect(results.map((r) => r.status)).toEqual(['error', 'new'])
    expect(results[0].reason).toBe(CHUNK_FAILED_REASON)
  })

  it('stops after three failed chunks in a row and marks the rest not imported', async () => {
    const commit = vi.fn(async (): Promise<ChunkResult> => ({ ok: false, error: 'You are not signed in to an organization.' }))
    const results = await runChunks(homes(2, 3, 4, 5, 6), { chunkRows: 1, commit, onProgress: () => {} })
    expect(commit).toHaveBeenCalledTimes(3)
    expect(results.map((r) => r.reason)).toEqual([
      'You are not signed in to an organization.',
      'You are not signed in to an organization.',
      'You are not signed in to an organization.',
      STOPPED_REASON,
      STOPPED_REASON,
    ])
  })
})

const full = (n: number, extra: Partial<RosterRow> = {}): RosterRow => ({ ...input(n), balance: null, issue: null, ...extra })

describe('finalResults + errorRowsCsv', () => {
  const classified: ClassifiedRow[] = [
    { row: full(2), status: 'new', homeRow: 2 },
    { row: full(3), status: 'duplicate', reason: 'Already on file.', homeRow: 3 },
    { row: full(4, { address: '', issue: 'The address is missing.' }), status: 'error', reason: 'The address is missing.', homeRow: null },
    { row: full(5, { ownerEmail: 'five@example.test', ownerName: '=cmd' }), status: 'new', homeRow: 5 },
  ]
  const committed = [
    { row: 2, status: 'new' as const, propertyId: 'p2' },
    { row: 5, status: 'error' as const, reason: 'Couldn’t save this home. Try again.' },
  ]

  it('merges what was sent with what the dry run held back, in file order', () => {
    expect(finalResults(classified, committed).map((r) => [r.row, r.status, r.reason ?? null])).toEqual([
      [2, 'new', null],
      [3, 'duplicate', 'Already on file.'],
      [4, 'error', 'The address is missing.'],
      [5, 'error', 'Couldn’t save this home. Try again.'],
    ])
  })

  it('the error file lists only error rows, through lib/csv (formula-guarded)', () => {
    const csv = errorRowsCsv(classified, finalResults(classified, committed))
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n')
    expect(lines[0]).toBe('Row,Property address,Unit / Lot #,Owner name,Owner email,Owner phone,Problem')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toMatch(/^4,,/)
    expect(lines[2]).toContain("'=cmd") // a cell that would run as a formula is neutralised
  })
})
