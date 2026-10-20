/**
 * BL-060 leftover: ⌘K latency, measured.
 *
 * Seeds a demo-sized org (a board, ~150 lots with owners, violations,
 * tickets, ARC requests, vendors, documents and meetings) in CI's
 * throwaway Supabase, then runs the palette's real search
 * (lib/search/records.ts) as a signed-in board member — the RLS-bound
 * client the route uses, never the service role — and records p50/p95.
 *
 * What it measures: the search itself (every PostgREST round-trip and
 * the RLS predicates), not the route's auth gate or Next overhead; the
 * route reports those phases separately through Server-Timing.
 *
 * The budget is deliberately generous (p95 ≤ 1500 ms): a CI runner is
 * noisy, and this is here to catch a regression by an order of magnitude
 * (a lost limit, a sequential round-trip, a missing index on a hot
 * filter), not to gate on milliseconds. The numbers are printed to the
 * CI log either way. The log line carries counts and milliseconds only —
 * never a query term, an id or a row value.
 *
 * CI only: never run this against anything but the local/CI stack
 * (setup/env.ts refuses non-loopback URLs).
 */
import { performance } from 'node:perf_hooks'
import { beforeAll, describe, expect, it } from 'vitest'
import { searchRecords, type SearchClient } from '../../../apps/hoa/src/lib/search/records'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const LOTS = 150
const VIOLATIONS = 120
const TICKETS = 40
const ARCS = 40
const VENDORS = 30
const DOCUMENTS = 25
const MEETINGS = 12

/** Measured searches (after warm-up), spread across the terms below. */
const RUNS = 40
const WARMUP = 3
const P95_BUDGET_MS = 1500

// Typical palette input: an owner's name, a street, a violation type, a
// vendor, a partial word, and a miss (which still runs every query).
const TERMS = ['owner 1', 'maple', 'trash', 'landscap', 'unit', 'zzqx-no-match']

const STREETS = ['Maple', 'Oak', 'Cedar', 'Birch', 'Willow']
const VIOLATION_TYPES = ['Trash bins', 'Parking', 'Landscaping', 'Paint', 'Noise']

interface Seeded {
  org: OrgFixture
  board: TestUser
}

async function check<T>(p: PromiseLike<{ data: T | null; error: { code?: string } | null }>, label: string) {
  const { data, error } = await p
  if (error || !data) throw new Error(`seed ${label}: ${error?.code ?? 'no data'}`)
  return data
}

async function seed(): Promise<Seeded> {
  const db = adminDb()
  const org = await makeOrg()
  const board = await mintUser(org, 'board')
  const base = { organization_id: org.orgId }

  // Fictional owners on reserved addresses; nothing here is real data.
  const props = await check(
    db
      .from('hoa_properties')
      .insert(
        Array.from({ length: LOTS }, (_, i) => ({
          org_id: org.orgId,
          address: `${100 + i} ${STREETS[i % STREETS.length]} Way`,
          unit_number: i % 4 === 0 ? `${(i % 9) + 1}B` : null,
          owner_name: `Owner ${i}`,
          owner_email: `owner-${i}@example.test`,
        })),
      )
      .select('id'),
    'hoa_properties',
  )
  const propIds = props.map((p) => p.id)

  const units = await check(
    db
      .from('units')
      .insert(
        propIds.map((pid, i) => ({
          ...base,
          association_id: org.associationId,
          address_line1: `${100 + i} ${STREETS[i % STREETS.length]} Way`,
          legacy_hoa_property_id: pid,
        })),
      )
      .select('id'),
    'units',
  )
  const unitIds = units.map((u) => u.id)

  await check(
    db
      .from('hoa_violations')
      .insert(
        Array.from({ length: VIOLATIONS }, (_, i) => ({
          org_id: org.orgId,
          property_id: propIds[i % propIds.length],
          violation_type: VIOLATION_TYPES[i % VIOLATION_TYPES.length],
          description: `Notice ${i}`,
          status: 'open',
        })),
      )
      .select('id'),
    'hoa_violations',
  )

  await check(
    db
      .from('tickets')
      .insert(
        Array.from({ length: TICKETS }, (_, i) => ({
          ...base,
          association_id: org.associationId,
          unit_id: unitIds[i % unitIds.length],
          submitted_by: board.id,
          subject: `Ticket ${i} about the unit`,
          category: 'maintenance',
          description: 'seeded',
        })),
      )
      .select('id'),
    'tickets',
  )

  await check(
    db
      .from('arc_requests')
      .insert(
        Array.from({ length: ARCS }, (_, i) => ({
          ...base,
          association_id: org.associationId,
          unit_id: unitIds[i % unitIds.length],
          submitted_by: board.id,
          category: 'paint',
          summary: `Repaint request ${i}`,
          scope_description: 'seeded',
        })),
      )
      .select('id'),
    'arc_requests',
  )

  await check(
    db
      .from('vendors')
      .insert(
        Array.from({ length: VENDORS }, (_, i) => ({
          ...base,
          legal_name: i % 3 === 0 ? `Landscaping Co ${i}` : `Vendor ${i} LLC`,
        })),
      )
      .select('id'),
    'vendors',
  )

  await check(
    db
      .from('hoa_documents')
      .insert(
        Array.from({ length: DOCUMENTS }, (_, i) => ({
          org_id: org.orgId,
          name: `Document ${i}`,
          type: 'other',
          storage_path: `${org.orgId}/doc-${i}.pdf`,
        })),
      )
      .select('id'),
    'hoa_documents',
  )

  await check(
    db
      .from('hoa_meeting_minutes')
      .insert(
        Array.from({ length: MEETINGS }, (_, i) => ({
          org_id: org.orgId,
          meeting_type: 'regular',
          meeting_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-10`,
          ai_summary: 'Landscaping contract and trash pickup discussed',
        })),
      )
      .select('id'),
    'hoa_meeting_minutes',
  )

  return { org, board }
}

/** Nearest-rank percentile of an ascending-sorted list. */
function percentile(sorted: number[], p: number): number {
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[Math.min(rank, sorted.length) - 1]
}

describe('⌘K search latency (BL-060)', () => {
  let s: Seeded

  beforeAll(async () => {
    await truncateAll()
    s = await seed()
  }, 120_000)

  it(`records p50/p95 over ${RUNS} searches and stays under a ${P95_BUDGET_MS} ms p95`, async () => {
    const client = s.board.client as unknown as SearchClient
    const search = (term: string) => searchRecords(client, s.org.orgId, term)

    // Warm-up: first requests pay for connection setup and plan caching.
    for (let i = 0; i < WARMUP; i++) await search(TERMS[i % TERMS.length])

    const samples: number[] = []
    let hitRuns = 0
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now()
      const result = await search(TERMS[i % TERMS.length])
      samples.push(performance.now() - start)
      // Every type answered: a type that errored would time the failure
      // path, not the search.
      expect(result.failed).toEqual([])
      if (result.groups.length > 0) hitRuns++
    }

    const sorted = [...samples].sort((a, b) => a - b)
    const p50 = Math.round(percentile(sorted, 50))
    const p95 = Math.round(percentile(sorted, 95))
    const max = Math.round(sorted[sorted.length - 1])
    // Counts and milliseconds only (no terms, ids or rows).
    console.info(
      `[search-latency] ${JSON.stringify({ runs: RUNS, lots: LOTS, hitRuns, p50Ms: p50, p95Ms: p95, maxMs: max, budgetP95Ms: P95_BUDGET_MS })}`,
    )

    // The seeded terms do find things; a search that never matches would
    // be measuring nothing.
    expect(hitRuns).toBeGreaterThan(RUNS / 2)
    expect(p95).toBeLessThanOrEqual(P95_BUDGET_MS)
  }, 120_000)
})
