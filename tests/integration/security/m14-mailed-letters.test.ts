/**
 * Migration 0079 (migrations/0079_mailed_letters.sql, BL-032 print-and-mail)
 * against real Postgres. CI only (no local database).
 *
 *   1. A letter has exactly one source: an approval request (a collections
 *      letter) or a violation (a violation notice has no approval request).
 *      Neither, or both, is refused by the CHECK (23514).
 *   2. One send per source: a second row for the same approval request or the
 *      same violation is refused (23505).
 *   3. Same-org guards: an approval request or violation from another
 *      organization cannot be the source (23503).
 *   4. Reads: the board reads its own organization's rows, another
 *      organization's board and a resident read none.
 *   5. No web role can write: insert, update and delete are all refused.
 *
 * Fixture rule: adminDb() seeds; every RLS assertion runs through the user's
 * own client. Ids and counts only.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const db = () => adminDb() as unknown as { from(t: string): any }

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let otherBoard: TestUser
let resident: TestUser
let approvalId: string
let violationId: string
let otherApprovalId: string
let otherViolationId: string

async function insertOne(t: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await db().from(t).insert(row).select('id').single()
  if (error || !data) throw new Error(`seed ${t}: ${error?.code ?? 'no row'}`)
  return data.id as string
}

async function seedApproval(o: OrgFixture, proposedBy: string): Promise<string> {
  return insertOne('approval_requests', {
    organization_id: o.orgId,
    workflow_id: 'collections',
    action_type: 'collections.letter',
    subject_type: 'collection_case',
    subject_id: randomUUID(),
    payload: { v: 1 },
    summary: 'A letter',
    proposed_by: proposedBy,
  })
}

async function seedViolation(o: OrgFixture): Promise<string> {
  const property = await insertOne('hoa_properties', { org_id: o.orgId, address: '1 Test Lane' })
  return insertOne('hoa_violations', {
    org_id: o.orgId,
    property_id: property,
    violation_type: 'trash',
    description: 'bins',
    status: 'notice_sent',
    approved_letter: 'Please move the bins.',
    approved_at: new Date().toISOString(),
  })
}

function letter(source: { approval_request_id?: string | null; violation_id?: string | null }, o: OrgFixture = org, by: TestUser = board) {
  return {
    organization_id: o.orgId,
    association_id: o.associationId,
    provider: 'fake',
    mail_method: 'first_class',
    pages: 1,
    quoted_cents: 120,
    confirmed_cents: 120,
    confirmed_by: by.id,
    ...source,
  }
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  otherBoard = await mintUser(other, 'board')
  resident = await mintUser(org, 'resident')
  approvalId = await seedApproval(org, board.id)
  violationId = await seedViolation(org)
  otherApprovalId = await seedApproval(other, otherBoard.id)
  otherViolationId = await seedViolation(other)
})

describe('one source per letter', () => {
  it('accepts a letter from an approval request, and one from a violation', async () => {
    expect((await db().from('mailed_letters').insert(letter({ approval_request_id: approvalId }))).error).toBeNull()
    expect((await db().from('mailed_letters').insert(letter({ violation_id: violationId }))).error).toBeNull()
    const { count } = await db().from('mailed_letters').select('id', { count: 'exact', head: true })
    expect(count).toBe(2)
  })

  it('refuses a letter with no source, and one with both', async () => {
    expect((await db().from('mailed_letters').insert(letter({}))).error?.code).toBe('23514')
    expect(
      (await db().from('mailed_letters').insert(letter({ approval_request_id: approvalId, violation_id: violationId }))).error?.code,
    ).toBe('23514')
  })

  it('refuses a second send for the same approval request or the same violation', async () => {
    await db().from('mailed_letters').insert(letter({ approval_request_id: approvalId }))
    await db().from('mailed_letters').insert(letter({ violation_id: violationId }))
    expect((await db().from('mailed_letters').insert(letter({ approval_request_id: approvalId }))).error?.code).toBe('23505')
    expect((await db().from('mailed_letters').insert(letter({ violation_id: violationId }))).error?.code).toBe('23505')
  })

  it('cannot move a row to a second source by update', async () => {
    const id = await insertOne('mailed_letters', letter({ approval_request_id: approvalId }))
    const res = await db().from('mailed_letters').update({ violation_id: violationId }).eq('id', id)
    expect(res.error?.code).toBe('23514')
  })
})

describe('same-org guards', () => {
  it('refuses a source from another organization', async () => {
    expect((await db().from('mailed_letters').insert(letter({ approval_request_id: otherApprovalId }))).error?.code).toBe('23503')
    expect((await db().from('mailed_letters').insert(letter({ violation_id: otherViolationId }))).error?.code).toBe('23503')
  })

  it('refuses re-pointing an existing row at another organization’s violation', async () => {
    const id = await insertOne('mailed_letters', letter({ violation_id: violationId }))
    const res = await db().from('mailed_letters').update({ violation_id: otherViolationId }).eq('id', id)
    expect(res.error?.code).toBe('23503')
  })
})

describe('reads and writes through the web roles', () => {
  beforeEach(async () => {
    await insertOne('mailed_letters', letter({ approval_request_id: approvalId }))
    await insertOne('mailed_letters', letter({ violation_id: violationId }))
  })

  it('the board reads its own organization’s rows, both kinds', async () => {
    const { data, error } = await (board.client as any).from('mailed_letters').select('id, approval_request_id, violation_id')
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
    expect(data.filter((r: { violation_id: string | null }) => r.violation_id !== null)).toHaveLength(1)
  })

  it('another organization’s board and a resident read nothing', async () => {
    expect((await (otherBoard.client as any).from('mailed_letters').select('id')).data).toHaveLength(0)
    expect((await (resident.client as any).from('mailed_letters').select('id')).data).toHaveLength(0)
  })

  it('no web role can insert, update or delete', async () => {
    const ins = await (board.client as any).from('mailed_letters').insert(letter({ violation_id: otherViolationId }, org))
    expect(ins.error?.code).toBe('42501')
    // CI's schema replay re-grants table access, so these can be silently
    // filtered by RLS rather than refused. What matters is that nothing changes.
    await (board.client as any).from('mailed_letters').update({ status: 'delivered' }).eq('organization_id', org.orgId)
    await (board.client as any).from('mailed_letters').delete().eq('organization_id', org.orgId)
    const { data, count } = await db().from('mailed_letters').select('status', { count: 'exact' })
    expect(count).toBe(2)
    expect((data as { status: string }[]).some((r) => r.status === 'delivered')).toBe(false)
  })
})
