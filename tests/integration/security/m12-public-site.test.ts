/**
 * Migration 0077 (migrations/0077_public_site.sql, batch M12) against real
 * Postgres. CI only (no local database).
 *
 *   - a board member reads their own org's site and items; a resident, a
 *     board member of another org and anon read nothing;
 *   - no web role can write either table (the server writes with the service
 *     role);
 *   - a site starts unpublished;
 *   - an item cannot point at another org's site or document;
 *   - the item shape rule (document xor announcement) holds.
 *
 * Ids and counts only. The tables are not in the generated Database types
 * until gen:types runs after prod has 0077, hence the casts.
 */
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from '../setup/env'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let resident: TestUser
let otherBoard: TestUser
let siteId: string
let otherSiteId: string
let otherDocId: string

async function insertOne(t: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb().from(t as never).insert(row as never).select('id').single()
  if (error || !data) throw new Error(`seed ${t}: ${error?.code ?? 'no row'}`)
  return (data as { id: string }).id
}

const site = (f: OrgFixture, slug: string) =>
  insertOne('public_sites', { organization_id: f.orgId, association_id: f.associationId, slug, title: 'Test HOA' })

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  resident = await mintUser(org, 'resident')
  otherBoard = await mintUser(other, 'board')
  siteId = await site(org, 'test-one')
  otherSiteId = await site(other, 'test-two')
  otherDocId = await insertOne('hoa_documents', { org_id: other.orgId, name: 'Other', type: 'rules', storage_path: 'x/y.pdf' })
})

describe('public_sites', () => {
  it('starts unpublished', async () => {
    const { data } = await adminDb().from('public_sites' as never).select('published').eq('id' as never, siteId).single()
    expect((data as unknown as { published: boolean }).published).toBe(false)
  })

  it('is readable by the org board and nobody else', async () => {
    const read = async (who: TestUser) => {
      const { data, error } = await who.client.from('public_sites' as never).select('id')
      expect(error).toBeNull()
      return (data ?? []).length
    }
    expect(await read(board)).toBe(1)
    expect(await read(resident)).toBe(0)
    expect(await read(otherBoard)).toBe(1)
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
    const res = await anon.from('public_sites' as never).select('id')
    expect(res.data ?? []).toHaveLength(0)
  })

  it('cannot be written by a board member through the web', async () => {
    const ins = await board.client
      .from('public_sites' as never)
      .insert({ organization_id: org.orgId, association_id: org.associationId, slug: 'abcd', title: 'x' } as never)
    expect(ins.error).not.toBeNull()
    await board.client.from('public_sites' as never).update({ published: true } as never).eq('id' as never, siteId)
    const { data } = await adminDb().from('public_sites' as never).select('published').eq('id' as never, siteId).single()
    expect((data as unknown as { published: boolean }).published).toBe(false)
  })

  it('refuses a bad slug', async () => {
    const res = await adminDb()
      .from('public_sites' as never)
      .insert({ organization_id: other.orgId, association_id: other.associationId, slug: 'Bad Slug', title: 'x' } as never)
    expect(res.error).not.toBeNull()
  })
})

describe('public_site_items', () => {
  it('refuses a document of another org', async () => {
    const res = await adminDb()
      .from('public_site_items' as never)
      .insert({ organization_id: org.orgId, site_id: siteId, kind: 'document', hoa_document_id: otherDocId, title: 'x' } as never)
    expect(res.error).not.toBeNull()
  })

  it('refuses a site of another org', async () => {
    const res = await adminDb()
      .from('public_site_items' as never)
      .insert({ organization_id: org.orgId, site_id: otherSiteId, kind: 'announcement', title: 'x', body: 'y' } as never)
    expect(res.error).not.toBeNull()
  })

  it('enforces the item shape', async () => {
    const db = adminDb()
    const noBody = await db
      .from('public_site_items' as never)
      .insert({ organization_id: org.orgId, site_id: siteId, kind: 'announcement', title: 'x' } as never)
    expect(noBody.error).not.toBeNull()
    const docWithoutFile = await db
      .from('public_site_items' as never)
      .insert({ organization_id: org.orgId, site_id: siteId, kind: 'document', title: 'x' } as never)
    expect(docWithoutFile.error).not.toBeNull()
    const ok = await db
      .from('public_site_items' as never)
      .insert({ organization_id: org.orgId, site_id: siteId, kind: 'announcement', title: 'x', body: 'y' } as never)
    expect(ok.error).toBeNull()
  })

  it('is hidden from residents and cannot be written through the web', async () => {
    await insertOne('public_site_items', { organization_id: org.orgId, site_id: siteId, kind: 'announcement', title: 'x', body: 'y' })
    const r = await resident.client.from('public_site_items' as never).select('id')
    expect(r.data ?? []).toHaveLength(0)
    const b = await board.client.from('public_site_items' as never).select('id')
    expect(b.data ?? []).toHaveLength(1)
    const w = await board.client
      .from('public_site_items' as never)
      .insert({ organization_id: org.orgId, site_id: siteId, kind: 'announcement', title: 'z', body: 'z' } as never)
    expect(w.error).not.toBeNull()
  })
})
