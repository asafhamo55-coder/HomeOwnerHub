/**
 * The hearing card's scope is the resident violation pages' scope: the real
 * getResidentUnits feeds the real loader. An ended ownership shows nothing;
 * a tenant matched through the property roster sees what loadOwnViolation
 * (the violation page's gate) lets them see.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb, type Row } from './fake-hearing-db'

const h = vi.hoisted(() => ({
  actor: { id: 'user-1', email: 'tenant@example.com', orgId: null as string | null, impersonating: false, client: null as unknown },
}))
vi.mock('@/lib/impersonation', () => ({ getResidentActor: vi.fn(async () => h.actor) }))
vi.mock('@/lib/resident-sale-window', () => ({ chargesFromForOwnership: () => null }))

import { getResidentUnits } from '@/lib/resident'
import { loadOwnViolation } from '@/lib/violation-response'
import { loadUpcomingHearings } from '../resident-upcoming'

const V1 = '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40'
const ORG = 'org-1'
const NOW = new Date('2026-11-10T15:00:00Z')

const association: Row = { id: 'a1', name: 'Maple HOA', organization_id: ORG, state: 'GA', time_zone: 'America/New_York' }
const unit: Row = { id: 'u1', organization_id: ORG, legacy_hoa_property_id: 'p1', association_id: 'a1' }
const violation: Row = {
  id: V1,
  property_id: 'p1',
  org_id: ORG,
  violation_type: 'trash_bins',
  status: 'notice_sent',
  deleted_at: null,
}
const hearing: Row = {
  organization_id: ORG,
  violation_id: V1,
  status: 'scheduled',
  requested_at: null,
  hearing_on: '2026-11-20',
  hearing_time: '18:30',
  location: 'Clubhouse',
  notice_sent_on: '2026-11-01',
  outcome: null,
  decided_on: null,
  payment_due_on: null,
}
const ownership = (over: Row = {}): Row => ({
  owner_user_id: 'user-1',
  organization_id: ORG,
  unit_id: 'u1',
  ownership_pct: 100,
  valid_from: '2020-01-01',
  valid_to: null,
  source: null,
  unit: { unit_number: '1', address_line1: '1 Oak Lane', association_id: 'a1' },
  ...over,
})

function setup(tables: Record<string, Row[]>) {
  const db = fakeDb({ associations: [association], units: [unit], hoa_violations: [violation], ...tables })
  h.actor.client = db
  return db
}
const hearingsFor = async () => {
  const units = await getResidentUnits()
  return loadUpcomingHearings(
    { residentDb: h.actor.client as never, admin: fakeDb({ violation_hearings: [hearing] }) },
    { orgId: ORG, units, now: NOW },
  )
}

beforeEach(() => {
  h.actor.email = 'tenant@example.com'
})

describe('hearing card scope matches the resident violation pages', () => {
  it('a current owner sees the hearing', async () => {
    setup({ ownerships: [ownership()] })
    const r = await hearingsFor()
    expect(r.kind === 'ok' && r.hearings.map((x) => x.violationId)).toEqual([V1])
  })

  it('an ended ownership (valid_to set) shows nothing', async () => {
    h.actor.email = null as never
    setup({ ownerships: [ownership({ valid_to: '2026-06-30' })] })
    expect(await hearingsFor()).toEqual({ kind: 'ok', hearings: [] })
  })

  it('a tenant-only resident sees what the violation page shows them', async () => {
    setup({
      ownerships: [],
      property_residents: [
        {
          property_id: 'p1',
          role: 'tenant',
          email: 'tenant@example.com',
          moved_in_at: '2025-01-01',
          moved_out_at: null,
          property: { id: 'p1', address: '1 Oak Lane', unit_number: '1', org_id: ORG },
        },
      ],
    })
    const units = await getResidentUnits()
    const own = await loadOwnViolation(h.actor.client as never, { violationId: V1, unitIds: units.map((u) => u.unit_id), orgId: ORG })
    expect(own.ok).toBe(true)
    const r = await hearingsFor()
    expect(r.kind === 'ok' && r.hearings.map((x) => x.violationId)).toEqual([V1])
  })

  it('a tenant who moved out shows nothing, like the violation page', async () => {
    setup({
      ownerships: [],
      property_residents: [
        {
          property_id: 'p1',
          role: 'tenant',
          email: 'tenant@example.com',
          moved_in_at: '2025-01-01',
          moved_out_at: '2026-05-01',
          property: { id: 'p1', address: '1 Oak Lane', unit_number: '1', org_id: ORG },
        },
      ],
    })
    expect(await hearingsFor()).toEqual({ kind: 'ok', hearings: [] })
  })
})
