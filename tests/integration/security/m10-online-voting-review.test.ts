/**
 * Migration 0075 (BL-156 online voting): adversarial cases from the independent
 * review. CI only (needs the replayed schema). Ids and counts only.
 *
 * Companion to m10-online-voting.test.ts; the setup is repeated so each file
 * stands alone.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from '../setup/env'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { psqlRows } from '../fixtures/psql'
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
const cast = (u: TestUser, sel: string[], property = propertyId) =>
  loose(u.client).rpc('cast_ballot', { p_ballot: ballotId, p_property: property, p_selections: sel })
const ballotBoxCount = async () => {
  const { count } = await loose(adminDb()).from('ballot_box').select('id', { count: 'exact', head: true }).eq('ballot_id', ballotId)
  return count
}

async function addHome(assocId: string, address: string, ownerUserId: string | null, validFrom = '2020-01-01') {
  const db = loose(adminDb())
  const { data: hp } = await db.from('hoa_properties').insert({ org_id: org.orgId, address }).select('id').single()
  const { data: unit } = await db
    .from('units')
    .insert({ organization_id: org.orgId, association_id: assocId, address_line1: address, legacy_hoa_property_id: hp.id })
    .select('id')
    .single()
  if (ownerUserId) {
    await db.from('ownerships').insert({ organization_id: org.orgId, unit_id: unit.id, owner_user_id: ownerUserId, valid_from: validFrom })
  }
  return { propertyId: hp.id as string, unitId: unit.id as string }
}

async function addCoOwner(): Promise<TestUser> {
  const spouse = await mintUser(org, 'resident')
  const { data: unit } = await loose(adminDb()).from('units').select('id').eq('legacy_hoa_property_id', propertyId).single()
  await loose(adminDb()).from('ownerships').insert({ organization_id: org.orgId, unit_id: unit.id, owner_user_id: spouse.id, valid_from: '2020-01-01' })
  return spouse
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  owner = await mintUser(org, 'resident')
  tenantUser = await mintUser(org, 'resident')
  const home = await addHome(org.associationId, `${randomUUID().slice(0, 6)} Test Lane`, owner.id)
  propertyId = home.propertyId
})

describe('0075 review: who may vote, and when', () => {
  it('co-owners share one vote, even when both submit at the same moment', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    const spouse = await addCoOwner()
    const results = await Promise.all([cast(owner, [optionIds[0]!]), cast(spouse, [optionIds[1]!])])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(await ballotBoxCount()).toBe(1)
    const voters = await loose(adminDb()).from('ballot_voters').select('id', { count: 'exact', head: true }).eq('ballot_id', ballotId)
    expect(voters.count).toBe(1)
  })

  it('twenty simultaneous casts from one home record exactly one vote', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    const results = await Promise.all(Array.from({ length: 20 }, () => cast(owner, [optionIds[0]!])))
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(await ballotBoxCount()).toBe(1)
  })

  it('a co-owner is told the home already voted, without learning who or what', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    const spouse = await addCoOwner()
    expect((await cast(owner, [optionIds[0]!])).error).toBeNull()
    expect((await loose(spouse.client).rpc('ballot_homes_voted', { p_ballot: ballotId })).data).toEqual([propertyId])
    expect((await loose(tenantUser.client).rpc('ballot_homes_voted', { p_ballot: ballotId })).data).toEqual([])
  })

  it('refuses a vote before the window opens', async () => {
    await seedBallot(seconds(3600), seconds(86_400))
    expect((await open()).error).toBeNull()
    expect((await cast(owner, [optionIds[0]!])).error).not.toBeNull()
    expect(await ballotBoxCount()).toBe(0)
  })

  it('refuses closing and counting before the deadline, even for the board', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    expect((await loose(board.client).rpc('close_ballot', { p_ballot: ballotId })).error).not.toBeNull()
    expect((await loose(board.client).rpc('ballot_results', { p_ballot: ballotId })).error).not.toBeNull()
  })

  it('an owner of a home in another association of the same organization cannot vote on this ballot', async () => {
    const { data: other } = await loose(adminDb())
      .from('associations')
      .insert({ organization_id: org.orgId, name: 'Second', state: 'FL', slug: `SECOND${randomUUID().slice(0, 6).toUpperCase()}` })
      .select('id')
      .single()
    const neighbour = await mintUser(org, 'resident')
    const home = await addHome(other.id, '9 Other Lane', neighbour.id)
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    expect((await cast(neighbour, [optionIds[0]!], home.propertyId)).error).not.toBeNull()
    expect(await ballotBoxCount()).toBe(0)
  })

  it('a member of another organization cannot see, vote on, close or count the ballot', async () => {
    await seedBallot(seconds(-60), seconds(3))
    await open()
    const otherOrg = await makeOrg()
    const outsider = await mintUser(otherOrg, 'board')
    expect((await loose(outsider.client).from('ballots').select('id').eq('id', ballotId)).data ?? []).toHaveLength(0)
    expect((await cast(outsider, [optionIds[0]!])).error).not.toBeNull()
    await new Promise((r) => setTimeout(r, 4000))
    expect((await loose(outsider.client).rpc('ballot_results', { p_ballot: ballotId })).error).not.toBeNull()
    expect((await loose(outsider.client).rpc('close_ballot', { p_ballot: ballotId })).error).not.toBeNull()
  })

  it('an ownership that has not started yet gives no vote', async () => {
    const future = await mintUser(org, 'resident')
    const home = await addHome(org.associationId, '5 Soon Street', future.id, '2999-01-01')
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    expect((await cast(future, [optionIds[0]!], home.propertyId)).error).not.toBeNull()
  })

  it('an owner of two homes votes once for each and no more', async () => {
    const home2 = await addHome(org.associationId, '2 Second Street', owner.id)
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    expect((await cast(owner, [optionIds[0]!])).error).toBeNull()
    expect((await cast(owner, [optionIds[1]!], home2.propertyId)).error).toBeNull()
    expect((await cast(owner, [optionIds[1]!], home2.propertyId)).error).not.toBeNull()
    expect(await ballotBoxCount()).toBe(2)
  })

  it('a resident who owns nothing cannot vote for someone else\'s home', async () => {
    const stranger = await mintUser(org, 'resident')
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    expect((await cast(stranger, [optionIds[0]!])).error).not.toBeNull()
  })

  it('a resident cannot see a draft ballot; the board can', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    expect((await loose(owner.client).from('ballots').select('id').eq('id', ballotId)).data ?? []).toHaveLength(0)
    expect((await loose(board.client).from('ballots').select('id').eq('id', ballotId)).data ?? []).toHaveLength(1)
  })

  it('nobody signed out can open, vote, close or count (CI re-grants EXECUTE on all routines to anon)', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    const anon = loose(createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }))
    const calls: Array<[string, Record<string, unknown>]> = [
      ['open_ballot', { p_ballot: ballotId, ...ACK }],
      ['cast_ballot', { p_ballot: ballotId, p_property: propertyId, p_selections: [optionIds[0]] }],
      ['close_ballot', { p_ballot: ballotId }],
      ['ballot_results', { p_ballot: ballotId }],
      ['ballot_homes_voted', { p_ballot: ballotId }],
    ]
    for (const [fn, args] of calls) expect((await anon.rpc(fn, args)).error, fn).not.toBeNull()
    const ids = await anon.rpc('ballot_voter_property_ids')
    if (!ids.error) expect(ids.data).toEqual([])
    expect((await anon.from('ballot_box').select('id')).data ?? []).toHaveLength(0)
    expect((await anon.from('ballot_voters').select('id')).data ?? []).toHaveLength(0)
  })
})

describe('0075 review: the choice cannot be traced to a person', () => {
  const cols = (t: string) =>
    psqlRows<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = '${t}' order by 1`,
    ).map((r) => r.column_name)

  it('the box has no user, home or time column, and the voter list has no choice or time of day', () => {
    expect(cols('ballot_box')).toEqual(['ballot_id', 'id', 'organization_id', 'selections'])
    expect(cols('ballot_voters')).toEqual(['ballot_id', 'id', 'organization_id', 'property_id', 'user_id', 'voted_on'])
  })

  it('ids are random, not time ordered, and the voter date has no time of day', () => {
    const rows = psqlRows<{ table_name: string; column_name: string; data_type: string; column_default: string | null }>(
      `select table_name, column_name, data_type, column_default from information_schema.columns
        where table_schema = 'public' and table_name in ('ballot_box', 'ballot_voters') and column_name in ('id', 'voted_on')`,
    )
    for (const c of rows.filter((x) => x.column_name === 'id')) expect(c.column_default).toContain('gen_random_uuid')
    expect(rows.find((c) => c.column_name === 'voted_on')?.data_type).toBe('date')
  })

  it('each stored choice list is sorted, so click order is not kept', async () => {
    const db = loose(adminDb())
    await seedBallot(seconds(-60), seconds(86_400))
    await db.from('ballots').update({ max_selections: 2 }).eq('id', ballotId)
    await open()
    const pick = [optionIds[2]!, optionIds[0]!]
    expect((await cast(owner, pick)).error).toBeNull()
    const { data } = await db.from('ballot_box').select('selections').eq('ballot_id', ballotId).single()
    expect(data.selections).toEqual([...pick].sort())
  })

  it('opening, voting and counting write no per-voter audit row', async () => {
    const db = loose(adminDb())
    await seedBallot(seconds(-60), seconds(3))
    await open()
    await cast(owner, [optionIds[0]!])
    await new Promise((r) => setTimeout(r, 4000))
    await loose(board.client).rpc('ballot_results', { p_ballot: ballotId })
    const { data } = await db.from('audit_log').select('action, user_id, metadata').eq('entity_id', ballotId)
    expect((data ?? []).map((r: { action: string }) => r.action).sort()).toEqual(['ballot.opened', 'ballot.results_viewed'])
    expect(JSON.stringify(data)).not.toContain(owner.id)
  })

  it('the board cannot read the box through the API', async () => {
    await seedBallot(seconds(-60), seconds(86_400))
    await open()
    await cast(owner, [optionIds[0]!])
    expect((await loose(board.client).from('ballot_box').select('*')).data ?? []).toHaveLength(0)
    await loose(board.client).from('ballot_box').update({ selections: [optionIds[1]] }).eq('ballot_id', ballotId)
    await loose(board.client).from('ballot_box').delete().eq('ballot_id', ballotId)
    const { data } = await loose(adminDb()).from('ballot_box').select('selections').eq('ballot_id', ballotId)
    expect(data).toEqual([{ selections: [optionIds[0]] }])
  })
})
