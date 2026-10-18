import { describe, expect, it } from 'vitest'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { ACTIVITY_WINDOW_DAYS, readListSignals } from './list-signals'

const ORG = 'org-1'
const NOW = new Date('2026-10-17T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const units = [
  { id: 'u1', organization_id: ORG, legacy_hoa_property_id: 'p1' },
  // A duplicate unit on p1: its rows still belong to p1.
  { id: 'u1b', organization_id: ORG, legacy_hoa_property_id: 'p1' },
  { id: 'u2', organization_id: ORG, legacy_hoa_property_id: 'p2' },
  { id: 'u9', organization_id: ORG, legacy_hoa_property_id: null },
]

function tables(over: Record<string, Record<string, unknown>[]> = {}) {
  return {
    units,
    arc_requests: [
      { id: 'a1', organization_id: ORG, unit_id: 'u1', status: 'submitted', submitted_at: daysAgo(3), board_response_at: null, deleted_at: null },
      { id: 'a2', organization_id: ORG, unit_id: 'u1b', status: 'in_review', submitted_at: daysAgo(40), board_response_at: null, deleted_at: null },
      { id: 'a3', organization_id: ORG, unit_id: 'u2', status: 'approved', submitted_at: daysAgo(500), board_response_at: daysAgo(400), deleted_at: null },
      { id: 'a4', organization_id: ORG, unit_id: 'u2', status: 'submitted', submitted_at: daysAgo(1), board_response_at: null, deleted_at: daysAgo(1) },
      { id: 'a5', organization_id: 'org-2', unit_id: 'u2', status: 'submitted', submitted_at: daysAgo(1), board_response_at: null, deleted_at: null },
    ],
    property_events: [{ id: 'e1', organization_id: ORG, property_id: 'p2', occurred_at: daysAgo(20) }],
    hoa_violations: [{ id: 'v1', org_id: ORG, property_id: 'p2', created_at: daysAgo(5), deleted_at: null }],
    inbox_threads: [{ id: 't1', organization_id: ORG, unit_id: 'u2', last_message_at: daysAgo(2) }],
    payments: [{ id: 'pm1', organization_id: ORG, unit_id: 'u1', paid_at: daysAgo(1) }],
    ...over,
  }
}

describe('readListSignals', () => {
  it('counts open ARC per home across every bridged unit, ignoring closed, deleted and other orgs', async () => {
    const { db } = cappedFakeDb(tables())
    const s = await readListSignals(db, ORG, NOW)
    expect(s.get('p1')?.openArc).toBe(2)
    expect(s.get('p2')?.openArc).toBe(0)
  })

  it('last activity is the newest dated row from any source, with what it was', async () => {
    const { db } = cappedFakeDb(tables())
    const s = await readListSignals(db, ORG, NOW)
    expect(s.get('p1')).toMatchObject({ lastActivityAt: daysAgo(1), lastActivityKind: 'payment' })
    expect(s.get('p2')).toMatchObject({ lastActivityAt: daysAgo(2), lastActivityKind: 'mail' })
  })

  it('looks back a bounded window, so the read does not grow with the association’s age', async () => {
    const { db, calls } = cappedFakeDb(tables())
    await readListSignals(db, ORG, NOW)
    const since = daysAgo(ACTIVITY_WINDOW_DAYS)
    for (const table of ['property_events', 'hoa_violations', 'inbox_threads', 'payments']) {
      const gte = calls.filter((c) => c.table === table).flatMap((c) => c.ops.filter((o) => o[0] === 'gte'))
      expect(gte.length, table).toBeGreaterThan(0)
      expect(gte.every((o) => o[2] === since), table).toBe(true)
    }
  })

  it('a home with nothing in the window has no last activity, not a made-up one', async () => {
    const { db } = cappedFakeDb(tables({ payments: [], inbox_threads: [], hoa_violations: [], property_events: [] }))
    const s = await readListSignals(db, ORG, NOW)
    // p2's only ARC row is from 500 days ago (outside the window).
    expect(s.get('p2')?.lastActivityAt ?? null).toBeNull()
  })

  it('a constant number of reads, whatever the roster size (no per-home lookups)', async () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `u${i}`, organization_id: ORG, legacy_hoa_property_id: `p${i}` }))
    const small = cappedFakeDb(tables())
    await readListSignals(small.db, ORG, NOW)
    const big = cappedFakeDb(tables({ units: many }))
    await readListSignals(big.db, ORG, NOW)
    expect(big.calls.length).toBe(small.calls.length)
  })

  it('throws when any source fails, so the list says "couldn’t load" instead of showing zeros', async () => {
    const { db } = cappedFakeDb(tables(), { failAt: { table: 'arc_requests' } })
    await expect(readListSignals(db, ORG, NOW)).rejects.toThrow()
  })
})
