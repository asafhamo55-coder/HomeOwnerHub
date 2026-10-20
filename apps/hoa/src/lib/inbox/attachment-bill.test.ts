import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-059 — "Scan as a bill" on an inbox attachment. Fake board RLS client
// and a mocked scan core: no storage, database or model is touched.
// Synthetic ids and names only.

const ORG = '00000000-0000-4000-8000-000000000001'
const ATT = '00000000-0000-4000-8000-0000000000a1'
const THREAD = '00000000-0000-4000-8000-0000000000b1'
const MSG = '00000000-0000-4000-8000-0000000000c1'
const SRC = `${ORG}/inbox/${THREAD}/${MSG}/${ATT}/invoice-secret-name.pdf`

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: '00000000-0000-4000-8000-000000000001' } as
    | { ok: true; role: 'board'; orgId: string }
    | { ok: false; error: string },
  row: null as Record<string, unknown> | null,
  readError: null as { code: string } | null,
  downloads: [] as string[],
  blobBytes: 1000,
  downloadError: null as { statusCode?: string } | null,
  user: { id: 'user-1' } as { id: string } | null,
  getClient: vi.fn(),
  scanBillFile: vi.fn(),
  revalidate: vi.fn(),
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('next/cache', () => ({ revalidatePath: h.revalidate }))
vi.mock('@/lib/bill-scan/scan-core', () => ({ BILL_STORAGE_BUCKET: 'hoa-documents', scanBillFile: h.scanBillFile }))

function fakeDb() {
  return {
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from(table: string) {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) chain[m] = () => chain
      chain.maybeSingle = async () =>
        table === 'inbox_attachments' ? { data: h.row, error: h.readError } : { data: null, error: null }
      return chain
    },
    storage: {
      from: () => ({
        download: async (path: string) => {
          h.downloads.push(path)
          if (h.downloadError) return { data: null, error: h.downloadError }
          return { data: new Blob([new Uint8Array(h.blobBytes)]), error: null }
        },
      }),
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: () => h.getClient() }))

import { scanAttachmentAsBill } from './attachment-bill'
import { ApiRouteError } from '@/lib/api/errors'

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.row = {
    id: ATT,
    thread_id: THREAD,
    file_name: 'invoice-secret-name.pdf',
    content_type: 'application/pdf',
    size_bytes: 1000,
    storage_path: SRC,
    fetch_status: 'stored',
  }
  h.readError = null
  h.downloads = []
  h.blobBytes = 1000
  h.downloadError = null
  h.user = { id: 'user-1' }
  h.getClient.mockReset().mockImplementation(async () => fakeDb())
  h.scanBillFile.mockReset().mockResolvedValue({
    duplicate: false,
    approvalRequestId: 'req-1',
    summary: 'Bill from Sample Landscaping Co · #SL-1',
    amountCents: 120000,
    missing: [],
    needsCheck: ['total'],
    warnings: [],
  })
  h.revalidate.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('scanAttachmentAsBill — gate and checks before any download or model call', () => {
  it('a resident is refused before any client is made', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect(await scanAttachmentAsBill(ATT)).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(h.getClient).not.toHaveBeenCalled()
  })

  it('a malformed id is refused before any read', async () => {
    expect(await scanAttachmentAsBill('../etc')).toMatchObject({ ok: false, error: 'Invalid attachment.' })
    expect(h.getClient).not.toHaveBeenCalled()
  })

  it('an attachment not in this org (RLS / org filter) is not found', async () => {
    h.row = null
    expect(await scanAttachmentAsBill(ATT)).toMatchObject({ ok: false, error: 'Attachment not found.' })
    expect(h.scanBillFile).not.toHaveBeenCalled()
  })

  it('a file still downloading is refused', async () => {
    h.row = { ...h.row, fetch_status: 'pending', storage_path: null }
    expect(await scanAttachmentAsBill(ATT)).toMatchObject({ ok: false, error: expect.stringContaining('finished downloading') })
  })

  it('a Word file or a declared type off the list is refused, even named .pdf', async () => {
    h.row = { ...h.row, file_name: 'minutes.docx', content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    expect((await scanAttachmentAsBill(ATT)).ok).toBe(false)
    h.row = { ...h.row, file_name: 'invoice.pdf', content_type: 'text/html' }
    expect((await scanAttachmentAsBill(ATT)).ok).toBe(false)
    expect(h.downloads).toEqual([])
  })

  it('a photo over the vision limit is refused from the row size', async () => {
    h.row = { ...h.row, file_name: 'bill.jpg', content_type: 'image/jpeg', size_bytes: 3 * 1024 * 1024 + 1 }
    expect(await scanAttachmentAsBill(ATT)).toMatchObject({ ok: false, error: expect.stringContaining('under 3 MB') })
    expect(h.downloads).toEqual([])
  })

  it.each([
    ['another org', `00000000-0000-4000-8000-000000000999/inbox/${THREAD}/${MSG}/${ATT}/a.pdf`],
    ['another thread', `${ORG}/inbox/00000000-0000-4000-8000-0000000000b9/${MSG}/${ATT}/a.pdf`],
    ['a dot segment', `${ORG}/inbox/${THREAD}/../${ATT}/a.pdf`],
    ['an encoded char', `${ORG}/inbox/${THREAD}/${MSG}/${ATT}/a%2F.pdf`],
  ])('a storage path into %s is refused before any download', async (_label, path) => {
    h.row = { ...h.row, storage_path: path }
    expect((await scanAttachmentAsBill(ATT)).ok).toBe(false)
    expect(h.downloads).toEqual([])
    expect(h.scanBillFile).not.toHaveBeenCalled()
  })

  it('the downloaded bytes are size-checked too (the row size is the provider’s word)', async () => {
    h.row = { ...h.row, file_name: 'bill.png', content_type: 'image/png', size_bytes: 1000 }
    h.blobBytes = 3 * 1024 * 1024 + 1
    expect(await scanAttachmentAsBill(ATT)).toMatchObject({ ok: false })
    expect(h.scanBillFile).not.toHaveBeenCalled()
  })

  it('a failed download is a plain message, logged with ids only', async () => {
    h.downloadError = { statusCode: '500' }
    expect(await scanAttachmentAsBill(ATT)).toMatchObject({ ok: false, error: 'Couldn’t open this file. Try again.' })
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('invoice-secret-name')
  })
})

describe('scanAttachmentAsBill — proposes through the shared scan', () => {
  it('hands the bytes to the scan core with the org, user, type and the thread link', async () => {
    const r = await scanAttachmentAsBill(ATT)
    expect(r).toEqual({
      ok: true,
      approvalRequestId: 'req-1',
      duplicate: false,
      summary: 'Bill from Sample Landscaping Co · #SL-1',
      missing: [],
      needsCheck: ['total'],
    })
    expect(h.downloads).toEqual([SRC])
    const [arg] = h.scanBillFile.mock.calls[0]!
    expect(arg).toMatchObject({
      orgId: ORG,
      userId: 'user-1',
      contentType: 'application/pdf',
      origin: { kind: 'inbox_attachment', threadId: THREAD, attachmentId: ATT },
      logArea: 'inbox.scan-bill',
    })
    expect(arg.bytes).toBeInstanceOf(Uint8Array)
    expect(arg.bytes.byteLength).toBe(1000)
    // Only the file goes in — no subject, body or sender is passed.
    expect(Object.keys(arg).sort()).toEqual(['bytes', 'contentType', 'logArea', 'orgId', 'origin', 'supabase', 'userId'])
    expect(h.revalidate).toHaveBeenCalledWith('/approvals')
  })

  it('a file that already has a live proposal points at it', async () => {
    h.scanBillFile.mockResolvedValueOnce({ duplicate: true, approvalRequestId: 'req-old' })
    expect(await scanAttachmentAsBill(ATT)).toEqual({ ok: true, approvalRequestId: 'req-old', duplicate: true })
  })

  it('over the board AI limit says so, flagged rateLimited', async () => {
    h.scanBillFile.mockRejectedValueOnce(new ApiRouteError('rate_limited', 'Your community has reached its limit.', { reason: 'org_limit' }))
    expect(await scanAttachmentAsBill(ATT)).toEqual({ ok: false, error: 'Your community has reached its limit.', rateLimited: true })
  })

  it('a scanned PDF with no text gets the inbox wording', async () => {
    h.scanBillFile.mockRejectedValueOnce(new ApiRouteError('unprocessable', 'x', { reason: 'no_text_layer' }))
    expect(await scanAttachmentAsBill(ATT)).toMatchObject({ ok: false, error: expect.stringContaining('no readable text') })
  })

  it('an internal failure is the generic message, never raw text', async () => {
    h.scanBillFile.mockRejectedValueOnce(new ApiRouteError('internal', 'duplicate key (summary)=(x)'))
    const r = await scanAttachmentAsBill(ATT)
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('duplicate key')
  })

  it('an unexpected throw is a plain message and logs no file name', async () => {
    h.scanBillFile.mockRejectedValueOnce(new Error('boom invoice-secret-name.pdf'))
    const r = await scanAttachmentAsBill(ATT)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('Couldn’t scan') })
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('invoice-secret-name')
  })
})
