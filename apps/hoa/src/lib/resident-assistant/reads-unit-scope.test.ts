import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/properties/resolve', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/properties/resolve')>()),
  propertyIdsForUnits: vi.fn(async () => new Map([['unit-12', 'prop-12']])),
}))

import { readMyRequests, unitScope } from './reads'

// BL-101 A2 — the board-side, one-home scope. The fake client IGNORES every
// filter and returns a neighbour's and another org's rows too, so these
// pass only if reads.ts re-checks each row itself (its header, point 3).

function fakeDb(tables: Record<string, unknown[]>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  return {
    calls,
    from(table: string) {
      const result = { data: tables[table] ?? [], error: null }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'not', 'or', 'neq']) {
        chain[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args })
          return chain
        }
      }
      chain.limit = (...args: unknown[]) => {
        calls.push({ table, method: 'limit', args })
        return Promise.resolve(result)
      }
      return chain
    },
  }
}

describe('readMyRequests with unitScope (board side)', () => {
  const db = fakeDb({
    tickets: [
      { id: 't-mine', unit_id: 'unit-12', category: 'maintenance', subject: 'Gate', status: 'open', created_at: '2026-10-01', organization_id: 'org-1' },
      { id: 't-neighbour', unit_id: 'unit-14', category: 'maintenance', subject: 'X', status: 'open', created_at: '2026-10-01', organization_id: 'org-1' },
      { id: 't-other-org', unit_id: 'unit-12', category: 'maintenance', subject: 'Y', status: 'open', created_at: '2026-10-01', organization_id: 'org-2' },
    ],
    arc_requests: [
      { id: 'a-mine', unit_id: 'unit-12', category: 'paint', summary: 'Door', status: 'submitted', board_response_at: null, submitted_at: '2026-09-01', organization_id: 'org-1' },
      { id: 'a-neighbour', unit_id: 'unit-14', category: 'paint', summary: 'Z', status: 'submitted', board_response_at: null, submitted_at: '2026-09-01', organization_id: 'org-1' },
    ],
    hoa_violations: [
      { id: 'v-mine', property_id: 'prop-12', org_id: 'org-1', violation_type: 'trash', status: 'open', fine_amount: null, cure_period_days: 10, notice_sent_at: null, created_at: '2026-10-02' },
      { id: 'v-neighbour', property_id: 'prop-14', org_id: 'org-1', violation_type: 'trash', status: 'open', fine_amount: null, cure_period_days: 10, notice_sent_at: null, created_at: '2026-10-02' },
    ],
  })
  const scope = unitScope({ db: db as never, orgId: 'org-1', unitIds: ['unit-12'], timeZone: 'America/New_York' })

  it('returns every request on the home, whoever filed it, and nothing else', async () => {
    const out = await readMyRequests(scope)
    expect(out.tickets.map((t) => t.id)).toEqual(['t-mine'])
    expect(out.arcApplications.map((a) => a.id)).toEqual(['a-mine'])
    expect(out.violationsOnMyHome.map((v) => v.id)).toEqual(['v-mine'])
    expect(out.reportedConcerns).toEqual([])
  })

  it('filters tickets and ARC on unit_id, never on submitted_by', async () => {
    await readMyRequests(scope)
    const ticketCalls = db.calls.filter((c) => c.table === 'tickets')
    expect(ticketCalls).toContainEqual({ table: 'tickets', method: 'in', args: ['unit_id', ['unit-12']] })
    expect(db.calls.some((c) => c.args[0] === 'submitted_by')).toBe(false)
  })

  it('a scope with no user id stays a board scope (no resident-side reads)', () => {
    expect(scope.userId).toBeNull()
    expect(scope.requestsBy).toBe('unit')
  })
})
