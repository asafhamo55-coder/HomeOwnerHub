/**
 * Migration 0076 (BL-034 amenity reservations) against real Postgres. CI only
 * (no local database).
 *
 *   1. the database refuses an overlapping pending or approved booking
 *      (23P01), allows back to back and allows a slot whose holder canceled;
 *   2. two requests for the same slot made at the same moment: exactly one wins;
 *   3. a resident cannot write either table through their own client, and
 *      reads only their home's bookings; another org sees nothing;
 *   4. a booking cannot point at another org's amenity (same-org trigger);
 *   5. concurrent_limit N lets exactly N overlapping holds in, also under a race;
 *   6. a board hold has no home, a booking without one is refused, and a
 *      resident never reads the hold;
 *   7. amenity_hours and amenity_blackouts: members read, nobody writes through
 *      their own client, another org sees nothing, and neither can point at
 *      another org's amenity.
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
  await adminDb()
    .from('ownerships')
    .insert({ organization_id: org.orgId, unit_id: unitId, owner_user_id: resident.id, valid_from: '2020-01-01' } as never)
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
    // a neighbouring home in the same association and org: the resident owns unitId, not this one
    const neighbourUnit = await makeUnit(org)
    await insert(booking(10, 14, { unit_id: neighbourUnit }))
    const none = await resident.client.from('amenity_reservations' as never).select('id')
    expect(none.data ?? []).toHaveLength(0)
    // and their own home's booking is visible, so the empty result above is the policy and not a broken read
    await insert(booking(15, 17))
    const mine = await resident.client.from('amenity_reservations' as never).select('id, unit_id')
    expect((mine.data ?? []).map((r) => (r as unknown as { unit_id: string }).unit_id)).toEqual([unitId])
  })
})

describe('3b. association boundary inside one organization', () => {
  it('a resident of another association sees no amenity, hours or blackout of this one; the board sees all', async () => {
    const { data: second } = await adminDb()
      .from('associations')
      .insert({ organization_id: org.orgId, name: 'Second', state: 'FL', slug: `SECOND${Math.random().toString(36).slice(2, 8).toUpperCase()}` } as never)
      .select('id')
      .single()
    const secondId = (second as unknown as { id: string }).id
    const { data: otherUnit } = await adminDb()
      .from('units')
      .insert({ organization_id: org.orgId, association_id: secondId, address_line1: '9 Other Lane' } as never)
      .select('id')
      .single()
    const neighbour = await mintUser(org, 'resident')
    await adminDb()
      .from('ownerships')
      .insert({ organization_id: org.orgId, unit_id: (otherUnit as unknown as { id: string }).id, owner_user_id: neighbour.id, valid_from: '2020-01-01' } as never)
    await adminDb().from('amenity_hours' as never).insert({ organization_id: org.orgId, amenity_id: amenityId, weekday: 6, open_hour: 10, close_hour: 18 } as never)
    await adminDb().from('amenity_blackouts' as never).insert({ organization_id: org.orgId, amenity_id: amenityId, starts_on: '2030-12-24', ends_on: '2030-12-26', reason: 'Closed' } as never)

    for (const t of ['amenities', 'amenity_hours', 'amenity_blackouts']) {
      expect(((await neighbour.client.from(t as never).select('id')).data ?? []), t).toHaveLength(0)
      expect(((await resident.client.from(t as never).select('id')).data ?? []), t).toHaveLength(1)
      expect(((await board.client.from(t as never).select('id')).data ?? []), t).toHaveLength(1)
    }
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

async function setLimit(id: string, limit: number) {
  const r = await adminDb()
    .from('amenities' as never)
    .update({ concurrent_limit: limit } as never)
    .eq('id', id)
  if (r.error) throw new Error(`seed limit: ${r.error.code}`)
}

describe('5. concurrent bookings', () => {
  it('allows overlaps up to the limit and refuses the next one', async () => {
    await setLimit(amenityId, 2)
    expect((await insert(booking(10, 14))).error).toBeNull()
    expect((await insert(booking(12, 16))).error).toBeNull()
    expect((await insert(booking(13, 15))).error?.code).toBe('23P01')
    // outside both holds there is still room
    expect((await insert(booking(16, 18))).error).toBeNull()
    expect((await insert(booking(8, 10))).error).toBeNull()
  })

  it('lets exactly the limit of simultaneous requests in', async () => {
    await setLimit(amenityId, 3)
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => insert(booking(10, 14))))
    expect(results.filter((r) => r.error === null)).toHaveLength(3)
    expect(results.filter((r) => r.error?.code === '23P01')).toHaveLength(3)
  })

  it('frees a place when one of the holds is canceled', async () => {
    await setLimit(amenityId, 1)
    const first = await insert(booking(10, 14))
    expect((await insert(booking(11, 12))).error?.code).toBe('23P01')
    await adminDb()
      .from('amenity_reservations' as never)
      .update({ status: 'canceled', canceled_at: new Date().toISOString() } as never)
      .eq('id', (first.data as unknown as { id: string }).id)
    expect((await insert(booking(11, 12))).error).toBeNull()
  })

  it('refuses a limit outside 1 to 50', async () => {
    const r = await adminDb()
      .from('amenities' as never)
      .update({ concurrent_limit: 0 } as never)
      .eq('id', amenityId)
    expect(r.error).not.toBeNull()
  })
})

describe('6. board holds', () => {
  it('stores a hold without a home, takes the time, and hides it from a resident', async () => {
    const hold = await insert(booking(10, 12, { unit_id: null, kind: 'hold', status: 'approved', purpose: 'Pool cleaning' }))
    expect(hold.error).toBeNull()
    expect((await insert(booking(11, 13))).error?.code).toBe('23P01')
    const seen = await resident.client.from('amenity_reservations' as never).select('id')
    expect(seen.data ?? []).toHaveLength(0)
    const board_ = await board.client.from('amenity_reservations' as never).select('id')
    expect((board_.data ?? []).length).toBe(1)
  })

  it('refuses a booking without a home', async () => {
    const r = await insert(booking(10, 12, { unit_id: null }))
    expect(r.error).not.toBeNull()
  })
})

describe('7. weekly hours and blackout dates', () => {
  const hours = (o: OrgFixture, id: string, weekday = 6) => ({
    organization_id: o.orgId,
    amenity_id: id,
    weekday,
    open_hour: 10,
    close_hour: 18,
  })
  const blackout = (o: OrgFixture, id: string) => ({
    organization_id: o.orgId,
    amenity_id: id,
    starts_on: '2030-12-24',
    ends_on: '2030-12-26',
    reason: 'Closed for the holidays',
  })

  it('lets the server write them and refuses a duplicate weekday or a backwards range', async () => {
    const a = await adminDb().from('amenity_hours' as never).insert(hours(org, amenityId) as never)
    expect(a.error).toBeNull()
    const dup = await adminDb().from('amenity_hours' as never).insert(hours(org, amenityId) as never)
    expect(dup.error).not.toBeNull()
    const bad = await adminDb()
      .from('amenity_blackouts' as never)
      .insert({ ...blackout(org, amenityId), starts_on: '2030-12-27' } as never)
    expect(bad.error).not.toBeNull()
  })

  it('lets members read them, nobody write them, and another org see nothing', async () => {
    await adminDb().from('amenity_hours' as never).insert(hours(org, amenityId) as never)
    await adminDb().from('amenity_blackouts' as never).insert(blackout(org, amenityId) as never)

    const h = await resident.client.from('amenity_hours' as never).select('id')
    const b = await resident.client.from('amenity_blackouts' as never).select('id')
    expect((h.data ?? []).length).toBe(1)
    expect((b.data ?? []).length).toBe(1)

    const writeH = await resident.client.from('amenity_hours' as never).insert(hours(org, amenityId, 2) as never).select('id')
    expect(writeH.error).not.toBeNull()
    const writeB = await board.client.from('amenity_blackouts' as never).insert(blackout(org, amenityId) as never).select('id')
    expect(writeB.error).not.toBeNull()
    const del = await board.client.from('amenity_hours' as never).delete().eq('amenity_id', amenityId).select('id')
    expect(del.data ?? []).toHaveLength(0)

    const foreignH = await outsider.client.from('amenity_hours' as never).select('id')
    const foreignB = await outsider.client.from('amenity_blackouts' as never).select('id')
    expect(foreignH.data ?? []).toHaveLength(0)
    expect(foreignB.data ?? []).toHaveLength(0)
  })

  it('refuses a row that points at another org amenity', async () => {
    const foreign = await makeAmenity(other)
    const h = await adminDb().from('amenity_hours' as never).insert(hours(org, foreign) as never)
    expect(h.error).not.toBeNull()
    const b = await adminDb().from('amenity_blackouts' as never).insert(blackout(org, foreign) as never)
    expect(b.error).not.toBeNull()
  })
})
