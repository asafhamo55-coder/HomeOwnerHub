import { describe, expect, it, vi } from 'vitest'
import { fakeDb, type Row } from './fake-hearing-db'

const homes = vi.hoisted(() => ({ map: [] as Array<{ unitId: string; propertyId: string }> | null }))
vi.mock('@/lib/violation-response', async (orig) => ({
  ...(await orig<typeof import('@/lib/violation-response')>()),
  homePropertiesForUnits: vi.fn(async () => homes.map),
}))

import { loadUpcomingHearings } from './resident-upcoming'

const ORG = 'org-1'
const NOW = new Date('2026-11-10T15:00:00Z')
const unit = { unit_id: 'u1', association_name: 'Maple HOA', association_state: 'FL', association_time_zone: 'America/New_York' }

function hearing(violation_id: string, over: Row = {}): Row {
  return {
    organization_id: ORG,
    violation_id,
    status: 'scheduled',
    requested_at: null,
    hearing_on: '2026-11-20',
    hearing_time: '18:30',
    location: 'Clubhouse',
    notice_sent_on: '2026-11-01',
    outcome: null,
    decided_on: null,
    payment_due_on: null,
    ...over,
  }
}
const violation = (id: string, property_id: string, over: Row = {}): Row => ({
  id,
  property_id,
  org_id: ORG,
  violation_type: 'trash_bins',
  status: 'notice_sent',
  deleted_at: null,
  ...over,
})

function run(violations: Row[], hearings: Row[], opts: { violationId?: string; live?: boolean } = {}) {
  const filters: Array<{ table: string; col: string; val: unknown }> = []
  const residentDb = fakeDb({ hoa_violations: violations })
  const admin = fakeDb({ violation_hearings: hearings }, filters)
  return {
    filters,
    result: loadUpcomingHearings({ residentDb, admin }, { orgId: ORG, units: [unit], now: NOW, ...opts }),
  }
}

const ids = (r: Awaited<ReturnType<typeof loadUpcomingHearings>>) =>
  r.kind === 'ok' ? r.hearings.map((x) => x.violationId) : r.kind

describe('loadUpcomingHearings', () => {
  it('shows the owner’s own scheduled future hearing', async () => {
    homes.map = [{ unitId: 'u1', propertyId: 'p1' }]
    const { result } = run([violation('v1', 'p1')], [hearing('v1')])
    expect(await result).toEqual({
      kind: 'ok',
      hearings: [
        {
          violationId: 'v1',
          hearingOn: '2026-11-20',
          hearingTime: '18:30',
          location: 'Clubhouse',
          summary: 'trash bins',
          associationName: 'Maple HOA',
          state: 'FL',
          timeZone: 'America/New_York',
        },
      ],
    })
  })

  it('never shows a hearing on a neighbour’s violation', async () => {
    homes.map = [{ unitId: 'u1', propertyId: 'p1' }]
    const { result } = run([violation('v1', 'p1'), violation('v2', 'p-neighbour')], [hearing('v1'), hearing('v2')])
    expect(ids(await result)).toEqual(['v1'])
  })

  it('is scoped to the org on both reads', async () => {
    homes.map = [{ unitId: 'u1', propertyId: 'p1' }]
    const { result, filters } = run(
      [violation('v1', 'p1'), violation('v-other-org', 'p1', { org_id: 'org-2' })],
      [hearing('v1'), hearing('v-other-org', { organization_id: 'org-2' })],
    )
    expect(ids(await result)).toEqual(['v1'])
    expect(filters).toContainEqual({ table: 'violation_hearings', col: 'organization_id', val: ORG })
  })

  it.each([
    ['cancelled', { status: 'cancelled' }],
    ['held', { status: 'held', outcome: 'upheld' }],
    ['requested only', { status: 'requested' }],
    ['past', { hearing_on: '2026-11-05' }],
    ['not noticed yet', { notice_sent_on: null }],
  ])('hides a %s hearing', async (_n, over) => {
    homes.map = [{ unitId: 'u1', propertyId: 'p1' }]
    const { result } = run([violation('v1', 'p1')], [hearing('v1', over as Row)])
    expect(await result).toEqual({ kind: 'ok', hearings: [] })
  })

  it('hides a hearing on a closed or deleted violation', async () => {
    homes.map = [{ unitId: 'u1', propertyId: 'p1' }]
    const { result } = run(
      [violation('v1', 'p1', { status: 'resolved' }), violation('v2', 'p1', { deleted_at: '2026-11-01' })],
      [hearing('v1'), hearing('v2')],
    )
    expect(await result).toEqual({ kind: 'ok', hearings: [] })
  })

  it('orders several, soonest first', async () => {
    homes.map = [{ unitId: 'u1', propertyId: 'p1' }]
    const { result } = run(
      [violation('a', 'p1'), violation('b', 'p1'), violation('c', 'p1')],
      [
        hearing('a', { hearing_on: '2026-12-01' }),
        hearing('b', { hearing_on: '2026-11-12' }),
        hearing('c', { hearing_on: '2026-11-12', hearing_time: '08:00' }),
      ],
    )
    expect(ids(await result)).toEqual(['c', 'b', 'a'])
  })

  it('narrows to one violation when asked', async () => {
    homes.map = [{ unitId: 'u1', propertyId: 'p1' }]
    const { result } = run([violation('a', 'p1'), violation('b', 'p1')], [hearing('a'), hearing('b')], { violationId: 'b' })
    expect(ids(await result)).toEqual(['b'])
  })

  it('reports off without reading, and failed when the home lookup fails', async () => {
    homes.map = [{ unitId: 'u1', propertyId: 'p1' }]
    expect(await run([], [], { live: false }).result).toEqual({ kind: 'off' })
    homes.map = null
    expect(await run([], []).result).toEqual({ kind: 'failed' })
  })

  it('an owner with no homes sees nothing', async () => {
    homes.map = []
    expect(await run([violation('v1', 'p1')], [hearing('v1')]).result).toEqual({ kind: 'ok', hearings: [] })
  })
})
