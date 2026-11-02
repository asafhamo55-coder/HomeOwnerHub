/**
 * M9 / B1 informal polls (migrations/0074_polls.sql). CI only (no local DB).
 *
 * Pins: one answer per home, answers only through submit_poll_response(),
 * a resident reads only their own home's answer, the board reads tallies and
 * never names, results hidden from residents until close unless live, a
 * resident of another org reaches nothing, a closed poll takes no answers,
 * and the lifecycle never goes backwards.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every assertion runs
 * through a real user JWT client. Ids and counts only.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, makeUnit, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'

// The M9 objects are not in the generated Database types yet.
/* eslint-disable @typescript-eslint/no-explicit-any */
const loose = (c: unknown) => c as any

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let alice: TestUser
let bob: TestUser
let outsider: TestUser
let unitA: string
let unitB: string
let pollId: string
let optYes: string
let optNo: string

async function ownUnit(o: OrgFixture, u: TestUser, unit: string) {
  const { error } = await adminDb()
    .from('ownerships')
    .insert({ organization_id: o.orgId, unit_id: unit, owner_user_id: u.id, valid_from: '2024-01-01' })
  if (error) throw new Error(`seed ownership: ${error.message}`)
}

beforeAll(async () => {
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  alice = await mintUser(org, 'resident')
  bob = await mintUser(org, 'resident')
  outsider = await mintUser(other, 'resident')
  unitA = await makeUnit(org)
  unitB = await makeUnit(org)
  const unitOther = await makeUnit(other)
  await ownUnit(org, alice, unitA)
  await ownUnit(org, bob, unitB)
  await ownUnit(other, outsider, unitOther)

  const p = await loose(board.client)
    .from('polls')
    .insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      title: 'Pool hours test',
      created_by: board.id,
      status: 'draft',
    })
    .select('id')
    .single()
  if (p.error) throw new Error(`seed poll: ${p.error.code}`)
  pollId = p.data.id
  const o = await loose(board.client)
    .from('poll_options')
    .insert([
      { organization_id: org.orgId, poll_id: pollId, label: 'Yes', position: 0 },
      { organization_id: org.orgId, poll_id: pollId, label: 'No', position: 1 },
    ])
    .select('id, label')
  if (o.error) throw new Error(`seed options: ${o.error.code}`)
  optYes = o.data.find((x: any) => x.label === 'Yes').id
  optNo = o.data.find((x: any) => x.label === 'No').id
})

describe('polls (0074)', () => {
  it('a resident cannot see a draft; cannot create or edit polls', async () => {
    const r = await loose(alice.client).from('polls').select('id').eq('id', pollId)
    expect(r.data).toEqual([])
    const ins = await loose(alice.client)
      .from('polls')
      .insert({ organization_id: org.orgId, association_id: org.associationId, title: 'Nope poll', status: 'draft' })
    expect(ins.error).not.toBeNull()
  })

  it('a poll needs two options to open, then residents see it', async () => {
    const up = await loose(board.client).from('polls').update({ status: 'open' }).eq('id', pollId)
    expect(up.error).toBeNull()
    const r = await loose(alice.client).from('polls').select('id').eq('id', pollId)
    expect(r.data).toHaveLength(1)
    const o = await loose(outsider.client).from('polls').select('id').eq('id', pollId)
    expect(o.data).toEqual([])
  })

  it('options are frozen once the poll is open', async () => {
    const ins = await loose(board.client)
      .from('poll_options')
      .insert({ organization_id: org.orgId, poll_id: pollId, label: 'Late', position: 2 })
    expect(ins.error).not.toBeNull()
  })

  it('answers are written only by the function', async () => {
    const direct = await loose(alice.client)
      .from('poll_responses')
      .insert({ organization_id: org.orgId, association_id: org.associationId, poll_id: pollId, unit_id: unitA })
    expect(direct.error).not.toBeNull()
  })

  it('one answer per home: a second submit replaces the first', async () => {
    const a1 = await loose(alice.client).rpc('submit_poll_response', {
      p_poll_id: pollId,
      p_unit_id: unitA,
      p_option_ids: [optYes],
    })
    expect(a1.error).toBeNull()
    const a2 = await loose(alice.client).rpc('submit_poll_response', {
      p_poll_id: pollId,
      p_unit_id: unitA,
      p_option_ids: [optNo],
    })
    expect(a2.error).toBeNull()
    const { count } = await adminDb()
      .from('poll_responses' as never)
      .select('id', { count: 'exact', head: true })
      .eq('poll_id', pollId)
      .eq('unit_id', unitA)
    expect(count).toBe(1)
    // The raw uniqueness rule, below the function.
    const dup = await adminDb()
      .from('poll_responses' as never)
      .insert({ organization_id: org.orgId, association_id: org.associationId, poll_id: pollId, unit_id: unitA } as never)
    expect(dup.error?.code).toBe('23505')
  })

  it('a pick-one poll refuses two answers; a stranger option is refused', async () => {
    const two = await loose(bob.client).rpc('submit_poll_response', {
      p_poll_id: pollId,
      p_unit_id: unitB,
      p_option_ids: [optYes, optNo],
    })
    expect(two.error?.code).toBe('22023')
    const none = await loose(bob.client).rpc('submit_poll_response', {
      p_poll_id: pollId,
      p_unit_id: unitB,
      p_option_ids: [],
    })
    expect(none.error?.code).toBe('22023')
  })

  it("a resident cannot answer for a neighbour's home or from another org", async () => {
    const neighbour = await loose(alice.client).rpc('submit_poll_response', {
      p_poll_id: pollId,
      p_unit_id: unitB,
      p_option_ids: [optYes],
    })
    expect(neighbour.error?.code).toBe('42501')
    const stranger = await loose(outsider.client).rpc('submit_poll_response', {
      p_poll_id: pollId,
      p_unit_id: unitA,
      p_option_ids: [optYes],
    })
    expect(stranger.error?.code).toBe('42501')
  })

  it('a resident reads only their own answer; the board reads no answer rows', async () => {
    await loose(bob.client).rpc('submit_poll_response', { p_poll_id: pollId, p_unit_id: unitB, p_option_ids: [optYes] })
    const mine = await loose(alice.client).from('poll_responses').select('unit_id').eq('poll_id', pollId)
    expect(mine.data).toEqual([{ unit_id: unitA }])
    const boardRows = await loose(board.client).from('poll_responses').select('id').eq('poll_id', pollId)
    expect(boardRows.data).toEqual([])
  })

  it('results: hidden from residents while open (after_close), always visible to the board', async () => {
    const res = await loose(alice.client).rpc('poll_results', { p_poll_id: pollId })
    expect(res.error?.code).toBe('42501')
    const b = await loose(board.client).rpc('poll_results', { p_poll_id: pollId })
    expect(b.error).toBeNull()
    const tally = Object.fromEntries(b.data.map((r: any) => [r.label, Number(r.votes)]))
    expect(tally).toEqual({ Yes: 1, No: 1 })
    expect(Number(b.data[0].homes_answered)).toBe(2)
  })

  it('closing: residents see results, no more answers, no reopening', async () => {
    const close = await loose(board.client).from('polls').update({ status: 'closed' }).eq('id', pollId)
    expect(close.error).toBeNull()
    const res = await loose(alice.client).rpc('poll_results', { p_poll_id: pollId })
    expect(res.error).toBeNull()
    const late = await loose(alice.client).rpc('submit_poll_response', {
      p_poll_id: pollId,
      p_unit_id: unitA,
      p_option_ids: [optYes],
    })
    expect(late.error?.code).toBe('55000')
    const reopen = await loose(board.client).from('polls').update({ status: 'open' }).eq('id', pollId)
    expect(reopen.error).not.toBeNull()
    const out = await loose(outsider.client).rpc('poll_results', { p_poll_id: pollId })
    expect(out.error?.code).toBe('42501')
  })
})
