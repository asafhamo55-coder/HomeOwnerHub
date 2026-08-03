import { describe, it, expect, beforeEach, vi } from 'vitest'

// Per-table scripts the tests drive directly, plus spies on the two
// mutating calls (insert, storage remove) that the refusal tests assert
// were never reached.
let draftStatus = 'draft'
let attachmentRow: Record<string, unknown> | null = null
let inboxAttachmentRow: Record<string, unknown> | null = {
  storage_path: 'p/1',
  file_name: 'a.pdf',
  content_type: null,
  size_bytes: 10,
  fetch_status: 'stored',
}

const insert = vi.fn()
const storageRemove = vi.fn()

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl: vi.fn(async () => ({ data: { path: 'p', token: 't' }, error: null })),
        remove: vi.fn(async (paths: string[]) => {
          storageRemove(paths)
          return { data: null, error: null }
        }),
      })),
    },
    from: vi.fn((table: string) => {
      let selectedCols = ''
      const chain: Record<string, unknown> = {
        select: vi.fn((cols: string) => {
          selectedCols = cols
          return chain
        }),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        insert: vi.fn((values: unknown) => {
          insert(values)
          return Promise.resolve({ error: null })
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'inbox_drafts') {
            return {
              data: { id: 'draft-1', thread_id: 'thread-1', status: draftStatus },
              error: null,
            }
          }
          if (table === 'inbox_draft_attachments') {
            return { data: attachmentRow, error: null }
          }
          if (table === 'inbox_attachments') {
            return { data: inboxAttachmentRow, error: null }
          }
          if (table === 'hoa_documents') {
            return { data: null, error: null }
          }
          return { data: null, error: null }
        }),
        // Some reads (the attachment-budget list, the delete statement)
        // are awaited directly without a terminal maybeSingle() — make the
        // chain itself thenable so `await supabase.from(...).select(...)`
        // resolves like the real query builder does.
        then: (resolve: (value: { data: unknown; error: null }) => void) => {
          if (table === 'inbox_draft_attachments' && selectedCols === 'size_bytes') {
            resolve({ data: [], error: null })
          } else {
            resolve({ data: null, error: null })
          }
        },
      }
      return chain
    }),
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createAttachmentUploadUrl, addDraftAttachment, removeDraftAttachment } from './attachment-actions'

beforeEach(() => {
  draftStatus = 'draft'
  attachmentRow = null
  inboxAttachmentRow = {
    storage_path: 'p/1',
    file_name: 'a.pdf',
    content_type: null,
    size_bytes: 10,
    fetch_status: 'stored',
  }
  insert.mockClear()
  storageRemove.mockClear()
})

describe('addDraftAttachment — a forged ref must not reach another org', () => {
  beforeEach(() => insert.mockClear())

  it('refuses an upload path outside this org and draft prefix', async () => {
    const result = await addDraftAttachment('draft-1', 'upload', 'inbox-drafts/other-org/x/y', {
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
    })
    expect('error' in result).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses an upload whose path names a different draft in the same org', async () => {
    const result = await addDraftAttachment('draft-1', 'upload', 'inbox-drafts/org-1/draft-2/y', {
      fileName: 'a.pdf',
      contentType: null,
      sizeBytes: 10,
    })
    expect('error' in result).toBe(true)
  })

  it('refuses a cross-org inbox attachment — the org-scoped read returns nothing', async () => {
    inboxAttachmentRow = null
    const result = await addDraftAttachment('draft-1', 'inbox', 'attachment-from-another-org')
    expect('error' in result).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses an inbox attachment that never downloaded', async () => {
    inboxAttachmentRow = { storage_path: 'p/1', file_name: 'a.pdf', content_type: null, size_bytes: 10, fetch_status: 'failed' }
    const result = await addDraftAttachment('draft-1', 'inbox', 'att-1')
    expect('error' in result).toBe(true)
  })
})

describe('attachment mutations require an editable draft', () => {
  it.each(['queued', 'sending', 'sent', 'cancelled', 'failed'])(
    'refuses to attach to a %s draft',
    async (status) => {
      draftStatus = status
      const result = await addDraftAttachment('draft-1', 'inbox', 'att-1')
      expect('error' in result).toBe(true)
    },
  )

  it('refuses to mint an upload URL for a queued draft', async () => {
    draftStatus = 'queued'
    const result = await createAttachmentUploadUrl('draft-1', 'a.pdf', 10)
    expect('error' in result).toBe(true)
  })

  it('refuses an upload URL for a file over the cap', async () => {
    draftStatus = 'draft'
    const result = await createAttachmentUploadUrl('draft-1', 'big.pdf', 16 * 1024 * 1024)
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toContain('15 MB')
  })

  it('does not put the caller-supplied filename in the storage path', async () => {
    draftStatus = 'draft'
    const result = await createAttachmentUploadUrl('draft-1', '../../escape.pdf', 10)
    expect('ok' in result).toBe(true)
    if ('ok' in result) expect(result.path).not.toContain('escape')
  })
})

describe('removeDraftAttachment', () => {
  it('deletes the storage object for an upload', async () => {
    attachmentRow = { id: 'a1', draft_id: 'draft-1', source: 'upload', storage_path: 'p/1' }
    await removeDraftAttachment('a1')
    expect(storageRemove).toHaveBeenCalledWith(['p/1'])
  })

  it.each(['inbox', 'document'])(
    'never deletes the storage object for a %s reference — it is the live file',
    async (source) => {
      attachmentRow = { id: 'a1', draft_id: 'draft-1', source, storage_path: 'governing/ccrs.pdf' }
      await removeDraftAttachment('a1')
      expect(storageRemove).not.toHaveBeenCalled()
    },
  )
})
