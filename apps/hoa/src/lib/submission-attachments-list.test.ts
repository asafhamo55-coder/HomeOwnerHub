import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type Recorded } from './test-utils/fake-supabase'

const h = vi.hoisted(() => ({
  fail: false,
  rows: [] as unknown[],
  signFail: new Set<string>(),
  client: null as unknown,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => null) }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRoleInOrg: vi.fn() }))
vi.mock('@/lib/storage-remove', () => ({ removeStorageObjects: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => h.client) }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import { listSubmissionAttachments } from './submission-attachments'

function respond(_q: Recorded) {
  if (h.fail) return { data: null, error: { code: '42501', message: 'denied' } }
  return { data: h.rows, error: null }
}

beforeEach(() => {
  h.fail = false
  h.signFail.clear()
  h.rows = [
    { id: 'a1', file_name: 'one.pdf', content_type: 'application/pdf', size_bytes: 1, uploaded_by_role: 'board', storage_path: 'p/one', created_at: 'c1' },
    { id: 'a2', file_name: 'two.png', content_type: 'image/png', size_bytes: 2, uploaded_by_role: 'resident', storage_path: 'p/two', created_at: 'c2' },
  ]
  const base = fakeSupabase(respond).client
  h.client = {
    ...base,
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) =>
          h.signFail.has(path)
            ? { data: null, error: { message: 'nope' } }
            : { data: { signedUrl: `https://signed/${path}` }, error: null },
      }),
    },
  }
})

describe('listSubmissionAttachments', () => {
  it('success is unchanged', async () => {
    const r = await listSubmissionAttachments('ticket', 'x')
    expect(r).toHaveLength(2)
    expect(r?.[0]).toMatchObject({ id: 'a1', fileName: 'one.pdf', signedUrl: 'https://signed/p/one' })
  })
  it('no rows is an empty list, not a failure', async () => {
    h.rows = []
    expect(await listSubmissionAttachments('ticket', 'x')).toEqual([])
  })
  it('a failed read is null, not an empty list', async () => {
    h.fail = true
    expect(await listSubmissionAttachments('ticket', 'x')).toBeNull()
  })
  it('one failed signed URL is null for that file only', async () => {
    h.signFail.add('p/one')
    const r = await listSubmissionAttachments('ticket', 'x')
    expect(r?.map((a) => a.signedUrl)).toEqual([null, 'https://signed/p/two'])
  })
})
