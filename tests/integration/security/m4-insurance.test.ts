/**
 * Migration 0068 part 1 (migrations/0068_m4_batch.sql, BL-132
 * insurance_policies) against real Postgres. CI only (no local database).
 *
 *   - board and admin of the org read and write; created_by defaults to
 *     the caller;
 *   - a resident and another org's board see nothing and write nothing
 *     (42501), and can't delete;
 *   - the association must be the row's org's, even for a board member of
 *     both orgs (42501);
 *   - the policy document must be the org's: another org's hoa_documents
 *     row is refused with 23503, even for the service role; deleting the
 *     document nulls the link;
 *   - CHECKs: unknown kind, a term that ends before it starts, negative
 *     amounts (23514).
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only;
 * no PII. The table is not in the generated Database types until gen:types
 * runs after prod has 0068 (CLAUDE.md footgun 3), hence the casts.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let admin: TestUser
let resident: TestUser
let otherBoard: TestUser

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  admin = await mintUser(org, 'admin')
  resident = await mintUser(org, 'resident')
  otherBoard = await mintUser(other, 'board')
})

const table = 'insurance_policies' as never

const policy = (extra: Record<string, unknown> = {}) => ({
  organization_id: org.orgId,
  association_id: org.associationId,
  kind: 'fidelity',
  carrier: 'Test Carrier',
  policy_number: 'TEST-1',
  coverage_limit_cents: 25_000_000,
  deductible_cents: 100_000,
  effective_on: '2026-01-01',
  expires_on: '2027-01-01',
  ...extra,
})

async function makeDocument(f: OrgFixture): Promise<string> {
  const { data, error } = await adminDb()
    .from('hoa_documents')
    .insert({
      org_id: f.orgId,
      name: 'Fidelity bond declarations',
      type: 'other',
      storage_path: `${f.orgId}/insurance/${randomUUID()}/declarations.pdf`,
    } as never)
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed hoa_documents: ${error?.code ?? 'no row'}`)
  return (data as { id: string }).id
}

describe('0068 part 1: insurance_policies (BL-132)', () => {
  it('board and admin write and read their org’s policies; created_by defaults to the caller', async () => {
    const { error } = await board.client.from(table).insert(policy() as never)
    expect(error).toBeNull()
    const asAdmin = await admin.client.from(table).insert(policy({ kind: 'property' }) as never)
    expect(asAdmin.error).toBeNull()
    const { data } = await admin.client
      .from(table)
      .select('kind, created_by')
      .eq('organization_id' as never, org.orgId)
      .order('kind' as never)
    expect(data).toEqual([
      { kind: 'fidelity', created_by: board.id },
      { kind: 'property', created_by: admin.id },
    ])
    const upd = await board.client
      .from(table)
      .update({ deductible_cents: 50_000 } as never)
      .eq('kind' as never, 'fidelity')
      .select('id')
    expect(upd.error).toBeNull()
    expect(upd.data ?? []).toHaveLength(1)
  })

  it('a resident and another org’s board see nothing, write nothing and delete nothing', async () => {
    await adminDb().from(table).insert(policy() as never)
    for (const user of [resident, otherBoard]) {
      const { data } = await user.client.from(table).select('id')
      expect(data ?? []).toHaveLength(0)
    }
    const asResident = await resident.client.from(table).insert(policy({ kind: 'flood' }) as never)
    expect(asResident.error?.code).toBe('42501')
    const asOther = await otherBoard.client.from(table).insert(policy({ kind: 'flood' }) as never)
    expect(asOther.error?.code).toBe('42501')
    for (const user of [resident, otherBoard]) {
      const del = await user.client.from(table).delete().eq('organization_id' as never, org.orgId).select('id')
      expect(del.data ?? []).toHaveLength(0)
    }
    const { count } = await adminDb().from(table).select('id', { count: 'exact', head: true })
    expect(count).toBe(1)
  })

  it("the association must belong to the row's org (a board of two orgs cannot cross-file)", async () => {
    await adminDb().from('org_members').insert({ org_id: other.orgId, user_id: board.id, role: 'board' })
    const { error } = await board.client.from(table).insert(policy({ association_id: other.associationId }) as never)
    expect(error?.code).toBe('42501')
    const noAssoc = await board.client.from(table).insert(policy({ association_id: null }) as never)
    expect(noAssoc.error).toBeNull()
  })

  it("another org's document is refused with 23503 (even for the service role)", async () => {
    const foreign = await makeDocument(other)
    const asBoard = await board.client.from(table).insert(policy({ document_id: foreign }) as never)
    expect(asBoard.error?.code).toBe('23503')
    const asService = await adminDb().from(table).insert(policy({ document_id: foreign }) as never)
    expect(asService.error?.code).toBe('23503')
  })

  it("the org's own document links; deleting the document nulls the link", async () => {
    const docId = await makeDocument(org)
    const { data, error } = await board.client.from(table).insert(policy({ document_id: docId }) as never).select('id').single()
    expect(error).toBeNull()
    const id = (data as unknown as { id: string }).id
    await adminDb().from('hoa_documents').delete().eq('id', docId)
    const { data: after } = await adminDb().from(table).select('document_id').eq('id' as never, id).single()
    expect((after as unknown as { document_id: string | null }).document_id).toBeNull()
  })

  it('CHECKs: unknown kind, a term ending before it starts, negative amounts are refused with 23514', async () => {
    for (const bad of [
      policy({ kind: 'boat' }),
      policy({ effective_on: '2027-01-01', expires_on: '2027-01-01' }),
      policy({ coverage_limit_cents: -1 }),
      policy({ deductible_cents: -1 }),
      policy({ premium_cents: -1 }),
      policy({ carrier: '   ' }),
    ]) {
      const { error } = await adminDb().from(table).insert(bad as never)
      expect(error?.code).toBe('23514')
    }
  })
})
