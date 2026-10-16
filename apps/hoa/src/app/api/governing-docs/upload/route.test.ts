import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_DOCUMENT_TEXT, MAX_UPLOAD_BYTES } from '@/lib/api/limits'

// ─── Mocks ───────────────────────────────────────────────────────────

const DENIED = 'Only board members and admins can make this change.'
const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as
    | { ok: true; role: 'admin' | 'board'; orgId: string }
    | { ok: false; error: string },
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))

// A raw Postgres-style message that embeds a value; it must never reach a response.
const RAW = 'duplicate key value violates unique constraint "governing_documents_pkey" Key (title)=(Jane Doe Rules)'

let associationOwned = true
let docInsertError: { code: string; message: string } | null = null
let chunkInsertError: { code: string; message: string } | null = null
let uploadError: { statusCode: string; message: string } | null = null
let removeError: { statusCode: string; message: string } | null = null
let docDeleteError: { code: string; message: string } | null = null
let embedThrows = false
let pdfThrows = false

const docInserts: unknown[] = []
const chunkInserts: unknown[] = []
const docDeletes: Array<Array<[string, unknown]>> = []
const uploads: string[] = []
const removes: string[][] = []

function storage() {
  return {
    from: () => ({
      upload: async (path: string) => {
        uploads.push(path)
        return { data: uploadError ? null : { path }, error: uploadError }
      },
      remove: async (paths: string[]) => {
        removes.push(paths)
        return { data: removeError ? null : [], error: removeError }
      },
    }),
  }
}

const getSupabaseServerClient = vi.fn(async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  storage: storage(),
  from: (table: string) => {
    if (table === 'associations') {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: associationOwned ? { id: 'x' } : null, error: null }),
      }
      return q
    }
    if (table === 'governing_documents') {
      return {
        insert: (row: unknown) => {
          docInserts.push(row)
          return {
            select: () => ({
              single: async () =>
                docInsertError ? { data: null, error: docInsertError } : { data: { id: 'doc-1' }, error: null },
            }),
          }
        },
      }
    }
    throw new Error(`unexpected table ${table}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient }))

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    storage: storage(),
    from: (table: string) => {
      if (table === 'governing_document_chunks') {
        return {
          insert: async (rows: unknown) => {
            chunkInserts.push(rows)
            return { error: chunkInsertError }
          },
        }
      }
      if (table === 'governing_documents') {
        const scope: Array<[string, unknown]> = []
        docDeletes.push(scope)
        const q = {
          delete: () => q,
          eq: (c: string, v: unknown) => {
            scope.push([c, v])
            return scope.length === 2 ? Promise.resolve({ error: docDeleteError }) : q
          },
        }
        return q
      }
      throw new Error(`unexpected admin table ${table}`)
    },
  }),
}))

vi.mock('@homeowner-portal/ai', () => ({
  embedTexts: vi.fn(async (texts: string[]) => {
    if (embedThrows) throw new Error(`provider said: ${RAW}`)
    return texts.map(() => [0.1, 0.2])
  }),
  toPgVector: (v: number[]) => `[${v.join(',')}]`,
}))

vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => {
    if (pdfThrows) throw new Error('bad xref')
    return { text: 'Article 1. '.repeat(40), version: '1.1.1' }
  }),
}))

const { POST } = await import('./route')

// ─── Helpers ─────────────────────────────────────────────────────────

const ASSOC = '11111111-1111-4111-8111-111111111111'
const LONG = 'The association shall maintain the common areas in good repair. '.repeat(5)

function post(fields: Record<string, string | Blob>): Request {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return new Request('http://x/api/governing-docs/upload', { method: 'POST', body: f })
}

const base = { title: 'Rules', type: 'rules', associationId: ASSOC }

/** Everything the route logged. Codes and ids only — never a raw message (RC-2). */
function logged(): string {
  const err = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
  const warn = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls
  const text = JSON.stringify([...err, ...warn])
  expect(text).not.toContain('duplicate key')
  expect(text).not.toContain('Jane Doe')
  expect(text).not.toContain('bad xref')
  expect(text).not.toContain('provider said')
  return text
}

async function envelope(res: Response) {
  const text = await res.text()
  expect(text).not.toContain('duplicate key')
  expect(text).not.toContain('Jane Doe')
  expect(text).not.toContain('bad xref')
  return JSON.parse(text) as { error: { code: string; message: string; reason?: string; issues?: unknown[] } }
}

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  associationOwned = true
  docInsertError = null
  chunkInsertError = null
  uploadError = null
  removeError = null
  docDeleteError = null
  embedThrows = false
  pdfThrows = false
  docInserts.length = 0
  chunkInserts.length = 0
  docDeletes.length = 0
  uploads.length = 0
  removes.length = 0
  process.env.EMBEDDING_BASE_URL = 'http://embed.test'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// ─── Tests ───────────────────────────────────────────────────────────

describe('POST /api/governing-docs/upload', () => {
  it('a resident gets the 403 envelope before the body is read', async () => {
    h.gate = { ok: false, error: DENIED }
    const res = await POST(post({ ...base, associationId: 'not-a-uuid' }))
    expect(res.status).toBe(403)
    expect((await envelope(res)).error.code).toBe('forbidden')
    expect(docInserts).toHaveLength(0)
  })

  it('a malformed multipart body is 400 validation_failed, not a thrown 500', async () => {
    const res = await POST(
      new Request('http://x/api/governing-docs/upload', {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=zzz' },
        body: 'garbage',
      }),
    )
    expect(res.status).toBe(400)
    expect((await envelope(res)).error.code).toBe('validation_failed')
  })

  it('a non-uuid associationId and a non-date effectiveDate are 400 with field issues', async () => {
    const res = await POST(post({ ...base, associationId: 'abc', effectiveDate: '2026-02-30', pastedText: LONG }))
    expect(res.status).toBe(400)
    const body = await envelope(res)
    expect(body.error.code).toBe('validation_failed')
    const paths = (body.error.issues as Array<{ path: string }>).map((i) => i.path)
    expect(paths).toEqual(expect.arrayContaining(['associationId', 'effectiveDate']))
    expect(docInserts).toHaveLength(0)
  })

  it('an associationId outside the caller org is 404 and nothing is stored', async () => {
    associationOwned = false
    const res = await POST(post({ ...base, pastedText: LONG }))
    expect(res.status).toBe(404)
    expect((await envelope(res)).error.code).toBe('not_found')
    expect(docInserts).toHaveLength(0)
  })

  it('no file and no pasted text is 400 validation_failed', async () => {
    const res = await POST(post(base))
    expect(res.status).toBe(400)
    expect((await envelope(res)).error.code).toBe('validation_failed')
  })

  it('pasted text over the document limit is 413', async () => {
    const res = await POST(post({ ...base, pastedText: 'x'.repeat(MAX_DOCUMENT_TEXT + 1) }))
    expect(res.status).toBe(413)
    expect((await envelope(res)).error.code).toBe('payload_too_large')
  })

  it('a file over MAX_UPLOAD_BYTES is the 413 envelope', async () => {
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'big.pdf', { type: 'application/pdf' })
    const res = await POST(post({ ...base, file: big }))
    expect(res.status).toBe(413)
    const body = await envelope(res)
    expect(body.error.code).toBe('payload_too_large')
    expect(uploads).toHaveLength(0)
  })

  it('a disallowed MIME type is 415', async () => {
    const html = new File(['<html>' + LONG + '</html>'], 'x.html', { type: 'text/html' })
    const res = await POST(post({ ...base, file: html }))
    expect(res.status).toBe(415)
    expect((await envelope(res)).error.code).toBe('unsupported_media_type')
  })

  it('an unreadable PDF is 422 with reason pdf_parse_failed and stores nothing', async () => {
    pdfThrows = true
    const pdf = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' })
    const res = await POST(post({ ...base, file: pdf }))
    expect(res.status).toBe(422)
    const body = await envelope(res)
    expect(body.error).toMatchObject({ code: 'unprocessable', reason: 'pdf_parse_failed' })
    expect(uploads).toHaveLength(0)
  })

  it('text under 100 characters is refused before anything is uploaded', async () => {
    const short = new File(['too short'], 'a.txt', { type: 'text/plain' })
    const res = await POST(post({ ...base, file: short }))
    expect(res.status).toBe(422)
    expect((await envelope(res)).error.reason).toBe('content_too_short')
    expect(uploads).toHaveLength(0)
  })

  it('a failed document insert is a generic 500 and removes the stored object', async () => {
    docInsertError = { code: '23505', message: RAW }
    const txt = new File([LONG], 'rules.txt', { type: 'text/plain' })
    const res = await POST(post({ ...base, file: txt }))
    expect(res.status).toBe(500)
    expect((await envelope(res)).error.code).toBe('internal')
    expect(uploads).toHaveLength(1)
    expect(removes).toEqual([[uploads[0]]])
  })

  it('a failed chunk insert is a generic 500 and deletes the doc row and object (R-19)', async () => {
    chunkInsertError = { code: '23502', message: RAW }
    const txt = new File([LONG], 'rules.txt', { type: 'text/plain' })
    const res = await POST(post({ ...base, file: txt }))
    expect(res.status).toBe(500)
    expect((await envelope(res)).error.code).toBe('internal')
    expect(docDeletes).toEqual([
      [
        ['id', 'doc-1'],
        ['organization_id', 'org-1'],
      ],
    ])
    expect(removes).toEqual([[uploads[0]]])
  })

  it('success is 201 camelCase, stored under the org prefix, org id from the gate', async () => {
    const md = new File(['## Article 1\n\n### Section 1.1\n' + LONG], 'rules.md', { type: '' })
    const res = await POST(post({ ...base, file: md, effectiveDate: '2026-01-15' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ documentId: 'doc-1', embeddingStatus: 'embedded', parserVersion: 'text-passthrough-1.0.0' })
    expect(body.chunkCount).toBeGreaterThan(0)
    expect(body).not.toHaveProperty('error')
    expect(uploads[0]).toMatch(new RegExp(`^org-1/${ASSOC}/\\d+-rules\\.md$`))
    expect(docInserts[0]).toMatchObject({ organization_id: 'org-1', association_id: ASSOC, effective_date: '2026-01-15' })
  })

  it('an embedding failure still saves, reports failed, and leaks no provider text', async () => {
    embedThrows = true
    const res = await POST(post({ ...base, pastedText: LONG }))
    expect(res.status).toBe(201)
    const text = await res.text()
    expect(text).not.toContain('provider said')
    const body = JSON.parse(text)
    expect(body.embeddingStatus).toBe('failed')
    expect(body).not.toHaveProperty('embeddingError')
  })
  it('pasted text is capped in bytes, so maxBytes is a real byte count (multibyte text)', async () => {
    // Fewer characters than the limit, more bytes than it: 'é' is 2 bytes in UTF-8.
    const text = 'é'.repeat(MAX_DOCUMENT_TEXT / 2 + 1)
    expect(text.length).toBeLessThan(MAX_DOCUMENT_TEXT)
    const res = await POST(post({ ...base, pastedText: text }))
    expect(res.status).toBe(413)
    const body = await envelope(res)
    expect(body.error).toMatchObject({ code: 'payload_too_large', maxBytes: MAX_DOCUMENT_TEXT, reason: 'text_too_long' })
    expect(docInserts).toHaveLength(0)
  })

  it('a text file whose text is over the byte limit is 413 with maxBytes and stores nothing', async () => {
    const txt = new File(['é'.repeat(MAX_DOCUMENT_TEXT / 2 + 1)], 'big.txt', { type: 'text/plain' })
    const res = await POST(post({ ...base, file: txt }))
    expect(res.status).toBe(413)
    expect((await envelope(res)).error).toMatchObject({ code: 'payload_too_large', maxBytes: MAX_DOCUMENT_TEXT })
    expect(uploads).toHaveLength(0)
  })

  it('a failed storage upload is a generic 500 and writes no row (RC-6: no success after a failed step)', async () => {
    uploadError = { statusCode: '500', message: RAW }
    const txt = new File([LONG], 'rules.txt', { type: 'text/plain' })
    const res = await POST(post({ ...base, file: txt }))
    expect(res.status).toBe(500)
    const body = await envelope(res)
    expect(body.error.code).toBe('internal')
    expect(uploads).toHaveLength(1)
    expect(docInserts).toHaveLength(0)
    expect(chunkInserts).toHaveLength(0)
    expect(removes).toHaveLength(0)
    const log = logged()
    expect(log).toContain('governing-docs.upload.storage')
    expect(log).toContain('org-1')
  })

  it('a failed doc insert whose object cleanup also fails is still the generic 500, both logged by code', async () => {
    docInsertError = { code: '23505', message: RAW }
    removeError = { statusCode: '403', message: RAW }
    const txt = new File([LONG], 'rules.txt', { type: 'text/plain' })
    const res = await POST(post({ ...base, file: txt }))
    expect(res.status).toBe(500)
    expect((await envelope(res)).error.code).toBe('internal')
    expect(removes).toEqual([[uploads[0]]])
    const log = logged()
    expect(log).toContain('governing-docs.upload.storage-remove')
    expect(log).toContain('governing-docs.upload.insert-doc')
    expect(log).toContain('23505')
  })

  it('when the compensating doc delete fails, the stored object is kept so the row does not dangle', async () => {
    chunkInsertError = { code: '23502', message: RAW }
    docDeleteError = { code: '42501', message: RAW }
    const txt = new File([LONG], 'rules.txt', { type: 'text/plain' })
    const res = await POST(post({ ...base, file: txt }))
    expect(res.status).toBe(500)
    expect((await envelope(res)).error.code).toBe('internal')
    expect(docDeletes).toHaveLength(1)
    // The surviving governing_documents row still references storage_path,
    // so the object must not be removed out from under it.
    expect(removes).toHaveLength(0)
    const log = logged()
    expect(log).toContain('governing-docs.upload.compensate-doc')
    expect(log).toContain('42501')
    expect(log).toContain('governing-docs.upload.insert-chunks')
    expect(log).toContain('23502')
    expect(log).toContain('doc-1')
  })

  it('failure logs carry codes and ids, never the raw DB / provider text', async () => {
    chunkInsertError = { code: '23502', message: RAW }
    const txt = new File([LONG], 'rules.txt', { type: 'text/plain' })
    await POST(post({ ...base, file: txt }))
    embedThrows = true
    chunkInsertError = null
    await POST(post({ ...base, pastedText: LONG }))
    pdfThrows = true
    await POST(post({ ...base, file: new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' }) }))
    const log = logged()
    expect(log).toContain('23502')
    expect(log).toContain('governing-docs.upload.embed')
    expect(log).toContain('governing-docs.upload.pdf-parse')
  })
})
