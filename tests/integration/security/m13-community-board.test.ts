/**
 * Migration 0078 (migrations/0078_community_board.sql, B5 community board)
 * against real Postgres. CI only (no local database).
 *
 *   1. A resident reads the threads and posts of their own association and
 *      never a hidden post; another association's resident reads nothing.
 *   2. The board reads everything in its org, hidden posts included.
 *   3. No web role can write: insert, update and delete are all refused.
 *   4. Reports: a reporter reads only their own; the board reads the queue.
 *   5. A post cannot point at another association's thread.
 *
 * Fixture rule: adminDb() seeds; every RLS assertion runs through the user's
 * own client. Ids and counts only.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, makeUnit, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let board: TestUser
let resident: TestUser
let outsider: TestUser
let otherAssocId: string
let threadId: string
let visiblePostId: string
let hiddenPostId: string

const db = () => adminDb() as unknown as { from(t: string): any }

async function ownUnit(user: TestUser, o: OrgFixture) {
  const unit = await makeUnit(o)
  const { error } = await adminDb()
    .from('ownerships')
    .insert({ organization_id: o.orgId, unit_id: unit, owner_user_id: user.id, valid_from: '2024-01-01' })
  if (error) throw new Error(`seed ownership: ${error.code}`)
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  resident = await mintUser(org, 'resident')
  outsider = await mintUser(org, 'resident')
  await ownUnit(resident, org)

  // A second association in the same org, with its own resident.
  const { data: other, error } = await adminDb()
    .from('associations')
    .insert({ organization_id: org.orgId, name: 'Second Association', state: 'FL', slug: 'SECONDASSOC' } as never)
    .select('id')
    .single()
  if (error || !other) throw new Error(`seed association: ${error?.code}`)
  otherAssocId = other.id
  const otherUnit = await adminDb()
    .from('units')
    .insert({ organization_id: org.orgId, association_id: otherAssocId, address_line1: '9 Other Lane' })
    .select('id')
    .single()
  await adminDb()
    .from('ownerships')
    .insert({ organization_id: org.orgId, unit_id: otherUnit.data!.id, owner_user_id: outsider.id, valid_from: '2024-01-01' })

  const t = await db()
    .from('board_threads')
    .insert({ organization_id: org.orgId, association_id: org.associationId, title: 'Pool hours', created_by: resident.id })
    .select('id')
    .single()
  threadId = t.data.id
  const base = {
    organization_id: org.orgId,
    association_id: org.associationId,
    thread_id: threadId,
    author_id: resident.id,
    author_label: 'Test R.',
  }
  const p1 = await db().from('board_posts').insert({ ...base, body: 'Opening', is_opening: true }).select('id').single()
  visiblePostId = p1.data.id
  const p2 = await db()
    .from('board_posts')
    .insert({ ...base, body: 'Rude reply', hidden_at: new Date().toISOString(), hidden_by: board.id })
    .select('id')
    .single()
  hiddenPostId = p2.data.id
})

describe('reads', () => {
  it('a resident reads their association, minus hidden posts', async () => {
    const th = await (resident.client as any).from('board_threads').select('id')
    expect(th.data).toHaveLength(1)
    const posts = await (resident.client as any).from('board_posts').select('id')
    expect(posts.data.map((p: { id: string }) => p.id)).toEqual([visiblePostId])
  })

  it("a resident of another association reads nothing", async () => {
    const th = await (outsider.client as any).from('board_threads').select('id')
    expect(th.data).toHaveLength(0)
    const posts = await (outsider.client as any).from('board_posts').select('id')
    expect(posts.data).toHaveLength(0)
  })

  it('a member with no unit reads nothing', async () => {
    const nobody = await mintUser(org, 'resident')
    const th = await (nobody.client as any).from('board_threads').select('id')
    expect(th.data).toHaveLength(0)
  })

  it('the board reads hidden posts too', async () => {
    const posts = await (board.client as any).from('board_posts').select('id')
    expect(posts.data.map((p: { id: string }) => p.id).sort()).toEqual([visiblePostId, hiddenPostId].sort())
  })
})

describe('writes are server-only', () => {
  it('refuses insert, update and delete from a resident and from the board', async () => {
    for (const u of [resident, board]) {
      const c = u.client as any
      const ins = await c.from('board_posts').insert({
        organization_id: org.orgId,
        association_id: org.associationId,
        thread_id: threadId,
        author_label: 'x',
        body: 'x',
      })
      expect(ins.error, 'insert').not.toBeNull()
      await c.from('board_posts').update({ hidden_at: null }).eq('id', hiddenPostId)
      const still = await db().from('board_posts').select('hidden_at').eq('id', hiddenPostId).single()
      expect(still.data.hidden_at, 'update').not.toBeNull()
      await c.from('board_threads').delete().eq('id', threadId)
      const t = await db().from('board_threads').select('id').eq('id', threadId)
      expect(t.data, 'delete').toHaveLength(1)
    }
  })
})

describe('reports', () => {
  it('a reporter reads only their own; the board reads the queue; one report per person', async () => {
    const row = {
      organization_id: org.orgId,
      association_id: org.associationId,
      post_id: visiblePostId,
      reason: 'Off topic',
    }
    expect((await db().from('board_post_reports').insert({ ...row, reported_by: resident.id })).error).toBeNull()
    const again = await db().from('board_post_reports').insert({ ...row, reported_by: resident.id })
    expect(again.error?.code).toBe('23505')

    const mine = await (resident.client as any).from('board_post_reports').select('id')
    expect(mine.data).toHaveLength(1)
    const theirs = await (outsider.client as any).from('board_post_reports').select('id')
    expect(theirs.data).toHaveLength(0)
    const queue = await (board.client as any).from('board_post_reports').select('id')
    expect(queue.data).toHaveLength(1)
  })
})

describe('same-association keys', () => {
  it('refuses a post whose association differs from its thread', async () => {
    const { error } = await db().from('board_posts').insert({
      organization_id: org.orgId,
      association_id: otherAssocId,
      thread_id: threadId,
      author_label: 'x',
      body: 'x',
    })
    expect(error?.code).toBe('23503')
  })
})

describe('community_board_association_ids()', () => {
  it('returns the caller own association only', async () => {
    const { data } = await (resident.client as any).rpc('community_board_association_ids')
    expect(data).toEqual([org.associationId])
  })
})
