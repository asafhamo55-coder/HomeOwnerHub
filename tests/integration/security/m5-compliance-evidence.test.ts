/**
 * Migration 0069 part 4 (migrations/0069_m5_batch.sql, batch M5, BL-145
 * compliance_deadlines_done.document_id) against real Postgres. CI only (no
 * local database).
 *
 *   - the column exists, is nullable (a done row needs no evidence), and a
 *     board or admin of the org sets, changes and clears it on their own
 *     org's rows;
 *   - the document must be the row's org's: another org's document is
 *     refused with 23503 on insert and on update, also for the service
 *     role and for a board member of both orgs;
 *   - deleting the document clears the link and keeps the "done";
 *   - attaching evidence never changes done_by (0067 SEC-N6 still holds);
 *   - a resident and another org's board can't see or change it (0067 RLS
 *     covers the new column).
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only;
 * no PII. The column is not in the generated Database types until gen:types
 * runs after prod has 0069 (CLAUDE.md footgun 3), hence the casts.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from '../setup/env'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let admin: TestUser
let resident: TestUser
let otherBoard: TestUser
let myDoc: string
let theirDoc: string

const table = 'compliance_deadlines_done' as never
const CODE = 'ga-sos-registration-2027'

const row = (extra: Record<string, unknown> = {}) => ({
  organization_id: org.orgId,
  association_id: org.associationId,
  code: CODE,
  done_at: '2026-10-21T12:00:00Z',
  ...extra,
})

async function makeDocument(f: OrgFixture): Promise<string> {
  const { data, error } = await adminDb()
    .from('hoa_documents')
    .insert({ org_id: f.orgId, name: 'Registration receipt', type: 'other', storage_path: `${f.orgId}/compliance/${randomUUID()}/receipt.pdf` } as never)
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed hoa_documents: ${error?.code ?? 'no row'}`)
  return (data as { id: string }).id
}

async function documentIdOf(code = CODE): Promise<string | null | undefined> {
  const { data } = await adminDb().from(table).select('document_id').eq('code' as never, code).maybeSingle()
  return (data as unknown as { document_id: string | null } | null)?.document_id
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  admin = await mintUser(org, 'admin')
  resident = await mintUser(org, 'resident')
  otherBoard = await mintUser(other, 'board')
  myDoc = await makeDocument(org)
  theirDoc = await makeDocument(other)
})

describe('0069 part 4: compliance_deadlines_done.document_id (BL-145)', () => {
  it('a done row needs no evidence; the board marks done with its own org’s document', async () => {
    const bare = await board.client.from(table).insert(row({ code: 'tx-management-certificate' }) as never)
    expect(bare.error).toBeNull()
    expect(await documentIdOf('tx-management-certificate')).toBeNull()

    const withDoc = await board.client.from(table).insert(row({ document_id: myDoc }) as never)
    expect(withDoc.error).toBeNull()
    const { data } = await admin.client.from(table).select('code, document_id, done_by').eq('code' as never, CODE)
    expect(data).toEqual([{ code: CODE, document_id: myDoc, done_by: board.id }])
  })

  it('admin attaches, changes and clears evidence later; done_by never moves', async () => {
    await board.client.from(table).insert(row() as never)
    const set = await admin.client.from(table).update({ document_id: myDoc } as never).eq('code' as never, CODE).select('id')
    expect(set.error).toBeNull()
    expect(set.data ?? []).toHaveLength(1)
    expect(await documentIdOf()).toBe(myDoc)
    const cleared = await admin.client.from(table).update({ document_id: null } as never).eq('code' as never, CODE).select('id')
    expect(cleared.error).toBeNull()
    expect(await documentIdOf()).toBeNull()
    const { data } = await adminDb().from(table).select('done_by').eq('code' as never, CODE)
    expect(data).toEqual([{ done_by: board.id }])
  })

  it('another org’s document is refused (23503) on insert and update, for the board and the service role', async () => {
    const ins = await board.client.from(table).insert(row({ document_id: theirDoc }) as never)
    expect(ins.error?.code).toBe('23503')
    const asService = await adminDb().from(table).insert(row({ document_id: theirDoc }) as never)
    expect(asService.error?.code).toBe('23503')

    await board.client.from(table).insert(row() as never)
    const upd = await board.client.from(table).update({ document_id: theirDoc } as never).eq('code' as never, CODE).select('id')
    expect(upd.error?.code).toBe('23503')
    expect(await documentIdOf()).toBeNull()
  })

  it('a board member of both orgs still cannot attach the other org’s document to this org’s row', async () => {
    await adminDb().from('org_members').insert({ org_id: other.orgId, user_id: board.id, role: 'board' })
    await board.client.from(table).insert(row() as never)
    const upd = await board.client.from(table).update({ document_id: theirDoc } as never).eq('code' as never, CODE).select('id')
    expect(upd.error?.code).toBe('23503')
  })

  it('a document id that does not exist is refused by the foreign key', async () => {
    const { error } = await adminDb().from(table).insert(row({ document_id: randomUUID() }) as never)
    expect(error?.code).toBe('23503')
  })

  it('deleting the document clears the link and keeps the row done', async () => {
    await board.client.from(table).insert(row({ document_id: myDoc }) as never)
    const del = await adminDb().from('hoa_documents').delete().eq('id', myDoc)
    expect(del.error).toBeNull()
    const { data } = await adminDb().from(table).select('code, document_id').eq('organization_id' as never, org.orgId)
    expect(data).toEqual([{ code: CODE, document_id: null }])
  })

  it('a resident and another org’s board see nothing and change nothing', async () => {
    await adminDb().from(table).insert(row({ document_id: myDoc }) as never)
    for (const user of [resident, otherBoard]) {
      const { data } = await user.client.from(table).select('id, document_id')
      expect(data ?? []).toHaveLength(0)
      const upd = await user.client.from(table).update({ document_id: null } as never).eq('organization_id' as never, org.orgId).select('id')
      expect(upd.data ?? []).toHaveLength(0)
    }
    expect(await documentIdOf()).toBe(myDoc)
  })

  it('the same-org check is a trigger function: nobody can call it directly, even if replay re-grants EXECUTE', async () => {
    // RETURNS trigger: Postgres refuses any direct call ("trigger functions
    // can only be called as triggers"), so a re-granted EXECUTE gives anon
    // nothing. It reads only the row being written and never auth.uid().
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const asAnon = await anon.rpc('compliance_deadlines_done_document_org' as never)
    expect(asAnon.error).not.toBeNull()
    const asBoard = await board.client.rpc('compliance_deadlines_done_document_org' as never)
    expect(asBoard.error).not.toBeNull()
    // And anon cannot touch the table at all.
    const ins = await anon.from(table).insert(row({ document_id: myDoc }) as never)
    expect(ins.error).not.toBeNull()
    const { count } = await adminDb().from(table).select('id', { count: 'exact', head: true })
    expect(count).toBe(0)
  })
})
