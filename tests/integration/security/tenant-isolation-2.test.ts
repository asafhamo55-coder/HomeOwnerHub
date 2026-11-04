/**
 * Migration 0081 (migrations/0081_tenant_isolation_2.sql) against real Postgres.
 * CI only (no local database).
 *
 *   1. associations: a resident reads their own association, not a sibling's;
 *      the board reads both.
 *   2. governing documents, chunks and the governing-docs bucket: a resident
 *      reads their association's documents and org-wide ones, not a sibling's.
 *   3. sa_resident_insert: only the exact own-submission path is accepted.
 *   4. eviction_cases, pm_properties, pm_rent_ledger: residents read and write
 *      nothing; the board still does.
 *
 * Fixture rule: adminDb() seeds; every assertion runs through a user's client.
 * Ids and counts only.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let board: TestUser
let resident: TestUser
let neighbour: TestUser
let otherAssoc: string
let ticketId: string
let neighbourTicketId: string
let docMine: string
let docOther: string
let docOrgWide: string
let pathMine: string
let pathOther: string

const db = () => adminDb() as unknown as { from(t: string): any }
const c = (u: TestUser) => u.client as any
const idsOf = (rows: Array<{ id: string }> | null) => (rows ?? []).map((r) => r.id).sort()

async function ownUnitIn(user: TestUser, assoc: string) {
  const u = await db()
    .from('units')
    .insert({ organization_id: org.orgId, association_id: assoc, address_line1: `${assoc.slice(0, 6)} Test Lane` })
    .select('id')
    .single()
  if (u.error) throw new Error(`seed unit: ${u.error.code}`)
  const { error } = await db()
    .from('ownerships')
    .insert({ organization_id: org.orgId, unit_id: u.data.id, owner_user_id: user.id, valid_from: '2024-01-01' })
  if (error) throw new Error(`seed ownership: ${error.code}`)
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  resident = await mintUser(org, 'resident')
  neighbour = await mintUser(org, 'resident')
  const a = await db()
    .from('associations')
    .insert({ organization_id: org.orgId, name: 'Second Association', state: 'FL', slug: 'SECONDASSOC' })
    .select('id')
    .single()
  if (a.error) throw new Error(`seed association: ${a.error.code}`)
  otherAssoc = a.data.id
  await ownUnitIn(resident, org.associationId)
  await ownUnitIn(neighbour, otherAssoc)

  const gov = async (assoc: string | null, name: string) => {
    const r = await db()
      .from('governing_documents')
      .insert({
        organization_id: org.orgId,
        association_id: assoc,
        title: name,
        type: 'rules',
        storage_path: `${org.orgId}/${name}.pdf`,
      })
      .select('id')
      .single()
    if (r.error) throw new Error(`seed governing document: ${r.error.code}`)
    return r.data.id as string
  }
  docMine = await gov(org.associationId, 'mine')
  docOther = await gov(otherAssoc, 'other')
  docOrgWide = await gov(null, 'orgwide')
  pathMine = `${org.orgId}/mine.pdf`
  pathOther = `${org.orgId}/other.pdf`
  for (const id of [docMine, docOther]) {
    const ch = await db()
      .from('governing_document_chunks')
      .insert({ organization_id: org.orgId, document_id: id, ordinal: 1, text: 'Quiet hours.' })
    if (ch.error) throw new Error(`seed chunk: ${ch.error.code}`)
  }
  for (const p of [pathMine, pathOther]) {
    const up = await board.client.storage.from('governing-docs').upload(p, new Blob(['x']), { upsert: true })
    expect(up.error, 'fixture: board upload failed').toBeNull()
  }

  const ticket = async (by: TestUser, subject: string) => {
    const t = await db()
      .from('tickets')
      .insert({ organization_id: org.orgId, submitted_by: by.id, subject, category: 'general', description: 'text' })
      .select('id')
      .single()
    if (t.error) throw new Error(`seed ticket: ${t.error.code}`)
    return t.data.id as string
  }
  ticketId = await ticket(resident, 'Leak')
  neighbourTicketId = await ticket(neighbour, 'Gate')
})

describe('associations', () => {
  it('a resident reads only their own association; the board reads both', async () => {
    const mine = await c(resident).from('associations').select('id')
    expect(idsOf(mine.data)).toEqual([org.associationId])
    const all = await c(board).from('associations').select('id')
    expect(idsOf(all.data)).toEqual([org.associationId, otherAssoc].sort())
  })

  it('a member with no home reads no association', async () => {
    const nobody = await mintUser(org, 'resident')
    const r = await c(nobody).from('associations').select('id')
    expect(r.data ?? []).toHaveLength(0)
  })
})

describe('governing documents', () => {
  it('a resident reads own-association and org-wide documents, not a sibling association', async () => {
    const r = await c(resident).from('governing_documents').select('id')
    expect(idsOf(r.data)).toEqual([docMine, docOrgWide].sort())
    expect(idsOf(r.data)).not.toContain(docOther)
    const bd = await c(board).from('governing_documents').select('id')
    expect(bd.data).toHaveLength(3)
  })

  it('chunks follow the document', async () => {
    const r = await c(resident).from('governing_document_chunks').select('document_id')
    expect((r.data ?? []).map((x: { document_id: string }) => x.document_id)).toEqual([docMine])
  })

  it('the governing-docs bucket follows the document', async () => {
    const ok = await resident.client.storage.from('governing-docs').createSignedUrl(pathMine, 60)
    expect(ok.error).toBeNull()
    const no = await resident.client.storage.from('governing-docs').createSignedUrl(pathOther, 60)
    expect(no.error, 'resident signed a sibling association file').not.toBeNull()
  })
})

describe('sa_resident_insert', () => {
  const row = (storage_path: string) => ({
    organization_id: org.orgId,
    thread_type: 'ticket',
    parent_id: ticketId,
    storage_path,
    file_name: 'f.txt',
    uploaded_by: resident.id,
    uploaded_by_role: 'resident',
  })
  const base = () => `${org.orgId}/submissions/ticket/${ticketId}/`

  it('accepts the exact own-submission path', async () => {
    const { error } = await c(resident).from('submission_attachments').insert(row(`${base()}file.txt`))
    expect(error).toBeNull()
  })

  for (const [label, path] of [
    ['another parent id', () => `${org.orgId}/submissions/ticket/${neighbourTicketId}/file.txt`],
    ['another thread type', () => `${org.orgId}/submissions/arc/${ticketId}/file.txt`],
    ['a nested path', () => `${base()}a/file.txt`],
    ['a dot segment', () => `${base()}..`],
    ['an empty file name', () => base()],
    ['a backslash', () => `${base()}a\\b.txt`],
    ['a doubled slash', () => `${org.orgId}/submissions/ticket//${ticketId}/file.txt`],
  ] as const) {
    it(`refuses ${label}`, async () => {
      const { error } = await c(resident).from('submission_attachments').insert(row(path()))
      expect(error).not.toBeNull()
    })
  }

  it('the board may still attach any path of its org', async () => {
    const { error } = await c(board)
      .from('submission_attachments')
      .insert({ ...row(`${org.orgId}/anything.txt`), uploaded_by: board.id, uploaded_by_role: 'board' })
    expect(error).toBeNull()
  })
})

describe('pm and eviction tables', () => {
  it('residents read and write nothing; the board does both', async () => {
    const prop = await db()
      .from('pm_properties')
      .insert({ org_id: org.orgId, address: '1 Main St' })
      .select('id')
      .single()
    if (prop.error) throw new Error(`seed pm_properties: ${prop.error.code}`)
    const ledger = await db()
      .from('pm_rent_ledger')
      .insert({ org_id: org.orgId, property_id: prop.data.id, period: '2026-01', amount_due: 100, due_date: '2026-01-01' })
    if (ledger.error) throw new Error(`seed pm_rent_ledger: ${ledger.error.code}`)
    const ev = await db()
      .from('eviction_cases')
      .insert({ org_id: org.orgId, user_id: board.id, property_address: '1 Main St', county: 'harris_tx', state: 'TX' })
    if (ev.error) throw new Error(`seed eviction_cases: ${ev.error.code}`)

    for (const table of ['pm_properties', 'pm_rent_ledger', 'eviction_cases']) {
      const r = await c(resident).from(table).select('org_id')
      expect(r.data ?? [], `${table} resident read`).toHaveLength(0)
      const b = await c(board).from(table).select('org_id')
      expect(b.data, `${table} board read`).toHaveLength(1)
    }

    const w = await c(resident)
      .from('pm_properties')
      .insert({ org_id: org.orgId, address: '2 Main St' })
    expect(w.error, 'resident wrote pm_properties').not.toBeNull()
    await c(resident).from('pm_properties').delete().eq('org_id', org.orgId)
    const still = await db().from('pm_properties').select('id').eq('org_id', org.orgId)
    expect(still.data).toHaveLength(1)
  })
})

describe('communications.audience_definition holds no contact lists', () => {
  const comm = (audience_definition: unknown) => ({
    organization_id: org.orgId,
    association_id: org.associationId,
    category: 'announcement',
    subject: 'Notice',
    body_html: '<p>hi</p>',
    audience_definition,
    status: 'sent',
    sent_at: new Date().toISOString(),
  })

  for (const key of ['emails', 'phones', 'emailNames', 'recipients']) {
    it(`rejects a row carrying ${key}`, async () => {
      const r = await db()
        .from('communications')
        .insert(comm({ kind: 'manual_emails', extra: { count: 1 }, [key]: ['x'] }))
      expect(r.error, `${key} was accepted`).not.toBeNull()
      expect(r.error.code).toBe('23514')
    })
  }

  it('accepts kind, count, official_notice and a draft composer state', async () => {
    for (const def of [
      { kind: 'manual_emails', extra: { count: 3 }, official_notice: true },
      { kind: 'draft', composer: { manualContacts: [{ email: 'x', phone: '', name: '' }] } },
      { kind: 'everyone' },
    ]) {
      const r = await db().from('communications').insert(comm(def))
      expect(r.error, JSON.stringify(def)).toBeNull()
    }
  })

  it('a resident who can read a manual list message sees no contact keys', async () => {
    const ins = await db()
      .from('communications')
      .insert(comm({ kind: 'manual_emails', extra: { count: 2 } }))
      .select('id')
      .single()
    expect(ins.error).toBeNull()
    const rec = await db().from('communication_recipients').insert({
      organization_id: org.orgId,
      communication_id: ins.data.id,
      user_id: resident.id,
      channel: 'portal',
      delivery_status: 'delivered',
    })
    expect(rec.error).toBeNull()
    const r = await c(resident).from('communications').select('audience_definition').eq('id', ins.data.id)
    expect(r.data).toHaveLength(1)
    expect(Object.keys(r.data[0].audience_definition).sort()).toEqual(['extra', 'kind'])
  })
})
