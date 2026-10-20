import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BL-101 A8 — "Save to documents". Fake board RLS client; synthetic ids,
// names and text only. No storage or database is touched.

const ORG = '00000000-0000-4000-8000-000000000001'
const ATT = '00000000-0000-4000-8000-0000000000a1'
const THREAD = '00000000-0000-4000-8000-0000000000b1'
const MSG = '00000000-0000-4000-8000-0000000000c1'
const SRC = `${ORG}/inbox/${THREAD}/${MSG}/${ATT}/coi.pdf`

let attachmentRow: Record<string, unknown> | null
let inserted: Record<string, unknown> | null
let insertError: { code: string } | null
let copyError: { message: string; statusCode?: string } | null
let copies: Array<[string, string]>
let removed: string[][]

function fakeDb() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) chain[m] = () => chain
      chain.maybeSingle = async () => {
        if (table === 'inbox_attachments') return { data: attachmentRow, error: null }
        if (table === 'inbox_messages') return { data: { sent_at: '2026-10-19T10:00:00Z' }, error: null }
        return { data: null, error: null }
      }
      chain.insert = (row: Record<string, unknown>) => {
        inserted = row
        return { select: () => ({ single: async () => (insertError ? { data: null, error: insertError } : { data: { id: 'doc-1' }, error: null }) }) }
      }
      return chain
    },
    storage: {
      from: () => ({
        copy: async (from: string, to: string) => {
          copies.push([from, to])
          return { data: copyError ? null : { path: to }, error: copyError }
        },
        remove: async (paths: string[]) => {
          removed.push(paths)
          return { data: paths.map((name) => ({ name })), error: null }
        },
      }),
    },
  }
}

let gate: { ok: true; role: 'board'; orgId: string } | { ok: false; error: string }
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => gate),
}))
const getClient = vi.fn(async () => fakeDb())
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: () => getClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const readPdfTexts = vi.fn()
vi.mock('./attachment-pdf', () => ({ readPdfTexts: (...a: unknown[]) => readPdfTexts(...a) }))

import { saveAttachmentToDocuments } from './attachment-file'

function form(over: Record<string, string> = {}) {
  const f = new FormData()
  const values = { attachmentId: ATT, name: 'Vendor COI', type: 'other', ...over }
  for (const [k, v] of Object.entries(values)) f.set(k, v)
  return f
}

let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  gate = { ok: true, role: 'board', orgId: ORG }
  attachmentRow = {
    id: ATT,
    thread_id: THREAD,
    message_id: MSG,
    file_name: 'coi.pdf',
    content_type: 'application/pdf',
    size_bytes: 120_000,
    storage_path: SRC,
    fetch_status: 'stored',
  }
  inserted = null
  insertError = null
  copyError = null
  copies = []
  removed = []
  readPdfTexts.mockReset().mockResolvedValue([{ fileName: 'coi.pdf', text: 'Certificate of insurance' }])
  getClient.mockClear()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorSpy.mockRestore())

describe('saveAttachmentToDocuments', () => {
  it('copies the file and inserts a library row with provenance in the name', async () => {
    const r = await saveAttachmentToDocuments({}, form())
    expect(r).toEqual({ ok: true, documentId: 'doc-1' })
    expect(copies).toEqual([[SRC, `${ORG}/from-inbox/${ATT}/coi.pdf`]])
    expect(inserted).toMatchObject({
      org_id: ORG,
      name: 'Vendor COI (from email, 2026-10-19)',
      type: 'other',
      storage_path: `${ORG}/from-inbox/${ATT}/coi.pdf`,
      file_size: 120_000,
      parsed_text: 'Certificate of insurance',
    })
    expect(inserted).not.toHaveProperty('visible_to_owners')
  })

  it('a denied caller never gets a database client', async () => {
    gate = { ok: false, error: 'Only board members and admins can make this change.' }
    const r = await saveAttachmentToDocuments({}, form())
    expect(r.error).toMatch(/Only board members/)
    expect(getClient).not.toHaveBeenCalled()
  })

  it('validates type and size the same way as Upload', async () => {
    attachmentRow = { ...attachmentRow!, file_name: 'photo.jpg', storage_path: `${ORG}/inbox/${THREAD}/${MSG}/${ATT}/photo.jpg` }
    expect((await saveAttachmentToDocuments({}, form())).error).toMatch(/PDF, Word/)
    attachmentRow = { ...attachmentRow!, file_name: 'big.pdf', size_bytes: 60 * 1024 * 1024 }
    expect((await saveAttachmentToDocuments({}, form())).error).toBe('Max file size is 50 MB.')
    expect((await saveAttachmentToDocuments({}, form({ type: 'minutes' }))).fieldErrors?.type).toBe('Pick a document type.')
    expect(copies).toEqual([])
  })

  it('refuses a file that has not finished downloading', async () => {
    attachmentRow = { ...attachmentRow!, fetch_status: 'pending', storage_path: null }
    expect((await saveAttachmentToDocuments({}, form())).error).toMatch(/finished downloading/)
  })

  it('refuses a storage path outside this attachment’s own folder', async () => {
    attachmentRow = { ...attachmentRow!, storage_path: `00000000-0000-4000-8000-000000000009/inbox/${THREAD}/${MSG}/${ATT}/coi.pdf` }
    expect((await saveAttachmentToDocuments({}, form())).error).toMatch(/can’t be filed/)
    expect(copies).toEqual([])
  })

  it('says so when the attachment is already filed', async () => {
    copyError = { message: 'The resource already exists', statusCode: '409' }
    expect((await saveAttachmentToDocuments({}, form())).error).toBe('This file is already in the documents library.')
    expect(inserted).toBeNull()
  })

  it('removes the copy when the row insert fails', async () => {
    insertError = { code: '42501' }
    const r = await saveAttachmentToDocuments({}, form())
    expect(r.error).toMatch(/Couldn’t add/)
    expect(removed).toEqual([[`${ORG}/from-inbox/${ATT}/coi.pdf`]])
  })

  it('files a non-PDF without reading text', async () => {
    attachmentRow = { ...attachmentRow!, file_name: 'plan.docx', content_type: null, storage_path: `${ORG}/inbox/${THREAD}/${MSG}/${ATT}/plan.docx` }
    await saveAttachmentToDocuments({}, form())
    expect(readPdfTexts).not.toHaveBeenCalled()
    expect(inserted).toMatchObject({ parsed_text: null, parsed_at: null })
  })

  it('never logs the file name or path', async () => {
    insertError = { code: '42501' }
    await saveAttachmentToDocuments({}, form())
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain('coi.pdf')
    expect(logged).not.toContain('Vendor COI')
  })
})
