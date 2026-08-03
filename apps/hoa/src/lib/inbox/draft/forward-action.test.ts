import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

const insert = vi.fn()
const attachmentInsert = vi.fn()
let attachmentInsertError: { code: string; message: string } | null = null
// The rows the org-scoped inbox_attachments read resolves to. Mutable so a
// test can give a stored file a name that cannot go in a MIME header.
let sourceAttachmentRows: Array<Record<string, unknown>> = []

function defaultSourceRows() {
  return [
    {
      id: 'att-1',
      storage_path: 'org-1/att-1',
      file_name: 'photo.jpg',
      content_type: 'image/jpeg',
      size_bytes: 1024,
    },
  ]
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => {
      if (table === 'inbox_drafts') {
        const chain: Record<string, unknown> = {
          insert: vi.fn((values: unknown) => {
            insert(values)
            return chain
          }),
          select: vi.fn(() => chain),
          single: vi.fn(async () => ({ data: { id: 'draft-1' }, error: null })),
        }
        return chain
      }
      if (table === 'inbox_attachments') {
        const chain: Record<string, unknown> = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          in: vi.fn(() => Promise.resolve({ data: sourceAttachmentRows, error: null })),
        }
        return chain
      }
      if (table === 'inbox_draft_attachments') {
        const chain: Record<string, unknown> = {
          insert: vi.fn((values: unknown) => {
            attachmentInsert(values)
            return Promise.resolve({ data: null, error: attachmentInsertError })
          }),
        }
        return chain
      }
      throw new Error(`unexpected table: ${table}`)
    }),
  })),
}))

vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/inbox/queries', () => ({
  getThreadDetail: vi.fn(async () => ({
    id: 'thread-1',
    subject: 'Fence repair',
    status: 'open',
    unitId: null,
    vendorId: null,
    matchConfidence: 'high',
    matchReason: null,
    matchSource: 'manual',
    messages: [
      {
        id: 'msg-1',
        direction: 'inbound',
        fromName: 'Jane Resident',
        fromEmail: 'jane@example.com',
        toEmails: ['board@example.com'],
        subject: 'Fence repair',
        bodyText: 'The fence is broken.',
        strippedText: 'The fence is broken.',
        sentAt: '2026-08-01T12:00:00Z',
        attachments: [
          { id: 'att-1', fileName: 'photo.jpg', sizeBytes: 1024, fetchStatus: 'stored' },
          { id: 'att-2', fileName: 'invoice.pdf', sizeBytes: 2048, fetchStatus: 'failed' },
        ],
      },
    ],
  })),
}))

import { createForwardDraft } from './actions'

describe('createForwardDraft', () => {
  beforeEach(() => {
    insert.mockClear()
    attachmentInsert.mockClear()
    attachmentInsertError = null
    sourceAttachmentRows = defaultSourceRows()
  })

  it('inserts a forward draft with no recipients and no AI metadata', async () => {
    const result = await createForwardDraft('thread-1')
    expect('ok' in result).toBe(true)
    const values = insert.mock.calls[0][0] as Record<string, unknown>
    expect(values.kind).toBe('forward')
    expect(values.to_emails).toEqual([])
    expect(values.subject).toBe('Fwd: Fence repair')
    expect(values.body_text).toContain('---------- Forwarded message ----------')
    // A forward is written by a human, so nothing here came from a model.
    expect(values.citations).toEqual([])
    expect(values.blanks).toEqual([])
    expect(values.ai_run_id).toBeUndefined()
  })

  it('auto-attaches the stored files that arrived on the thread', async () => {
    await createForwardDraft('thread-1')
    const attached = attachmentInsert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(attached).toHaveLength(1)
    expect(attached[0].source).toBe('inbox')
    expect(attached[0].file_name).toBe('photo.jpg')
  })

  it('skips files that never downloaded rather than attaching a broken row', async () => {
    // The scripted thread has one 'stored' and one 'failed' attachment.
    await createForwardDraft('thread-1')
    const attached = attachmentInsert.mock.calls[0][0] as unknown[]
    expect(attached).toHaveLength(1)
  })

  it('skips a file whose name cannot go in a MIME header, keeping the rest', async () => {
    // A resident-supplied filename with a quote in it would fail the whole
    // send later — after the undo window, under a banner claiming the reply
    // may already have reached them. Drop just that file here.
    sourceAttachmentRows = [
      {
        id: 'att-1',
        storage_path: 'org-1/att-1',
        file_name: 'my "photo".jpg',
        content_type: 'image/jpeg',
        size_bytes: 1024,
      },
      {
        id: 'att-3',
        storage_path: 'org-1/att-3',
        file_name: 'gate.jpg',
        content_type: 'image/jpeg',
        size_bytes: 2048,
      },
    ]
    const result = await createForwardDraft('thread-1')
    expect('ok' in result).toBe(true)
    const attached = attachmentInsert.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(attached).toHaveLength(1)
    expect(attached[0].file_name).toBe('gate.jpg')
  })

  it('still creates the forward when EVERY auto-attachment is unusable', async () => {
    sourceAttachmentRows = [
      {
        id: 'att-1',
        storage_path: 'org-1/att-1',
        file_name: 'my "photo".jpg',
        content_type: 'image/jpeg',
        size_bytes: 1024,
      },
    ]
    const result = await createForwardDraft('thread-1')
    expect('ok' in result).toBe(true)
    // Nothing attachable is left, so no insert is attempted at all.
    expect(attachmentInsert).not.toHaveBeenCalled()
  })

  it('logs the count skipped, never the file name', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    sourceAttachmentRows = [
      {
        id: 'att-1',
        storage_path: 'org-1/att-1',
        file_name: 'jane smith "unit 4b".jpg',
        content_type: 'image/jpeg',
        size_bytes: 1024,
      },
    ]
    await createForwardDraft('thread-1')
    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join('\n')
    expect(logged).toContain('skipped 1')
    expect(logged).not.toContain('jane')
    expect(logged).not.toContain('unit 4b')
    errorSpy.mockRestore()
  })

  it('still creates the draft when the attachment copy fails', async () => {
    attachmentInsertError = { code: '23505', message: 'duplicate' }
    const result = await createForwardDraft('thread-1')
    // Losing the auto-attach is a convenience; losing the draft is not. The
    // human can re-attach from the picker.
    expect('ok' in result).toBe(true)
  })
})
