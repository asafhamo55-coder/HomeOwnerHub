import { describe, it, expect, beforeEach, vi } from 'vitest'

// Per-table scripts the tests drive directly, plus spies on the mutating
// calls (insert, storage remove) that the refusal tests assert were never
// reached.
let draftStatus = 'draft'
let attachmentRow: Record<string, unknown> | null = null
let inboxAttachmentRow: Record<string, unknown> | null = {
  id: 'att-1',
  organization_id: 'org-1',
  storage_path: 'p/1',
  file_name: 'a.pdf',
  content_type: null,
  size_bytes: 10,
  fetch_status: 'stored',
}
let documentRow: Record<string, unknown> | null = null

// The real size of the object the mocked storage.info() reports back. Fix
// #4: addDraftAttachment must use THIS, not the client-declared
// `uploaded.sizeBytes`, for the budget check and the stored row.
let infoSize: number | null = 10

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
        info: vi.fn(async () =>
          infoSize === null
            ? { data: null, error: { message: 'not found' } }
            : { data: { size: infoSize }, error: null },
        ),
        remove: vi.fn(async (paths: string[]) => {
          storageRemove(paths)
          return { data: null, error: null }
        }),
      })),
    },
    // Filter-aware, not just table-aware: `.eq(col, val)` calls are
    // recorded and a row is only returned if EVERY filter the code
    // attached agrees with that row's actual field. This is the same
    // property `buildClaimRaceDb` in packages/jobs/src/mailbox-send.test.ts
    // exists for — a mock that returns data keyed only by table name would
    // pass identically whether or not the code's org-scoping `.eq(...)`
    // calls were ever mutated away.
    from: vi.fn((table: string) => {
      let selectedCols = ''
      const filters: Record<string, unknown> = {}
      const rowMatches = (row: Record<string, unknown>) =>
        Object.entries(filters).every(([col, val]) => row[col] === val)

      const chain: Record<string, unknown> = {
        select: vi.fn((cols: string) => {
          selectedCols = cols
          return chain
        }),
        eq: vi.fn((col: string, val: unknown) => {
          filters[col] = val
          return chain
        }),
        order: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        insert: vi.fn((values: unknown) => {
          insert(values)
          return Promise.resolve({ error: null })
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'inbox_drafts') {
            const row = {
              id: 'draft-1',
              thread_id: 'thread-1',
              status: draftStatus,
              organization_id: 'org-1',
            }
            return rowMatches(row) ? { data: row, error: null } : { data: null, error: null }
          }
          if (table === 'inbox_draft_attachments') {
            if (!attachmentRow) return { data: null, error: null }
            return rowMatches(attachmentRow)
              ? { data: attachmentRow, error: null }
              : { data: null, error: null }
          }
          if (table === 'inbox_attachments') {
            if (!inboxAttachmentRow) return { data: null, error: null }
            return rowMatches(inboxAttachmentRow)
              ? { data: inboxAttachmentRow, error: null }
              : { data: null, error: null }
          }
          if (table === 'hoa_documents') {
            if (!documentRow) return { data: null, error: null }
            return rowMatches(documentRow)
              ? { data: documentRow, error: null }
              : { data: null, error: null }
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

const UPLOAD_PATH = 'inbox-drafts/org-1/draft-1/11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  draftStatus = 'draft'
  attachmentRow = null
  inboxAttachmentRow = {
    id: 'att-1',
    organization_id: 'org-1',
    storage_path: 'p/1',
    file_name: 'a.pdf',
    content_type: null,
    size_bytes: 10,
    fetch_status: 'stored',
  }
  documentRow = null
  infoSize = 10
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

  it('refuses a path-traversal ref disguised with the correct org/draft prefix', async () => {
    // `startsWith('inbox-drafts/org-1/draft-1/')` is true for this string —
    // the bug a prefix check misses. Splitting on '/' catches it because
    // the segment count and the '..' segments both fail validation.
    const result = await addDraftAttachment(
      'draft-1',
      'upload',
      'inbox-drafts/org-1/draft-1/../../org-2/some-file',
      { fileName: 'a.pdf', contentType: null, sizeBytes: 10 },
    )
    expect('error' in result).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses an upload ref with extra nested segments under the right prefix', async () => {
    const result = await addDraftAttachment(
      'draft-1',
      'upload',
      'inbox-drafts/org-1/draft-1/sub/dir/file',
      { fileName: 'a.pdf', contentType: null, sizeBytes: 10 },
    )
    expect('error' in result).toBe(true)
  })

  it('accepts the exact shape this module mints for an upload', async () => {
    const result = await addDraftAttachment('draft-1', 'upload', UPLOAD_PATH, {
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
    })
    expect('ok' in result).toBe(true)
    expect(insert).toHaveBeenCalled()
  })

  it('refuses a cross-org inbox attachment — the org-scoped read returns nothing', async () => {
    // The row EXISTS (same id the caller asked for) but belongs to a
    // different org. Only a real `.eq('organization_id', ...)` filter
    // stops this from resolving.
    inboxAttachmentRow = {
      id: 'attachment-from-another-org',
      organization_id: 'org-2',
      storage_path: 'p/1',
      file_name: 'a.pdf',
      content_type: null,
      size_bytes: 10,
      fetch_status: 'stored',
    }
    const result = await addDraftAttachment('draft-1', 'inbox', 'attachment-from-another-org')
    expect('error' in result).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses an inbox attachment that never downloaded', async () => {
    inboxAttachmentRow = {
      id: 'att-1',
      organization_id: 'org-1',
      storage_path: 'p/1',
      file_name: 'a.pdf',
      content_type: null,
      size_bytes: 10,
      fetch_status: 'failed',
    }
    const result = await addDraftAttachment('draft-1', 'inbox', 'att-1')
    expect('error' in result).toBe(true)
  })

  it('refuses a cross-org document ref — the org-scoped (org_id) read returns nothing', async () => {
    documentRow = {
      id: 'doc-from-another-org',
      org_id: 'org-2',
      storage_path: 'governing/ccrs.pdf',
      name: 'CCRs.pdf',
      file_size: 1000,
    }
    const result = await addDraftAttachment('draft-1', 'document', 'doc-from-another-org')
    expect('error' in result).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('addDraftAttachment — upload size is verified against storage, not the client', () => {
  it('uses the real object size from storage.info(), not the client-declared size, for the budget check', async () => {
    // Client claims a tiny file; the object actually in storage is over
    // the cap. The stored row (and the budget check) must be driven by
    // the real size, or a client could under-report to slip past it.
    infoSize = 16 * 1024 * 1024
    const result = await addDraftAttachment('draft-1', 'upload', UPLOAD_PATH, {
      fileName: 'a.pdf',
      contentType: null,
      sizeBytes: 10,
    })
    expect('error' in result).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it('records the real storage size on the row, not the client-declared size', async () => {
    infoSize = 12345
    await addDraftAttachment('draft-1', 'upload', UPLOAD_PATH, {
      fileName: 'a.pdf',
      contentType: null,
      sizeBytes: 1, // client under-reports
    })
    expect(insert).toHaveBeenCalled()
    const values = insert.mock.calls[0][0] as Record<string, unknown>
    expect(values.size_bytes).toBe(12345)
  })

  it('refuses an upload whose real size could not be verified in storage', async () => {
    infoSize = null
    const result = await addDraftAttachment('draft-1', 'upload', UPLOAD_PATH, {
      fileName: 'a.pdf',
      contentType: null,
      sizeBytes: 10,
    })
    expect('error' in result).toBe(true)
    expect(insert).not.toHaveBeenCalled()
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

  it('refuses to remove an attachment from a queued draft', async () => {
    attachmentRow = {
      id: 'a1',
      organization_id: 'org-1',
      draft_id: 'draft-1',
      source: 'upload',
      storage_path: 'p/1',
    }
    draftStatus = 'queued'
    const result = await removeDraftAttachment('a1')
    expect('error' in result).toBe(true)
    expect(storageRemove).not.toHaveBeenCalled()
  })
})

describe('removeDraftAttachment', () => {
  it('deletes the storage object for an upload', async () => {
    attachmentRow = {
      id: 'a1',
      organization_id: 'org-1',
      draft_id: 'draft-1',
      source: 'upload',
      storage_path: 'p/1',
    }
    await removeDraftAttachment('a1')
    expect(storageRemove).toHaveBeenCalledWith(['p/1'])
  })

  it.each(['inbox', 'document'])(
    'never deletes the storage object for a %s reference — it is the live file',
    async (source) => {
      attachmentRow = {
        id: 'a1',
        organization_id: 'org-1',
        draft_id: 'draft-1',
        source,
        storage_path: 'governing/ccrs.pdf',
      }
      await removeDraftAttachment('a1')
      expect(storageRemove).not.toHaveBeenCalled()
    },
  )
})
