import { describe, expect, it, vi } from 'vitest'
import { memorySupabase, type MemCall } from '@/lib/test-utils/memory-supabase'
import {
  addOwnershipForProperty,
  chooseAssociation,
  createLot,
  deleteLot,
  ensureUnitsForProperties,
  listBillableUnits,
  unitIdsOfDeletedProperties,
  updateLot,
} from './lot'
import { asPropertyId } from './resolve'

// Ids and fixtures are synthetic; nothing here is a real address or person.
const ORG = 'org-1'
const OTHER = 'org-2'
const ASSOC = 'assoc-1'
const TODAY = '2026-10-17'
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never

vi.spyOn(console, 'error').mockImplementation(() => {})

const fail = (table: string, op: string, nth = 0) => (c: MemCall, n: number) =>
  c.table === table && c.op === op && n === nth ? { code: 'XX000', message: 'boom' } : null

const baseCreate = {
  orgId: ORG,
  associationId: ASSOC,
  address: '1 Test Way',
  unitNumber: 'A',
  owner: { name: 'Owner One', email: 'one@example.test', phone: null },
  notes: null,
  today: TODAY,
  userId: 'user-1',
}

describe('chooseAssociation', () => {
  it('0 associations → null, 1 → it, several → must choose, foreign → refused', async () => {
    expect(await chooseAssociation(db(memorySupabase()), ORG, null)).toEqual({ ok: true, data: { associationId: null } })

    const one = memorySupabase({ associations: [{ id: ASSOC, organization_id: ORG, name: 'A' }] })
    expect(await chooseAssociation(db(one), ORG, null)).toEqual({ ok: true, data: { associationId: ASSOC } })

    const two = memorySupabase({
      associations: [
        { id: ASSOC, organization_id: ORG, name: 'A' },
        { id: 'assoc-2', organization_id: ORG, name: 'B' },
        { id: 'assoc-x', organization_id: OTHER, name: 'X' },
      ],
    })
    expect(await chooseAssociation(db(two), ORG, null)).toMatchObject({ ok: false, field: 'association_id' })
    expect(await chooseAssociation(db(two), ORG, 'assoc-2')).toEqual({ ok: true, data: { associationId: 'assoc-2' } })
    expect(await chooseAssociation(db(two), ORG, 'assoc-x')).toMatchObject({ ok: false, field: 'association_id' })
  })
})

describe('createLot writes both sides', () => {
  it('creates hoa_properties, a bridged unit and a current ownership', async () => {
    const m = memorySupabase()
    const r = await createLot(db(m), baseCreate)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const [prop] = m.rows('hoa_properties')
    expect(prop).toMatchObject({ id: r.data.propertyId, org_id: ORG, address: '1 Test Way', owner_email: 'one@example.test' })
    const [unit] = m.rows('units')
    expect(unit).toMatchObject({
      id: r.data.unitId,
      organization_id: ORG,
      association_id: ASSOC,
      address_line1: '1 Test Way',
      unit_number: 'A',
      legacy_hoa_property_id: r.data.propertyId,
    })
    const [own] = m.rows('ownerships')
    expect(own).toMatchObject({
      organization_id: ORG,
      unit_id: r.data.unitId,
      owner_email: 'one@example.test',
      valid_from: TODAY,
      source: 'manual',
    })
    expect(own.valid_to).toBeUndefined()
  })

  it('creates no ownership when no owner is given', async () => {
    const m = memorySupabase()
    const r = await createLot(db(m), { ...baseCreate, owner: { name: null, email: null, phone: null } })
    expect(r.ok).toBe(true)
    expect(m.rows('units')).toHaveLength(1)
    expect(m.rows('ownerships')).toHaveLength(0)
  })

  it('a failed unit insert removes the property again (no half lot)', async () => {
    const m = memorySupabase({}, { failOn: fail('units', 'insert') })
    const r = await createLot(db(m), baseCreate)
    expect(r.ok).toBe(false)
    expect(m.rows('hoa_properties')).toHaveLength(0)
    expect(m.rows('units')).toHaveLength(0)
  })

  it('a failed ownership insert removes the unit, then the property', async () => {
    const m = memorySupabase({}, { failOn: fail('ownerships', 'insert') })
    const r = await createLot(db(m), baseCreate)
    expect(r.ok).toBe(false)
    expect(m.rows('units')).toHaveLength(0)
    expect(m.rows('hoa_properties')).toHaveLength(0)
    const deletes = m.calls.filter((c) => c.op === 'delete').map((c) => c.table)
    expect(deletes).toEqual(['units', 'hoa_properties'])
  })

  it('the user-facing error never carries the database message', async () => {
    const m = memorySupabase({}, { failOn: fail('hoa_properties', 'insert') })
    const r = await createLot(db(m), baseCreate)
    expect(r).toEqual({ ok: false, error: 'Couldn’t add the property. Try again.' })
  })
})

function seededLot(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  return {
    hoa_properties: [
      {
        id: 'p1',
        org_id: ORG,
        address: '1 Test Way',
        unit_number: 'A',
        owner_name: 'Owner One',
        owner_email: 'one@example.test',
        owner_phone: null,
        notes: null,
        deleted_at: null,
      },
    ],
    units: [
      {
        id: 'u1',
        organization_id: ORG,
        association_id: ASSOC,
        address_line1: '1 Test Way',
        unit_number: 'A',
        legacy_hoa_property_id: 'p1',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    ...extra,
  }
}

const currentOwnership = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  organization_id: ORG,
  unit_id: 'u1',
  owner_user_id: null,
  owner_name: 'Owner One',
  owner_email: 'one@example.test',
  owner_phone: null,
  valid_from: '2025-01-01',
  valid_to: null,
  ...over,
})

describe('updateLot mirrors to the unit and the current ownership', () => {
  const upd = (m: ReturnType<typeof memorySupabase>, patch: Record<string, unknown>, orgId = ORG) =>
    updateLot(db(m), { orgId, propertyId: asPropertyId('p1'), patch, today: TODAY, userId: 'user-1' })

  it('mirrors address and unit number', async () => {
    const m = memorySupabase(seededLot())
    expect(await upd(m, { address: '2 Test Way', unitNumber: 'B' })).toMatchObject({ ok: true })
    expect(m.rows('hoa_properties')[0]).toMatchObject({ address: '2 Test Way', unit_number: 'B' })
    expect(m.rows('units')[0]).toMatchObject({ address_line1: '2 Test Way', unit_number: 'B' })
  })

  it('an owner email fix updates the current ownership in place (dues reminders follow)', async () => {
    const m = memorySupabase(seededLot({ ownerships: [currentOwnership()] }))
    const r = await upd(m, { ownerEmail: 'fixed@example.test' })
    expect(r).toEqual({ ok: true, data: { mirrored: true, ownership: 'updated' } })
    expect(m.rows('ownerships')).toHaveLength(1)
    expect(m.rows('ownerships')[0]).toMatchObject({ owner_email: 'fixed@example.test', valid_to: null })
  })

  it('opens an ownership when the lot had none', async () => {
    const m = memorySupabase(seededLot())
    const r = await upd(m, { ownerName: 'New Owner' })
    expect(r).toMatchObject({ ok: true, data: { ownership: 'opened' } })
    expect(m.rows('ownerships')[0]).toMatchObject({ unit_id: 'u1', owner_name: 'New Owner', valid_from: TODAY })
  })

  it('clearing the owner closes the current ownership', async () => {
    const m = memorySupabase(seededLot({ ownerships: [currentOwnership()] }))
    const r = await upd(m, { ownerName: null, ownerEmail: null, ownerPhone: null })
    expect(r).toMatchObject({ ok: true, data: { ownership: 'closed' } })
    expect(m.rows('ownerships')[0]).toMatchObject({ valid_to: TODAY })
  })

  it('a portal-linked owner with a new email is a different person: closed and replaced', async () => {
    const m = memorySupabase(seededLot({ ownerships: [currentOwnership({ owner_user_id: 'portal-user' })] }))
    const r = await upd(m, { ownerEmail: 'someone-else@example.test' })
    expect(r).toMatchObject({ ok: true, data: { ownership: 'replaced' } })
    const owns = m.rows('ownerships')
    expect(owns).toHaveLength(2)
    expect(owns[0]).toMatchObject({ owner_user_id: 'portal-user', valid_to: TODAY })
    expect(owns[1]).toMatchObject({ owner_email: 'someone-else@example.test', valid_from: TODAY })
    expect(owns[1].owner_user_id ?? null).toBeNull()
  })

  it('a failed ownership write reverts the unit and the property', async () => {
    const m = memorySupabase(seededLot({ ownerships: [currentOwnership()] }), {
      failOn: (c) => (c.table === 'ownerships' && c.op === 'update' ? { code: 'XX000', message: 'boom' } : null),
    })
    const r = await upd(m, { address: '2 Test Way', ownerEmail: 'fixed@example.test' })
    expect(r.ok).toBe(false)
    expect(m.rows('hoa_properties')[0]).toMatchObject({ address: '1 Test Way', owner_email: 'one@example.test' })
    expect(m.rows('units')[0]).toMatchObject({ address_line1: '1 Test Way' })
    expect(m.rows('ownerships')[0]).toMatchObject({ owner_email: 'one@example.test' })
  })

  it('another org cannot edit the lot', async () => {
    const m = memorySupabase(seededLot())
    expect(await upd(m, { address: '9 Elsewhere' }, OTHER)).toEqual({ ok: false, error: 'Property not found.' })
    expect(m.rows('hoa_properties')[0]).toMatchObject({ address: '1 Test Way' })
  })

  it('a lot with no unit still saves the property side', async () => {
    const m = memorySupabase({ hoa_properties: seededLot().hoa_properties })
    expect(await upd(m, { address: '2 Test Way' })).toEqual({ ok: true, data: { mirrored: false, ownership: 'unchanged' } })
  })
})

describe('deleteLot takes the lot out of audiences and dues reminders', () => {
  const tenancy = { id: 't1', organization_id: ORG, unit_id: 'u1', status: 'active', lease_start: '2026-01-01' }

  it('soft-deletes, closes current ownerships and ends active tenancies', async () => {
    const m = memorySupabase(seededLot({ ownerships: [currentOwnership()], tenancies: [tenancy] }))
    const r = await deleteLot(db(m), { orgId: ORG, propertyId: asPropertyId('p1'), today: TODAY })
    expect(r).toEqual({ ok: true, data: { closedOwnerships: 1, endedTenancies: 1 } })
    expect(m.rows('hoa_properties')[0].deleted_at).not.toBeNull()
    expect(m.rows('ownerships')[0]).toMatchObject({ valid_to: TODAY })
    expect(m.rows('tenancies')[0]).toMatchObject({ status: 'ended' })
  })

  it('never closes an ownership before it started (valid range check)', async () => {
    const m = memorySupabase(seededLot({ ownerships: [currentOwnership({ valid_from: '2026-12-01' })] }))
    await deleteLot(db(m), { orgId: ORG, propertyId: asPropertyId('p1'), today: TODAY })
    expect(m.rows('ownerships')[0]).toMatchObject({ valid_to: '2026-12-01' })
  })

  it('a failed tenancy write reopens the ownerships and restores the property', async () => {
    const m = memorySupabase(seededLot({ ownerships: [currentOwnership()], tenancies: [tenancy] }), {
      failOn: fail('tenancies', 'update'),
    })
    const r = await deleteLot(db(m), { orgId: ORG, propertyId: asPropertyId('p1'), today: TODAY })
    expect(r.ok).toBe(false)
    expect(m.rows('hoa_properties')[0].deleted_at).toBeNull()
    expect(m.rows('ownerships')[0].valid_to).toBeNull()
    expect(m.rows('tenancies')[0]).toMatchObject({ status: 'active' })
  })

  it('another org cannot delete the lot', async () => {
    const m = memorySupabase(seededLot({ ownerships: [currentOwnership()] }))
    const r = await deleteLot(db(m), { orgId: OTHER, propertyId: asPropertyId('p1'), today: TODAY })
    expect(r.ok).toBe(false)
    expect(m.rows('hoa_properties')[0].deleted_at).toBeNull()
    expect(m.rows('ownerships')[0].valid_to).toBeNull()
  })
})

describe('addOwnershipForProperty (Residents card "add owner")', () => {
  const add = (m: ReturnType<typeof memorySupabase>, email: string | null) =>
    addOwnershipForProperty(db(m), {
      orgId: ORG,
      propertyId: asPropertyId('p1'),
      owner: { name: 'Owner Two', email, phone: null },
      today: TODAY,
      userId: 'user-1',
    })

  it('creates a current ownership on the canonical unit', async () => {
    const m = memorySupabase(seededLot())
    expect(await add(m, 'two@example.test')).toMatchObject({ ok: true, data: { outcome: 'created' } })
    expect(m.rows('ownerships')[0]).toMatchObject({ unit_id: 'u1', owner_email: 'two@example.test' })
  })

  it('does not duplicate an owner who is already current (email, case-insensitive)', async () => {
    const m = memorySupabase(seededLot({ ownerships: [currentOwnership()] }))
    expect(await add(m, 'ONE@example.test')).toMatchObject({ ok: true, data: { outcome: 'existing' } })
    expect(m.rows('ownerships')).toHaveLength(1)
  })

  it('reports no_unit for a lot with no unit', async () => {
    const m = memorySupabase({ hoa_properties: seededLot().hoa_properties })
    expect(await add(m, 'two@example.test')).toEqual({ ok: true, data: { outcome: 'no_unit', ownershipId: null } })
  })
})

describe('dues: billable units and the unlinked-property dead end', () => {
  it('skips units whose property is soft-deleted', async () => {
    const m = memorySupabase({
      hoa_properties: [
        { id: 'p1', org_id: ORG, deleted_at: null },
        { id: 'p2', org_id: ORG, deleted_at: '2026-10-01T00:00:00Z' },
      ],
      units: [
        { id: 'u1', organization_id: ORG, association_id: ASSOC, legacy_hoa_property_id: 'p1', unit_number: null },
        { id: 'u2', organization_id: ORG, association_id: ASSOC, legacy_hoa_property_id: 'p2', unit_number: null },
        { id: 'u3', organization_id: ORG, association_id: ASSOC, legacy_hoa_property_id: null, unit_number: null },
      ],
    })
    const units = await listBillableUnits(db(m), ORG, ASSOC)
    expect(units.map((u) => u.id).sort()).toEqual(['u1', 'u3'])
  })

  it('gives every live unlinked property a unit, and only those', async () => {
    const m = memorySupabase({
      hoa_properties: [
        { id: 'p1', org_id: ORG, address: '1 Test Way', unit_number: null, deleted_at: null },
        { id: 'p2', org_id: ORG, address: '2 Test Way', unit_number: '7', deleted_at: null },
        { id: 'p3', org_id: ORG, address: '3 Test Way', unit_number: null, deleted_at: '2026-10-01T00:00:00Z' },
        { id: 'px', org_id: OTHER, address: '9 Elsewhere', unit_number: null, deleted_at: null },
      ],
      units: [{ id: 'u1', organization_id: ORG, association_id: ASSOC, legacy_hoa_property_id: 'p1', created_at: null }],
    })
    expect(await ensureUnitsForProperties(db(m), ORG, ASSOC)).toEqual({ ok: true, data: { created: 1 } })
    const created = m.rows('units').find((u) => u.legacy_hoa_property_id === 'p2')
    expect(created).toMatchObject({ organization_id: ORG, association_id: ASSOC, address_line1: '2 Test Way', unit_number: '7' })
    expect(m.rows('units')).toHaveLength(2)
  })
})

describe('unitIdsOfDeletedProperties (audiences drop deleted lots)', () => {
  it('returns only units positively bridged to a deleted property', async () => {
    const m = memorySupabase({
      hoa_properties: [
        { id: 'p1', org_id: ORG, deleted_at: null },
        { id: 'p2', org_id: ORG, deleted_at: '2026-10-01T00:00:00Z' },
      ],
      units: [
        { id: 'u1', legacy_hoa_property_id: 'p1' },
        { id: 'u2', legacy_hoa_property_id: 'p2' },
        { id: 'u3', legacy_hoa_property_id: null },
      ],
    })
    expect([...(await unitIdsOfDeletedProperties(db(m), ['u1', 'u2', 'u3', 'u-missing']))]).toEqual(['u2'])
  })
})
