/**
 * Whole-lot writes against real Postgres + RLS (C0.3/C0.4, PR-01).
 *
 * A lot is two rows (hoa_properties, and units + ownerships). The unit
 * tests prove lib/properties/lot.ts sequences and compensates its writes;
 * this proves the same functions work through a BOARD user's RLS-bound
 * client (0063 policies), that a foreign board user cannot write into the
 * org, and that compensation really leaves nothing behind when Postgres —
 * not a fake — rejects a step.
 *
 * Fixtures are synthetic; no real addresses or people.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createLot,
  deleteLot,
  ensureUnitsForProperties,
  listBillableUnits,
  updateLot,
  unitIdsOfDeletedProperties,
} from '../../../apps/hoa/src/lib/properties/lot'
import { asPropertyId, resolveUnitForProperty } from '../../../apps/hoa/src/lib/properties/resolve'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const TODAY = '2026-10-17'

let org: OrgFixture
let board: TestUser

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
})

const input = (over: Partial<Parameters<typeof createLot>[1]> = {}) => ({
  orgId: org.orgId,
  associationId: org.associationId,
  address: '100 Fixture Lane',
  unitNumber: '1',
  owner: { name: 'Fixture Owner', email: 'owner@example.test', phone: null },
  notes: null,
  today: TODAY,
  userId: board.id,
  ...over,
})

describe('createLot through a board user’s RLS client', () => {
  it('writes the property, a bridged unit in the association and a current ownership', async () => {
    const r = await createLot(board.client as never, input())
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const db = adminDb()
    const { data: unit } = await db.from('units').select('*').eq('id', r.data.unitId).single()
    expect(unit).toMatchObject({
      organization_id: org.orgId,
      association_id: org.associationId,
      legacy_hoa_property_id: r.data.propertyId,
      address_line1: '100 Fixture Lane',
    })
    const { data: owns } = await db.from('ownerships').select('*').eq('unit_id', r.data.unitId).is('valid_to', null)
    expect(owns).toHaveLength(1)
    expect(owns?.[0]).toMatchObject({ owner_email: 'owner@example.test', valid_from: TODAY })

    // Dues can now bill it: the "Add units before generating assessments" dead end is gone.
    const billable = await listBillableUnits(board.client as never, org.orgId, org.associationId)
    expect(billable.map((u) => u.id)).toContain(r.data.unitId)
  })

  it('a failure Postgres raises mid-way leaves no half lot (compensation is real)', async () => {
    // An association id that does not exist: the units insert fails its FK
    // AFTER hoa_properties was written. The property must be gone again.
    const r = await createLot(board.client as never, input({ associationId: randomUUID() }))
    expect(r.ok).toBe(false)
    const db = adminDb()
    const { count: props } = await db.from('hoa_properties').select('id', { count: 'exact', head: true }).eq('org_id', org.orgId)
    const { count: units } = await db.from('units').select('id', { count: 'exact', head: true }).eq('organization_id', org.orgId)
    expect(props).toBe(0)
    expect(units).toBe(0)
  })

  it('a board member of another org cannot create a lot in this one', async () => {
    const other = await makeOrg()
    const foreign = await mintUser(other, 'board')
    const r = await createLot(foreign.client as never, input())
    expect(r.ok).toBe(false)
    const { count } = await adminDb().from('hoa_properties').select('id', { count: 'exact', head: true }).eq('org_id', org.orgId)
    expect(count).toBe(0)
  })
})

describe('update and delete keep both sides in step', () => {
  it('an owner email fix reaches the current ownership; delete closes it and drops the lot from billing', async () => {
    const created = await createLot(board.client as never, input())
    if (!created.ok) throw new Error(created.error)
    const { propertyId, unitId } = created.data

    const upd = await updateLot(board.client as never, {
      orgId: org.orgId,
      propertyId,
      patch: { address: '101 Fixture Lane', ownerEmail: 'fixed@example.test' },
      today: TODAY,
      userId: board.id,
    })
    expect(upd).toMatchObject({ ok: true, data: { mirrored: true, ownership: 'updated' } })

    const db = adminDb()
    const { data: unit } = await db.from('units').select('address_line1').eq('id', unitId).single()
    expect(unit?.address_line1).toBe('101 Fixture Lane')
    const { data: own } = await db.from('ownerships').select('owner_email').eq('unit_id', unitId).is('valid_to', null).single()
    expect(own?.owner_email).toBe('fixed@example.test')

    const del = await deleteLot(board.client as never, { orgId: org.orgId, propertyId, today: TODAY })
    expect(del).toEqual({ ok: true, data: { closedOwnerships: 1, endedTenancies: 0 } })

    const { count: current } = await db
      .from('ownerships')
      .select('id', { count: 'exact', head: true })
      .eq('unit_id', unitId)
      .is('valid_to', null)
    expect(current).toBe(0)
    const billable = await listBillableUnits(board.client as never, org.orgId, org.associationId)
    expect(billable.map((u) => u.id)).not.toContain(unitId)
    expect([...(await unitIdsOfDeletedProperties(board.client as never, [unitId]))]).toEqual([unitId])
  })
})

describe('properties added before the dual write', () => {
  it('ensureUnitsForProperties gives an unlinked property its unit, once', async () => {
    const db = adminDb()
    const { data: legacy, error } = await db
      .from('hoa_properties')
      .insert({ org_id: org.orgId, address: '200 Fixture Lane' })
      .select('id')
      .single()
    if (error || !legacy) throw new Error(error?.message)

    expect(await ensureUnitsForProperties(board.client as never, org.orgId, org.associationId)).toEqual({
      ok: true,
      data: { created: 1 },
    })
    expect(await ensureUnitsForProperties(board.client as never, org.orgId, org.associationId)).toEqual({
      ok: true,
      data: { created: 0 },
    })
    const res = await resolveUnitForProperty(board.client as never, org.orgId, asPropertyId(legacy.id))
    expect(res).toMatchObject({ unitCount: 1, duplicate: false })
  })

  it('two units on one property resolve to the oldest, flagged, without an error', async () => {
    const db = adminDb()
    const { data: p } = await db.from('hoa_properties').insert({ org_id: org.orgId, address: '300 Fixture Lane' }).select('id').single()
    const pid = p!.id
    await db.from('units').insert({ organization_id: org.orgId, association_id: org.associationId, address_line1: '300 Fixture Lane', legacy_hoa_property_id: pid, created_at: '2026-01-01T00:00:00Z' })
    await db.from('units').insert({ organization_id: org.orgId, association_id: org.associationId, address_line1: '300 Fixture Lane', legacy_hoa_property_id: pid, created_at: '2026-02-01T00:00:00Z' })
    const { data: oldest } = await db.from('units').select('id').eq('legacy_hoa_property_id', pid).order('created_at').limit(1).single()

    const res = await resolveUnitForProperty(board.client as never, org.orgId, asPropertyId(pid))
    expect(res).toMatchObject({ unitId: oldest!.id, unitCount: 2, duplicate: true })
  })
})
