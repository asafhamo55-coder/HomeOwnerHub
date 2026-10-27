/**
 * BL-175b L2 (0070): the hoa-photos and eviction-docs buckets are
 * board/admin-only. CI only (no local database).
 *
 * 0055:97-109,125-137 admitted any member of the org, residents included, so
 * a resident read and wrote the board's violation photos and eviction
 * filings. No resident flow uses either bucket (resident uploads go to
 * hoa-documents under <org>/submissions/, kept below as a control).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
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

for (const bucket of ['hoa-photos', 'eviction-docs'] as const) {
  describe(`0070 L2: ${bucket}`, () => {
    it('board and admin upload and read their own org’s objects (control)', async () => {
      for (const [i, user] of [board, admin].entries()) {
        const path = `${org.orgId}/violations/${i}.txt`
        const up = await user.client.storage.from(bucket).upload(path, new Blob(['photo']), { upsert: true })
        expect(up.error, `${bucket}: board/admin could not upload`).toBeNull()
        const got = await user.client.storage.from(bucket).download(path)
        expect(got.error, `${bucket}: board/admin could not read back`).toBeNull()
      }
    })

    it('a resident cannot read an object the board uploaded', async () => {
      const path = `${org.orgId}/violations/board-photo.txt`
      await board.client.storage.from(bucket).upload(path, new Blob(['board photo']), { upsert: true })
      const leak = await resident.client.storage.from(bucket).download(path)
      expect(leak.error, `${bucket}: resident read a board object`).not.toBeNull()
      const list = await resident.client.storage.from(bucket).list(org.orgId + '/violations')
      expect(list.data ?? [], `${bucket}: resident can list board objects`).toHaveLength(0)
    })

    it('a resident cannot write into their own org’s prefix', async () => {
      const planted = await resident.client.storage
        .from(bucket)
        .upload(`${org.orgId}/violations/resident.txt`, new Blob(['x']), { upsert: true })
      expect(planted.error, `${bucket}: resident upload succeeded`).not.toBeNull()
    })

    it('another org’s board still cannot read or write (0055 tenant boundary unchanged)', async () => {
      const path = `${org.orgId}/violations/b.txt`
      await board.client.storage.from(bucket).upload(path, new Blob(['b']), { upsert: true })
      const leak = await otherBoard.client.storage.from(bucket).download(path)
      expect(leak.error).not.toBeNull()
      const planted = await otherBoard.client.storage.from(bucket).upload(`${org.orgId}/violations/o.txt`, new Blob(['o']), { upsert: true })
      expect(planted.error).not.toBeNull()
    })
  })
}

describe('0070 L2: what residents legitimately upload is untouched', () => {
  it('a resident can still upload under <org>/submissions/ in hoa-documents and read it back', async () => {
    const path = `${org.orgId}/submissions/ticket/t/photo.txt`
    const up = await resident.client.storage.from('hoa-documents').upload(path, new Blob(['mine']), { upsert: true })
    expect(up.error, 'resident submission upload was denied').toBeNull()
    const got = await resident.client.storage.from('hoa-documents').download(path)
    expect(got.error, 'resident could not read their own submission upload').toBeNull()
  })
})
