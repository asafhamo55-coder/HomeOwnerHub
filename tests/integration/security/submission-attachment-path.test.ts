/**
 * BL-175b M7 (0070): sa_resident_insert (0027:72-89) requires storage_path to
 * begin with <org>/submissions/. CI only (no local database).
 *
 * Why it matters: 0064's hoa-documents SELECT policy lets a caller read any
 * object named by a submission_attachments row they can read. A resident who
 * could write storage_path = '<org>/board-minutes-draft.pdf' on their own
 * ticket's attachment row would be handed that board document.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let resident: TestUser
let ticketId: string
let secretPath: string

const row = (storage_path: string) => ({
  organization_id: org.orgId,
  thread_type: 'ticket',
  parent_id: ticketId,
  storage_path,
  file_name: 'f.txt',
  uploaded_by: resident.id,
  uploaded_by_role: 'resident',
})

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  resident = await mintUser(org, 'resident')
  const { data, error } = await adminDb()
    .from('tickets')
    .insert({ organization_id: org.orgId, submitted_by: resident.id, subject: 'Leak', category: 'general', description: 'drip' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed ticket: ${error?.code}`)
  ticketId = data.id
  secretPath = `${org.orgId}/board-secret.txt`
  const up = await board.client.storage.from('hoa-documents').upload(secretPath, new Blob(['board only']), { upsert: true })
  expect(up.error, 'fixture: board upload failed').toBeNull()
})

describe('0070 M7: sa_resident_insert path prefix', () => {
  it('control: the app’s own path shape (<org>/submissions/...) inserts', async () => {
    const { error } = await resident.client
      .from('submission_attachments')
      .insert(row(`${org.orgId}/submissions/ticket/${ticketId}/f.txt`) as never)
    expect(error).toBeNull()
  })

  it('a path to a board document outside submissions/ is refused, and the document stays unreadable', async () => {
    const { error } = await resident.client.from('submission_attachments').insert(row(secretPath) as never)
    expect(error, 'resident pointed an attachment at a board document').not.toBeNull()
    const { data } = await adminDb().from('submission_attachments').select('id').eq('storage_path', secretPath)
    expect(data ?? []).toHaveLength(0)
    const leak = await resident.client.storage.from('hoa-documents').download(secretPath)
    expect(leak.error, 'resident can read a board document').not.toBeNull()
  })

  for (const [label, path] of [
    ['another org’s prefix', () => `${other.orgId}/submissions/ticket/x/f.txt`],
    ['a look-alike folder', () => `${org.orgId}/submissions-evil/f.txt`],
    ['a traversal-looking prefix', () => `inbox-drafts/${org.orgId}/submissions/f.txt`],
  ] as const) {
    it(`${label} is refused`, async () => {
      const { error } = await resident.client.from('submission_attachments').insert(row(path()) as never)
      expect(error).not.toBeNull()
    })
  }

  it('the board may still attach any path of its org (sa_board_or_admin_all unchanged)', async () => {
    const { error } = await board.client
      .from('submission_attachments')
      .insert({ ...row(secretPath), uploaded_by: board.id, uploaded_by_role: 'board' } as never)
    expect(error).toBeNull()
  })
})
