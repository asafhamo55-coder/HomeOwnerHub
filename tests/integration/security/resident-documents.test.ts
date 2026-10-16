/**
 * BL-049: residents see the association's governing documents — and only
 * those.
 *
 * RLS (0063: members read hoa_documents / governing_documents; storage
 * 0055/0056: members read their org's objects) cannot tell a bylaws PDF
 * from a collection letter, so the allowlist is app-level
 * (apps/hoa/src/lib/resident-documents/visibility.ts). These tests run the
 * same reads the resident page and the open route run, as a real
 * signed-in resident, and prove:
 *   - allowlisted documents come back and their file can be signed;
 *   - internal types (hoa "other", minutes, AI-generated, superseded)
 *     never come back and never resolve to a file;
 *   - another org's resident gets nothing.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every assertion
 * runs through a user's own client.
 */
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
