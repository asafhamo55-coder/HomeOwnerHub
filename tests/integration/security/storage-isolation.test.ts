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
  // Regression guard for a real near-miss. The first version of 0055 read the
  // org id from path segment 1 only, which is right for six of the seven
  // upload call sites — and wrong for the one that matters most to users.
  // apps/hoa/src/lib/inbox/draft/attachment-actions.ts:116 mints
  //   inbox-drafts/<org>/<draft>/<uuid>
  // in this same bucket through a user-scoped client, so a segment-1-only
  // helper returned NULL, which under RLS means denied: every inbox draft
  // attachment would have failed to upload and every already-attached file
  // would have vanished from its draft. The hostile non-UUID case above did
  // not catch it, because denying a malformed path is the *correct* outcome
  // there — only a POSITIVE assertion on a legitimate prefixed path does.
  it('allows the owning org to use the inbox-drafts/<org>/<draft>/ convention', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')
    const residentB = await mintUser(orgB, 'resident')

    const draftPath = `inbox-drafts/${orgA.orgId}/draft-1/attachment.txt`

    // Positive first: the owning org can write and read its own draft
    // attachment. If this fails, the negative below proves nothing.
    const up = await boardA.client.storage
      .from('hoa-documents')
      .upload(draftPath, new Blob(['draft attachment']), { upsert: true })
    expect(up.error, 'owning org could not upload to inbox-drafts/<org>/ — 0055 denies a live feature').toBeNull()

    const read = await boardA.client.storage.from('hoa-documents').download(draftPath)
    expect(read.error, 'owning org could not read back its own draft attachment').toBeNull()

    // And the tenant boundary still holds on the prefixed shape.
    const leak = await residentB.client.storage.from('hoa-documents').download(draftPath)
    expect(leak.error, 'cross-tenant read of an inbox-drafts path succeeded').not.toBeNull()
  })

  // F2 follow-up: governing-docs is a fourth bucket (provisioned out of
  // band in production exactly like the original three) that had NO
  // policy at all until 0056. No policy means deny under RLS, so the
  // upload route's uploads were silently failing — see
  // apps/hoa/src/app/api/governing-docs/upload/route.ts:129 for the path
  // shape this test exercises: `${org.id}/${associationId}/${ts}-${name}`,
  // which leads with the org id, same family as hoa-photos/hoa-documents/
  // eviction-docs (not the inbox-drafts exception).
  it('the owning org can upload to and read from governing-docs', async () => {
    const orgA = await makeOrg()
    const boardA = await mintUser(orgA, 'board')
    const path = `${orgA.orgId}/${orgA.associationId}/${Date.now()}-bylaws.txt`

    // Positive first: a wrong-or-missing policy denies everyone, so this
    // is the assertion that actually proves the policy is correct.
    const up = await boardA.client.storage
      .from('governing-docs')
      .upload(path, new Blob(['bylaws content']), { upsert: true })
    expect(up.error, 'owning org could not upload to governing-docs').toBeNull()

    const got = await boardA.client.storage.from('governing-docs').download(path)
    expect(got.error, 'owning org could not read back its own governing-docs object').toBeNull()
  })

  it('a resident of another org cannot read a governing-docs object', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')
    const residentB = await mintUser(orgB, 'resident')
    const path = `${orgA.orgId}/${orgA.associationId}/${Date.now()}-bylaws.txt`

    await boardA.client.storage
      .from('governing-docs')
      .upload(path, new Blob(['bylaws content']), { upsert: true })

    const leak = await residentB.client.storage.from('governing-docs').download(path)
    expect(leak.error, 'cross-tenant governing-docs read succeeded').not.toBeNull()
  })
})
