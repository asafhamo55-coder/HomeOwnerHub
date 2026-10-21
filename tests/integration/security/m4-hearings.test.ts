/**
 * Migration 0068 part 2 (migrations/0068_m4_batch.sql, batch M4, BL-133)
 * against real Postgres. CI only (no local database).
 *
 *   violation_hearings: board/admin of the org read and write; a resident
 *   and another org's board see nothing and write nothing; the violation
 *   must be the row's org's (23503, even for the service role); one row
 *   per violation (23505); the shape CHECK (scheduled/held need a date,
 *   held needs an outcome, an outcome needs held), the time format and the
 *   panel array are enforced (23514).
 *
 *   request_violation_hearing(): a resident records a request on a
 *   violation on their OWN home only (42501 for a neighbour's, another
 *   org's, or an anonymous caller), never on a closed one or with an
 *   over-long statement (22023); a second request keeps the first; a
 *   request on a row the board already scheduled sets only the request
 *   columns; the resident still cannot read the table directly.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only;
 * no PII. The table is not in the generated Database types until gen:types
 * runs after prod has 0068 (CLAUDE.md footgun 3), hence the casts.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const table = 'violation_hearings' as never
const rpc = 'request_violation_hearing' as never

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let admin: TestUser
let resident: TestUser
let neighbor: TestUser
let otherBoard: TestUser
let otherResident: TestUser
let vioMine: string
let vioNeighbor: string
let vioOther: string

async function insertOne(t: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb()
    .from(t as never)
    .insert(row as never)
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed ${t}: ${error?.code ?? 'no row'}`)
  return (data as { id: string }).id
}

/** A home (hoa_properties + its unit) owned by `owner`, and an open violation on it. */
async function homeWithViolation(f: OrgFixture, owner: TestUser): Promise<string> {
  const suffix = randomUUID().slice(0, 8)
  const prop = await insertOne('hoa_properties', { org_id: f.orgId, address: `${suffix} Hearing Way` })
  const unit = await insertOne('units', {
    organization_id: f.orgId,
    association_id: f.associationId,
    address_line1: `${suffix} Hearing Way`,
    legacy_hoa_property_id: prop,
  })
  await insertOne('ownerships', { organization_id: f.orgId, unit_id: unit, owner_user_id: owner.id, valid_from: '2024-01-01' })
  return insertOne('hoa_violations', { org_id: f.orgId, property_id: prop, violation_type: 'trash', description: 'bins out', status: 'notice_sent' })
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  admin = await mintUser(org, 'admin')
  resident = await mintUser(org, 'resident')
  neighbor = await mintUser(org, 'resident')
  otherBoard = await mintUser(other, 'board')
  otherResident = await mintUser(other, 'resident')
  vioMine = await homeWithViolation(org, resident)
  vioNeighbor = await homeWithViolation(org, neighbor)
  vioOther = await homeWithViolation(other, otherResident)
})

const row = (extra: Record<string, unknown> = {}) => ({
  organization_id: org.orgId,
  violation_id: vioMine,
  status: 'scheduled',
  hearing_on: '2026-11-20',
  hearing_time: '18:30',
  location: 'Clubhouse',
  panel: [
    { name: 'A', role: 'member' },
    { name: 'B', role: 'member' },
    { name: 'C', role: 'member' },
  ],
  notice_sent_on: '2026-11-01',
  ...extra,
})

describe('violation_hearings RLS (board/admin only)', () => {
  it('board and admin write and read their org’s rows; created_by defaults to the caller', async () => {
    const { error } = await board.client.from(table).insert(row() as never)
    expect(error).toBeNull()
    const { data } = await admin.client.from(table).select('violation_id, created_by').eq('organization_id' as never, org.orgId)
    expect(data).toEqual([{ violation_id: vioMine, created_by: board.id }])
    const up = await admin.client.from(table).update({ status: 'held', outcome: 'upheld' } as never).eq('violation_id' as never, vioMine).select('id')
    expect(up.error).toBeNull()
    expect(up.data ?? []).toHaveLength(1)
  })

  it('a resident (even the owner) and another org’s board see nothing and write nothing', async () => {
    await adminDb().from(table).insert(row() as never)
    for (const user of [resident, neighbor, otherBoard]) {
      const { data } = await user.client.from(table).select('id')
      expect(data ?? []).toHaveLength(0)
    }
    const asResident = await resident.client.from(table).insert(row({ violation_id: vioNeighbor }) as never)
    expect(asResident.error?.code).toBe('42501')
    const asOther = await otherBoard.client.from(table).insert(row({ violation_id: vioNeighbor }) as never)
    expect(asOther.error?.code).toBe('42501')
    const upd = await resident.client.from(table).update({ outcome: 'dismissed' } as never).eq('violation_id' as never, vioMine).select('id')
    expect(upd.data ?? []).toHaveLength(0)
    const del = await otherBoard.client.from(table).delete().eq('organization_id' as never, org.orgId).select('id')
    expect(del.data ?? []).toHaveLength(0)
    const { count } = await adminDb().from(table).select('id', { count: 'exact', head: true })
    expect(count).toBe(1)
  })

  it("another org's violation is refused with 23503 (even for the service role)", async () => {
    // A board member of both orgs: RLS passes on organization_id, the trigger refuses.
    await adminDb().from('org_members').insert({ org_id: other.orgId, user_id: board.id, role: 'board' })
    const asBoard = await board.client.from(table).insert(row({ violation_id: vioOther }) as never)
    expect(asBoard.error?.code).toBe('23503')
    const asService = await adminDb().from(table).insert(row({ violation_id: vioOther }) as never)
    expect(asService.error?.code).toBe('23503')
  })

  it('one row per violation (23505)', async () => {
    await board.client.from(table).insert(row() as never)
    const dup = await board.client.from(table).insert(row() as never)
    expect(dup.error?.code).toBe('23505')
  })

  it('the shape, time and panel CHECKs (23514)', async () => {
    const bad = [
      row({ status: 'held', outcome: null }),
      row({ status: 'scheduled', outcome: 'upheld' }),
      row({ hearing_on: null }),
      row({ hearing_time: '6pm' }),
      row({ panel: { name: 'A' } }),
      row({ outcome: 'maybe', status: 'held' }),
    ]
    for (const r of bad) {
      const { error } = await adminDb().from(table).insert(r as never)
      expect(error?.code).toBe('23514')
    }
    const ok = await adminDb().from(table).insert(row({ status: 'requested', hearing_on: null, hearing_time: null }) as never)
    expect(ok.error).toBeNull()
  })

  it('deleting the violation removes its hearing', async () => {
    await adminDb().from(table).insert(row() as never)
    await adminDb().from('hoa_violations').delete().eq('id', vioMine)
    const { count } = await adminDb().from(table).select('id', { count: 'exact', head: true })
    expect(count).toBe(0)
  })
})

describe('request_violation_hearing()', () => {
  it('a resident records a request on their own home; a second request keeps the first', async () => {
    const first = await resident.client.rpc(rpc, { p_violation_id: vioMine, p_statement: 'I fixed it' } as never)
    expect(first.error).toBeNull()
    expect(typeof first.data).toBe('string')
    const { data: rows } = await adminDb()
      .from(table)
      .select('organization_id, status, requested_by, resident_statement, requested_at' as never)
      .eq('violation_id' as never, vioMine)
    expect(rows).toHaveLength(1)
    expect(rows![0]).toMatchObject({ organization_id: org.orgId, status: 'requested', requested_by: resident.id, resident_statement: 'I fixed it' })

    const second = await resident.client.rpc(rpc, { p_violation_id: vioMine, p_statement: 'changed my mind' } as never)
    expect(second.error).toBeNull()
    expect(second.data).toBe(first.data)
    const { data: after } = await adminDb().from(table).select('resident_statement' as never).eq('violation_id' as never, vioMine).single()
    expect((after as unknown as { resident_statement: string }).resident_statement).toBe('I fixed it')
  })

  it('a neighbour’s, another org’s, or an anonymous request is refused with 42501', async () => {
    expect((await resident.client.rpc(rpc, { p_violation_id: vioNeighbor } as never)).error?.code).toBe('42501')
    expect((await resident.client.rpc(rpc, { p_violation_id: vioOther } as never)).error?.code).toBe('42501')
    expect((await otherResident.client.rpc(rpc, { p_violation_id: vioMine } as never)).error?.code).toBe('42501')
    // Board members have no home here either: the function is for residents' own homes only.
    expect((await board.client.rpc(rpc, { p_violation_id: vioMine } as never)).error?.code).toBe('42501')
    const { count } = await adminDb().from(table).select('id', { count: 'exact', head: true })
    expect(count).toBe(0)
  })

  it('a closed violation or an over-long statement is refused with 22023', async () => {
    expect((await resident.client.rpc(rpc, { p_violation_id: vioMine, p_statement: 'x'.repeat(4001) } as never)).error?.code).toBe('22023')
    await adminDb().from('hoa_violations').update({ status: 'resolved' }).eq('id', vioMine)
    expect((await resident.client.rpc(rpc, { p_violation_id: vioMine } as never)).error?.code).toBe('22023')
  })

  it('on a row the board already scheduled, only the request columns change', async () => {
    await board.client.from(table).insert(row() as never)
    const res = await resident.client.rpc(rpc, { p_violation_id: vioMine, p_statement: 'please hear me' } as never)
    expect(res.error).toBeNull()
    const { data } = await adminDb()
      .from(table)
      .select('status, hearing_on, panel, notice_sent_on, requested_by, resident_statement' as never)
      .eq('violation_id' as never, vioMine)
      .single()
    expect(data).toMatchObject({
      status: 'scheduled',
      hearing_on: '2026-11-20',
      notice_sent_on: '2026-11-01',
      requested_by: resident.id,
      resident_statement: 'please hear me',
    })
    expect((data as unknown as { panel: unknown[] }).panel).toHaveLength(3)
    // …and the resident still can't read the row through PostgREST.
    const { data: seen } = await resident.client.from(table).select('id')
    expect(seen ?? []).toHaveLength(0)
  })
})
