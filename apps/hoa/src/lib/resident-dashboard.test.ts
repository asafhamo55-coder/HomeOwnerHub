import { beforeEach, describe, expect, it, vi } from 'vitest'

// getOpenViolations is private, so it is driven through getResidentDashboard
// with every other collaborator stubbed. The property bridge is mocked at
// lib/properties/resolve (its own behaviour is covered in properties/*.test).

const h = vi.hoisted(() => ({
  units: [] as Array<Record<string, unknown>>,
  orgId: null as string | null,
  bridge: vi.fn(),
  violations: [] as Array<Record<string, unknown>>,
}))

function chain(table: string) {
  const result = () =>
    Promise.resolve({ data: table === 'hoa_violations' ? h.violations : [], error: null, count: null })
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'not', 'eq', 'is', 'order', 'limit', 'neq', 'gte', 'lte']) b[m] = () => b
  b.maybeSingle = () => Promise.resolve({ data: null, error: null })
  b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad)
  return b
}

vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'HOA' })) }))
vi.mock('@/lib/impersonation', () => ({
  getResidentActor: vi.fn(async () => ({
    client: { from: (t: string) => chain(t) },
    id: 'user-1',
    email: 'me@x.test',
    orgId: h.orgId,
  })),
}))
vi.mock('@/lib/resident', () => ({ getResidentUnits: vi.fn(async () => h.units) }))
vi.mock('@/lib/resident-tickets', () => ({ loadMyTickets: vi.fn(async () => ({ ok: true, data: [] })) }))
vi.mock('@/lib/resident-submissions', () => ({ loadMyArcRequests: vi.fn(async () => ({ ok: true, data: [] })) }))
vi.mock('@/lib/resident-latest-announcement', () => ({
  loadLatestAnnouncement: vi.fn(async () => ({ ok: true, announcement: null })),
}))
vi.mock('@/lib/resident-announcements', () => ({
  fetchMyAnnouncementRows: vi.fn(async () => []),
  getAnnouncementsLastViewedAt: vi.fn(async () => null),
  countNewAnnouncements: vi.fn(() => 0),
}))
vi.mock('@/lib/properties/resolve', () => ({
  propertyIdsForUnits: (...a: unknown[]) => h.bridge('org', ...a),
  propertyIdsForOwnUnits: (...a: unknown[]) => h.bridge('own', ...a),
}))

import { getResidentDashboard } from './resident-dashboard'

const unit = (id: string, charges_from: string | null = null) => ({
  unit_id: id,
  unit_number: id,
  address: null,
  association_id: 'assoc-1',
  association_name: 'Oaks',
  ownership_pct: 100,
  valid_from: '2020-01-01',
  charges_from,
})

const violation = (id: string, property_id: string, created_at: string) => ({
  id,
  property_id,
  violation_type: 'trash',
  description: null,
  status: 'open',
  severity: 'minor',
  fine_amount: 100,
  cure_period_days: 14,
  notice_sent_at: null,
  created_at,
})

beforeEach(() => {
  h.orgId = null
  h.units = [unit('u1')]
  h.violations = []
  h.bridge.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getResidentDashboard open violations via the property bridge', () => {
  it('returns open violations for the bridged properties (RLS client uses the own-units lookup)', async () => {
    h.bridge.mockResolvedValue(new Map([['u1', 'p1']]))
    h.violations = [violation('v1', 'p1', '2025-03-01T00:00:00Z')]
    const d = await getResidentDashboard()
    expect(h.bridge.mock.calls[0]![0]).toBe('own')
    expect(d.failed.violations).toBe(false)
    expect(d.openViolations.map((v) => v.id)).toEqual(['v1'])
    expect(d.openViolations[0]).not.toHaveProperty('property_id')
    expect(d.openViolations[0]!.fine_amount).toBe(100)
  })

  it('uses the org-scoped lookup when impersonating', async () => {
    h.orgId = 'org-1'
    h.bridge.mockResolvedValue(new Map([['u1', 'p1']]))
    await getResidentDashboard()
    expect(h.bridge.mock.calls[0]!.slice(0, 2)).toEqual(['org', expect.anything()])
    expect(h.bridge.mock.calls[0]![2]).toBe('org-1')
  })

  it('a bridge read failure makes the violations unknown (null -> failed flag), not an empty list', async () => {
    h.bridge.mockRejectedValue(new Error('units read failed'))
    h.violations = [violation('v1', 'p1', '2025-03-01T00:00:00Z')]
    const d = await getResidentDashboard()
    expect(d.failed.violations).toBe(true)
    expect(d.openViolations).toEqual([])
  })

  it('no bridged properties is a genuine empty result, not a failure', async () => {
    h.bridge.mockResolvedValue(new Map())
    const d = await getResidentDashboard()
    expect(d.failed.violations).toBe(false)
    expect(d.openViolations).toEqual([])
  })

  it("a buyer's window nulls the fine on a violation created before the window start only", async () => {
    h.units = [unit('u1', '2025-06-01')]
    h.bridge.mockResolvedValue(new Map([['u1', 'p1']]))
    h.violations = [
      violation('seller', 'p1', '2025-05-15T00:00:00Z'),
      violation('buyer', 'p1', '2025-06-10T00:00:00Z'),
    ]
    const d = await getResidentDashboard()
    const byId = Object.fromEntries(d.openViolations.map((v) => [v.id, v.fine_amount]))
    expect(byId).toEqual({ seller: null, buyer: 100 })
  })
})
