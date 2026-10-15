/**
 * F3: storage buckets are not tenant-scoped.
 *
 * 0003_storage_policies.sql gates on bucket_id and nothing else. The
 * {org_id}/{filename} convention is the only thing separating tenants,
 * which is obscurity rather than access control.
 */
import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeOrg, mintUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'
import { LOCAL_DB_URL } from '../setup/env'

describe('storage tenant isolation', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('a resident of one org cannot read another org objects', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')
    const residentB = await mintUser(orgB, 'resident')

    const pathA = `${orgA.orgId}/governing-doc.txt`
    const up = await boardA.client.storage
      .from('hoa-documents')
      .upload(pathA, new Blob(['board A private content']), { upsert: true })
    // Positive proof: the owning org CAN write. Without this, the
    // negative below could pass because uploads are broken entirely.
    expect(up.error, 'owning org could not upload — fixture is broken').toBeNull()

    const leak = await residentB.client.storage.from('hoa-documents').download(pathA)
    expect(leak.error, 'cross-tenant storage read succeeded').not.toBeNull()
  })

  it('a resident of one org cannot write into another org prefix', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const residentB = await mintUser(orgB, 'resident')

    const planted = await residentB.client.storage
      .from('hoa-documents')
      .upload(`${orgA.orgId}/planted.txt`, new Blob(['not mine']), { upsert: true })

    expect(planted.error, 'cross-tenant storage write succeeded').not.toBeNull()
  })

  it('the owning org can still read its own objects', async () => {
    const orgA = await makeOrg()
    const boardA = await mintUser(orgA, 'board')
    const path = `${orgA.orgId}/own-doc.txt`

    await boardA.client.storage
      .from('hoa-documents')
      .upload(path, new Blob(['mine']), { upsert: true })

    const got = await boardA.client.storage.from('hoa-documents').download(path)
    expect(got.error).toBeNull()
  })

  /**
   * The guard this proves: (storage.foldername(name))[1]::uuid raises
   * `invalid input syntax for type uuid` on a non-UUID first path
   * segment, and a raising policy predicate aborts the whole query
   * rather than denying the one offending row. A malformed object
   * planted anywhere in the bucket must not poison an unrelated,
   * legitimate list() over the caller's own prefix.
   *
   * Planted via direct psql, not the Storage API: the API itself would
   * reject a path outside the caller's org before the policy ever runs,
   * which would prove nothing about the cast guard.
   */
  it('a non-UUID object prefix does not break a legitimate same-bucket query', async () => {
    const orgA = await makeOrg()
    const boardA = await mintUser(orgA, 'board')
    const path = `${orgA.orgId}/own-doc.txt`

    await boardA.client.storage
      .from('hoa-documents')
      .upload(path, new Blob(['mine']), { upsert: true })

    execFileSync(
      'psql',
      [
        LOCAL_DB_URL,
        '-v',
        'ON_ERROR_STOP=1',
        '-q',
        '-c',
        `insert into storage.objects (bucket_id, name) values ('hoa-documents', 'not-a-uuid/rogue.txt');`,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    )

    const list = await boardA.client.storage.from('hoa-documents').list(orgA.orgId)
    expect(list.error, 'a malformed prefix elsewhere in the bucket broke this query').toBeNull()

    const got = await boardA.client.storage.from('hoa-documents').download(path)
    expect(got.error, 'a malformed prefix elsewhere in the bucket broke this query').toBeNull()
  })
})
