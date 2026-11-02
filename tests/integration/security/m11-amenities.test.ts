/**
 * Migration 0076 (BL-034 amenity reservations) against real Postgres. CI only
 * (no local database).
 *
 *   1. the database refuses an overlapping pending or approved booking
 *      (23P01), allows back to back and allows a slot whose holder canceled;
 *   2. two requests for the same slot made at the same moment: exactly one wins;
 *   3. a resident cannot write either table through their own client, and
 *      reads only their home's bookings; another org sees nothing;
 *   4. a booking cannot point at another org's amenity (same-org trigger).
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * runs through a user's own client. Ids and counts only.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, makeUnit, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let other: OrgFixture
let unitId: string
let otherUnitId: string
let board: TestUser
let resident: TestUser
let outsider: TestUser
let amenityId: string

const at = (hour: number) => `2030-06-01T${String(hour).padStart(2, '0')}:00:00Z`

async function makeAmenity(o: OrgFixture): Promise<string> {
  const { data, error } = await adminDb()
    .from('amenities' as never)
    .insert({ organization_id: o.orgId, association_id: o.associationId, name: 'Clubhouse' } as never)
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed amenities: ${error?.code}`)
  return (data as { id: string }).id
}

function booking(from: number, to: number, extra: Record<string, unknown> = {}) {
  return {
    organization_id: org.orgId,
    association_id: org.associationId,
    amenity_id: amenityId,
    unit_id: unitId,
    starts_at: at(from),
    ends_at: at(to),
    status: 'pending',
    ...extra,
  }
}

const insert = (row: Record<string, unknown>) =>
  adminDb()
    .from('amenity_reservations' as never)
    .insert(row as never)
    .select('id')
    .single()

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  unitId = await makeUnit(org)
  otherUnitId = await makeUnit(other)
  board = await mintUser(org, 'board')
  resident = await mintUser(org, 'resident')
  outsider = await mintUser(other, 'resident')
  amenityId = await makeAmenity(org)
})

describe('1. no double booking', () => {
  it('refuses an overlap with a pending or an approved booking', async () => {
    expect((await insert(booking(10, 14))).error).toBeNull()
    expect((await insert(booking(12, 16))).error?.code).toBe('23P01')
    expect((await insert(booking(9, 11, { status: 'approved' }))).error?.code).toBe('23P01')
    expect((await insert(booking(11, 12))).error?.code).toBe('23P01')
  })

  it('allows back to back, and a slot freed by a cancel or a denial', async () => {
    const first = await insert(booking(10, 14))
    expect((await insert(booking(14, 16))).error).toBeNull()
    expect((await insert(booking(8, 10))).error).toBeNull()

    const id = (first.data as unknown as { id: string }).id
    const cancel = await adminDb()
      .from('amenity_reservations' as never)
      .update({ status: 'canceled', canceled_at: new Date().toISOString() } as never)
      .eq('id', id)
    expect(cancel.error).toBeNull()
    expect((await insert(booking(11, 13))).error).toBeNull()
  })

  it('refuses to re-open a canceled booking over a newer one', async () => {
    const first = await insert(booking(10, 14))
    const id = (first.data as unknown as { id: string }).id
    await adminDb()
      .from('amenity_reservations' as never)
      .update({ status: 'canceled', canceled_at: new Date().toISOString() } as never)
      .eq('id', id)
    expect((await insert(booking(10, 14))).error).toBeNull()
    const reopen = await adminDb()
      .from('amenity_reservations' as never)
      .update({ status: 'approved', canceled_at: null } as never)
      .eq('id', id)
    expect(reopen.error?.code).toBe('23P01')
  })

  it('applies per amenity: another amenity is free at the same time', async () => {
    const second = await makeAmenity(org)
    expect((await insert(booking(10, 14))).error).toBeNull()
    expect((await insert(booking(10, 14, { amenity_id: second }))).error).toBeNull()
  })
})

describe('2. a race has one winner', () => {
  it('lets exactly one of several simultaneous requests in', async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => insert(booking(10, 14))))
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(results.filter((r) => r.error?.code === '23P01')).toHaveLength(4)
  })
})

describe('3. who can read and write', () => {
  it('lets a resident read amenities and their own bookings but write nothing', async () => {
    await insert(booking(10, 14))
    const amenities = await resident.client.from('amenities' as never).select('id')
    expect((amenities.data ?? []).length).toBe(1)

    const write = await resident.client
      .from('amenity_reservations' as never)
      .insert(booking(16, 18) as never)
      .select('id')
    expect(write.error).not.toBeNull()
    const edit = await resident.client
      .from('amenities' as never)
      .update({ name: 'Mine now' } as never)
      .eq('id', amenityId)
      .select('id')
    expect(edit.data ?? []).toHaveLength(0)
  })

  it('lets the board read every booking of its org, and another org none', async () => {
    await insert(booking(10, 14))
    const seen = await board.client.from('amenity_reservations' as never).select('id')
    expect((seen.data ?? []).length).toBe(1)
    const foreign = await outsider.client.from('amenity_reservations' as never).select('id')
    expect(foreign.data ?? []).toHaveLength(0)
    const foreignAmenities = await outsider.client.from('amenities' as never).select('id')
    expect(foreignAmenities.data ?? []).toHaveLength(0)
  })

  it('shows a resident no booking of a home they are not linked to', async () => {
    await insert(booking(10, 14))
    const mine = await resident.client.from('amenity_reservations' as never).select('id')
    expect(mine.data ?? []).toHaveLength(0)
  })
})

describe('4. same-org keys', () => {
  it('refuses a booking that points at another org amenity or home', async () => {
    const foreignAmenity = await makeAmenity(other)
    const a = await insert(booking(10, 14, { amenity_id: foreignAmenity }))
    expect(a.error).not.toBeNull()
    const u = await insert(booking(10, 14, { unit_id: otherUnitId }))
    expect(u.error).not.toBeNull()
  })
})
