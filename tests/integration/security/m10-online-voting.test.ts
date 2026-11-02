/**
 * Migration 0075 (BL-156 online voting) against real Postgres. CI only.
 *
 * Secret ballot: the box has no reader; a home votes once; votes cannot be
 * changed or removed; nothing opens without the board's acknowledgement;
 * results wait for the deadline. Ids and counts only.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (c: unknown) => c as any

let org: OrgFixture
let board: TestUser
let owner: TestUser
let tenantUser: TestUser
let propertyId: string
let ballotId: string
let optionIds: string[]

async function seedBallot(opensAt: string, closesAt: string) {
  const db = loose(adminDb())
  const { data: b, error } = await db
    .from('ballots')
    .insert({
      organization_id: org.orgId, association_id: org.associationId, kind: 'election', title: 'Test',
      max_selections: 1, opens_at: opensAt, closes_at: closesAt,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  ballotId = b.id
  const { data: opts, error: oErr } = await db
    .from('ballot_options')
    .insert(['A', 'B', 'C'].map((label, position) => ({ organization_id: org.orgId, ballot_id: ballotId, label, position })))
    .select('id')
  expect(oErr).toBeNull()
  optionIds = opts.map((o: { id: string }) => o.id)
}

const seconds = (s: number) => new Date(Date.now() + s * 1000).toISOString()
const ACK = { p_basis: 'governing_documents', p_text_version: 'v1' }
const open = () => loose(board.client).rpc('open_ballot', { p_ballot: ballotId, ...ACK })
const cast = (u: TestUser, sel: string[]) =>
  loose(u.client).rpc('cast_ballot', { p_ballot: ballotId, p_property: propertyId, p_selections: sel })

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  owner = await mintUser(org, 'resident')
  tenantUser = await mintUser(org, 'resident')
  const db = loose(adminDb())
  const { data: hp } = await db
    .from('hoa_properties').insert({ org_id: org.orgId, address: `${randomUUID().slice(0, 6)} Test Lane` }).select('id').single()
  propertyId = hp.id
  const { data: unit } = await db
    .from('units')
    .insert({ organization_id: org.orgId, association_id: org.associationId, address_line1: 'x', legacy_hoa_property_id: propertyId })
    .select('id').single()
  await db.from('ownerships').insert({ organization_id: org.orgId, unit_id: unit.id, owner_user_id: owner.id, valid_from: '2020-01-01' })
  await db.from('property_residents').insert({
    organization_id: org.orgId, property_id: propertyId, full_name: 'T', email: tenantUser.email, role: 'tenant',
  })
})

describe('0075 online voting', () => {
  it('will not open without the acknowledgement, and the board can open with it', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    const direct = await loose(adminDb()).from('ballots').update({ status: 'open', opened_at: seconds(0) }).eq('id', ballotId)
    expect(direct.error).not.toBeNull()
    expect((await open()).error).toBeNull()
    expect((await open()).error).not.toBeNull()
  })

  it('a resident cannot open a ballot', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    const r = await loose(owner.client).rpc('open_ballot', { p_ballot: ballotId, ...ACK })
    expect(r.error).not.toBeNull()
  })

  it('an owner votes once per home; a tenant cannot vote', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    expect((await cast(tenantUser, [optionIds[0]!])).error).not.toBeNull()
    expect((await cast(owner, [optionIds[0]!])).error).toBeNull()
    expect((await cast(owner, [optionIds[1]!])).error).not.toBeNull()
    const { count } = await loose(adminDb()).from('ballot_box').select('id', { count: 'exact', head: true }).eq('ballot_id', ballotId)
    expect(count).toBe(1)
  })

  it('refuses too many choices and choices from elsewhere', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    expect((await cast(owner, [optionIds[0]!, optionIds[1]!])).error).not.toBeNull()
    expect((await cast(owner, [randomUUID()])).error).not.toBeNull()
  })

  it('nobody can read the box, and votes cannot be changed or removed, even by the service role', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    await cast(owner, [optionIds[0]!])
    const read = await loose(board.client).from('ballot_box').select('id')
    expect(read.error !== null || (read.data ?? []).length === 0).toBe(true)
    const db = loose(adminDb())
    expect((await db.from('ballot_box').update({ selections: [optionIds[1]] }).eq('ballot_id', ballotId)).error).not.toBeNull()
    expect((await db.from('ballot_box').delete().eq('ballot_id', ballotId)).error).not.toBeNull()
    expect((await db.from('ballot_voters').delete().eq('ballot_id', ballotId)).error).not.toBeNull()
    expect((await db.from('ballot_options').update({ label: 'Z' }).eq('ballot_id', ballotId)).error).not.toBeNull()
    expect((await db.from('ballots').delete().eq('id', ballotId)).error).not.toBeNull()
    expect((await db.from('ballots').update({ closes_at: seconds(-5) }).eq('id', ballotId)).error).not.toBeNull()
  })

  it('a resident cannot write ballot tables directly', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    const r = await loose(owner.client).from('ballot_voters').insert({
      organization_id: org.orgId, ballot_id: ballotId, property_id: propertyId, user_id: owner.id,
    })
    expect(r.error).not.toBeNull()
  })

  it('results wait for the deadline and are board only', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    await cast(owner, [optionIds[0]!])
    expect((await loose(board.client).rpc('ballot_results', { p_ballot: ballotId })).error).not.toBeNull()
    expect((await loose(owner.client).rpc('ballot_results', { p_ballot: ballotId })).error).not.toBeNull()
  })

  it('counts after the deadline, the box matches the voter list, and voting is shut', async () => {
    await seedBallot(seconds(-60), seconds(3))
    await open()
    expect((await cast(owner, [optionIds[1]!])).error).toBeNull()
    await new Promise((r) => setTimeout(r, 4000))
    expect((await cast(owner, [optionIds[0]!])).error).not.toBeNull()
    const res = await loose(board.client).rpc('ballot_results', { p_ballot: ballotId })
    expect(res.error).toBeNull()
    expect(res.data.homes_voted).toBe(1)
    expect(res.data.matches).toBe(true)
    const votes = Object.fromEntries(res.data.options.map((o: { option_id: string; votes: number }) => [o.option_id, o.votes]))
    expect(votes[optionIds[1]!]).toBe(1)
    expect((await loose(board.client).rpc('close_ballot', { p_ballot: ballotId })).error).toBeNull()
  })
})
