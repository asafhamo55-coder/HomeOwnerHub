/**
 * BL-049: residents see the association's governing documents — and only
 * those.
 *
 * The allowlist lives in apps/hoa/src/lib/resident-documents/visibility.ts
 * and, since 0063/0064, in the database too: 0063 limits a resident's row
 * SELECT to the allowlisted types, and 0064 (M1, BL-052/BL-058) adds the
 * board-set visible_to_owners flag and makes storage reads follow the
 * rows (a resident signs only an object a row they can read points at).
 * These tests run the same reads the resident page and the open route
 * run, as a real signed-in resident, and prove:
 *   - allowlisted documents come back and their file can be signed;
 *   - internal types (hoa "other", minutes, AI-generated, superseded)
 *     never come back and never resolve to a file;
 *   - another org's resident gets nothing.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every assertion
 * runs through a user's own client.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  fetchResidentDocumentFile,
  fetchResidentDocuments,
} from '../../../apps/hoa/src/lib/resident-documents/query'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

interface Seeded {
  org: OrgFixture
  board: TestUser
  resident: TestUser
  ids: {
    bylaws: string
    other: string
    hoaMinutes: string
    govRules: string
    govMinutes: string
    govAiPolicy: string
    govSuperseded: string
  }
  bylawsPath: string
}

async function seed(): Promise<Seeded> {
  const org = await makeOrg()
  const board = await mintUser(org, 'board')
  const resident = await mintUser(org, 'resident')
  const db = adminDb()

  const bylawsPath = `${org.orgId}/bylaws-${Date.now()}.txt`
  const up = await board.client.storage.from('hoa-documents').upload(bylawsPath, new Blob(['bylaws']), { upsert: true })
  expect(up.error, 'board could not upload — fixture is broken').toBeNull()

  const hoa = async (name: string, type: string, storage_path: string) => {
    const { data, error } = await db
      .from('hoa_documents')
      .insert({ org_id: org.orgId, name, type, storage_path })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed hoa_documents: ${error?.code}`)
    return data.id
  }
  const gov = async (title: string, type: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await db
      .from('governing_documents')
      .insert({
        organization_id: org.orgId,
        association_id: org.associationId,
        title,
        type,
        storage_path: `${org.orgId}/${org.associationId}/${type}.pdf`,
        ...extra,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed governing_documents: ${error?.code}`)
    return data.id
  }

  return {
    org,
    board,
    resident,
    bylawsPath,
    ids: {
      bylaws: await hoa('Bylaws', 'bylaws', bylawsPath),
      other: await hoa('Collection letter', 'other', `${org.orgId}/letter.pdf`),
      hoaMinutes: await hoa('Draft minutes', 'minutes', `${org.orgId}/minutes.pdf`),
      govRules: await gov('Rules', 'rules', { effective_date: '2026-03-01' }),
      govMinutes: await gov('Board minutes', 'minutes'),
      govAiPolicy: await gov('Drafted policy', 'policy', { ai_generated: true }),
      govSuperseded: await gov('Old rules', 'rules', { superseded_at: '2026-01-01' }),
    },
  }
}

describe('resident documents', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('a resident lists the allowlisted documents and nothing internal', async () => {
    const s = await seed()
    const docs = await fetchResidentDocuments(s.resident.client, s.org.orgId)
    const ids = docs.map((d) => d.id).sort()
    expect(ids).toEqual([s.ids.bylaws, s.ids.govRules].sort())
    for (const hidden of [s.ids.other, s.ids.hoaMinutes, s.ids.govMinutes, s.ids.govAiPolicy, s.ids.govSuperseded]) {
      expect(ids).not.toContain(hidden)
    }
  })

  it('a resident can sign an allowlisted file with their own client', async () => {
    const s = await seed()
    const target = await fetchResidentDocumentFile(s.resident.client, s.org.orgId, 'hoa', s.ids.bylaws)
    expect(target).toEqual({ bucket: 'hoa-documents', path: s.bylawsPath })
    const signed = await s.resident.client.storage.from(target!.bucket).createSignedUrl(target!.path, 60)
    expect(signed.error, 'resident could not sign an allowlisted file').toBeNull()
    expect(signed.data?.signedUrl).toBeTruthy()
  })

  it('internal documents never resolve to a file for a resident', async () => {
    const s = await seed()
    for (const [source, id] of [
      ['hoa', s.ids.other],
      ['hoa', s.ids.hoaMinutes],
      ['governing', s.ids.govMinutes],
      ['governing', s.ids.govAiPolicy],
      ['governing', s.ids.govSuperseded],
    ] as const) {
      await expect(fetchResidentDocumentFile(s.resident.client, s.org.orgId, source, id), `${source} ${id}`).resolves.toBeNull()
    }
  })

  it('a resident of another org sees none of them', async () => {
    const s = await seed()
    const otherOrg = await makeOrg()
    const outsider = await mintUser(otherOrg, 'resident')
    await expect(fetchResidentDocuments(outsider.client, s.org.orgId)).resolves.toEqual([])
    await expect(fetchResidentDocumentFile(outsider.client, s.org.orgId, 'hoa', s.ids.bylaws)).resolves.toBeNull()
    const leak = await outsider.client.storage.from('hoa-documents').createSignedUrl(s.bylawsPath, 60)
    expect(leak.data?.signedUrl ?? null, 'cross-org resident signed a file').toBeNull()
  })
})

/**
 * M1 (0064) in the database, with the app flag still off: storage reads
 * follow the rows, bills / vendor files / unposted letters are board-only,
 * and a board-flagged document is readable by residents at the row and
 * object level (the app starts listing it once M1_APPLIED flips).
 */
describe('M1: document visibility and storage enforced by the database', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  async function world() {
    const org = await makeOrg()
    const board = await mintUser(org, 'board')
    const resident = await mintUser(org, 'resident')
    const db = adminDb()
    const put = async (path: string) => {
      const up = await board.client.storage.from('hoa-documents').upload(path, new Blob(['x']), { upsert: true })
      expect(up.error, `board could not upload ${path} — fixture is broken`).toBeNull()
      return path
    }
    const paths = {
      budget: await put(`${org.orgId}/budget-${Date.now()}.txt`),
      letter: await put(`${org.orgId}/letter-${Date.now()}.txt`),
      bill: await put(`${org.orgId}/bills/${Date.now()}-bill.txt`),
      vendor: await put(`${org.orgId}/vendors/v1/w9/${Date.now()}.txt`),
      orphan: await put(`${org.orgId}/orphan-${Date.now()}.txt`),
    }
    const doc = async (name: string, type: string, storage_path: string, visible_to_owners: boolean) => {
      const { data, error } = await db
        .from('hoa_documents')
        .insert({ org_id: org.orgId, name, type, storage_path, visible_to_owners })
        .select('id')
        .single()
      if (error || !data) throw new Error(`seed hoa_documents: ${error?.code}`)
      return data.id
    }
    const ids = {
      budget: await doc('Budget', 'other', paths.budget, true),
      letter: await doc('Collection letter', 'other', paths.letter, false),
    }
    return { org, board, resident, paths, ids }
  }

  const sign = async (client: TestUser['client'], path: string) =>
    (await client.storage.from('hoa-documents').createSignedUrl(path, 60)).data?.signedUrl ?? null

  it('a board-flagged "other" document is readable by a resident; an unflagged one is not', async () => {
    const w = await world()
    const { data } = await w.resident.client.from('hoa_documents').select('id').in('id', [w.ids.budget, w.ids.letter])
    expect((data ?? []).map((d) => d.id)).toEqual([w.ids.budget])
    expect(await sign(w.resident.client, w.paths.budget), 'resident could not sign a posted document').toBeTruthy()
    expect(await sign(w.resident.client, w.paths.letter), 'resident signed an unposted letter').toBeNull()
  })

  it('bills, vendor files and objects no row points at are board-only (BL-058)', async () => {
    const w = await world()
    for (const p of [w.paths.bill, w.paths.vendor, w.paths.orphan]) {
      expect(await sign(w.resident.client, p), `resident signed ${p.split('/')[1]}`).toBeNull()
      expect(await sign(w.board.client, p), `board could not sign ${p.split('/')[1]}`).toBeTruthy()
    }
  })

  it('the app, flag off, still lists only the allowlist (no M1 column named)', async () => {
    const w = await world()
    const docs = await fetchResidentDocuments(w.resident.client, w.org.orgId, { m1: false })
    expect(docs.map((d) => d.id)).toEqual([])
    const flagged = await fetchResidentDocuments(w.resident.client, w.org.orgId, { m1: true })
    expect(flagged.map((d) => d.id)).toEqual([w.ids.budget])
  })

  it('a resident uploads only under submissions/, and reads back their own upload', async () => {
    const w = await world()
    const mine = `${w.org.orgId}/submissions/ticket/${randomUUID()}/photo.txt`
    const up = await w.resident.client.storage.from('hoa-documents').upload(mine, new Blob(['x']))
    expect(up.error, 'resident submission upload refused').toBeNull()
    expect(await sign(w.resident.client, mine)).toBeTruthy()
    const planted = await w.resident.client.storage.from('hoa-documents').upload(`${w.org.orgId}/bills/fake.txt`, new Blob(['x']))
    expect(planted.error, 'resident planted a file outside submissions/').not.toBeNull()
    const gov = await w.resident.client.storage.from('governing-docs').upload(`${w.org.orgId}/x/fake.txt`, new Blob(['x']))
    expect(gov.error, 'resident uploaded to governing-docs').not.toBeNull()
  })

  it('a resident reads a governing-docs object only through a visible row', async () => {
    const w = await world()
    const db = adminDb()
    const visible = `${w.org.orgId}/${w.org.associationId}/rules-${Date.now()}.txt`
    const hidden = `${w.org.orgId}/${w.org.associationId}/minutes-${Date.now()}.txt`
    for (const p of [visible, hidden]) {
      const up = await w.board.client.storage.from('governing-docs').upload(p, new Blob(['x']), { upsert: true })
      expect(up.error).toBeNull()
    }
    for (const [type, storage_path] of [
      ['rules', visible],
      ['minutes', hidden],
    ]) {
      const { error } = await db
        .from('governing_documents')
        .insert({ organization_id: w.org.orgId, association_id: w.org.associationId, title: type, type, storage_path })
      expect(error).toBeNull()
    }
    const g = (p: string) => w.resident.client.storage.from('governing-docs').createSignedUrl(p, 60)
    expect((await g(visible)).data?.signedUrl, 'resident could not sign current rules').toBeTruthy()
    expect((await g(hidden)).data?.signedUrl ?? null, 'resident signed board minutes').toBeNull()
  })
})
