import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-175a M7 (app side): recordAttachmentUpload only records a path inside
// `${org}/submissions/<type>/<parent>/`.

const insert = vi.fn(async (..._a: unknown[]) => ({ error: null }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRoleInOrg: vi.fn(async () => 'board') }))
vi.mock('@/lib/storage-remove', () => ({ removeStorageObjects: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({ insert }),
  })),
}))

import { recordAttachmentUpload } from './submission-attachments'

const PARENT = '11111111-1111-4111-8111-111111111111'
const OTHER_PARENT = '22222222-2222-4222-8222-222222222222'
const call = (storagePath: string) =>
  recordAttachmentUpload({
    threadType: 'ticket',
    parentId: PARENT,
    storagePath,
    fileName: 'a.png',
    contentType: 'image/png',
    sizeBytes: 10,
  })

describe('recordAttachmentUpload storage path', () => {
  beforeEach(() => {
    insert.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('records a path under the org, type and parent', async () => {
    expect(await call(`org-1/submissions/ticket/${PARENT}/f.png`)).toEqual({ ok: true })
    expect(insert).toHaveBeenCalled()
  })

  it.each([
    `org-2/submissions/ticket/${PARENT}/f.png`,
    `org-1/submissions/arc/${PARENT}/f.png`,
    `org-1/submissions/ticket/${OTHER_PARENT}/f.png`,
    `org-1/submissions/ticket/${PARENT}/../${OTHER_PARENT}/f.png`,
    'org-1/submissions/',
  ])('refuses %s without inserting', async (p) => {
    const r = await call(p)
    expect(r.ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })
})
