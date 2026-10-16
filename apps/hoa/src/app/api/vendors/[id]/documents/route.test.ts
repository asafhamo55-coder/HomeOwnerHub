import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  vendorFound: true,
  uploadError: null as null | { statusCode?: string; message: string },
  insertError: null as null | { code?: string; message: string },
  removeError: null as null | { message: string },
  removed: 1,
  uploads: [] as Array<{ path: string; contentType: string }>,
  inserts: [] as Array<Record<string, unknown>>,
  removes: [] as string[][],
  ownedChecks: [] as Array<[string, unknown][]>,
  supabaseCalls: 0,
}))

const SECRET = 'duplicate key value violates unique constraint "vendor_documents_pkey" Key (id)=(x@example.com)'

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Only the pre-fix route read this (org membership alone); kept so the before/after comparison is fair.
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => (h.role === null ? null : { id: 'org-1' })) }))

function vendorsQuery() {
  const eqs: [string, unknown][] = []
  const q = {
    select: () => q,
    eq(col: string, val: unknown) {
      eqs.push([col, val])
      return q
    },
    async maybeSingle() {
      h.ownedChecks.push(eqs)
      return { data: h.vendorFound ? { id: VENDOR } : null, error: null }
    },
  }
  return q
}

function documentsInsert(row: Record<string, unknown>) {
  h.inserts.push(row)
  return {
    select: () => ({
      single: async () => (h.insertError ? { data: null, error: h.insertError } : { data: { id: 'doc-1' }, error: null }),
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    h.supabaseCalls++
    return {
      auth: { getUser: async () => ({ data: { user: h.role === null ? null : { id: 'user-1' } } }) },
      from: (table: string) =>
        table === 'vendors' ? vendorsQuery() : { insert: (row: Record<string, unknown>) => documentsInsert(row) },
      storage: {
        from: () => ({
          upload: async (path: string, _file: unknown, opts: { contentType: string }) => {
            h.uploads.push({ path, contentType: opts.contentType })
            return { data: h.uploadError ? null : { path }, error: h.uploadError }
          },
          remove: async (paths: string[]) => {
            h.removes.push(paths)
            return { data: h.removeError ? null : paths.slice(0, h.removed), error: h.removeError }
          },
        }),
      },
    }
  }),
}))

const { POST } = await import('./route')

// ─── Helpers ─────────────────────────────────────────────────────────

const VENDOR = '11111111-1111-4111-8111-111111111111'

function pdf(name = 'coi.pdf', type = 'application/pdf', bytes = 10): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

function call(entries: Record<string, string | Blob> = { file: pdf(), docType: 'coi' }, id = VENDOR) {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return POST(new Request(`http://x/api/vendors/${id}/documents`, { method: 'POST', body: f }), {
    params: Promise.resolve({ id }),
  })
}

async function json(res: Response) {
  return (await res.json()) as { error?: { code: string; message: string; issues?: unknown[] } } & Record<
    string,
    unknown
  >
}

beforeEach(() => {
  h.role = 'board'
  h.vendorFound = true
  h.uploadError = null
  h.insertError = null
  h.removeError = null
  h.removed = 1
  h.uploads.length = 0
  h.inserts.length = 0
  h.removes.length = 0
  h.ownedChecks.length = 0
  h.supabaseCalls = 0
})

// ─── Tests ───────────────────────────────────────────────────────────

describe('POST /api/vendors/[id]/documents', () => {
  it('a resident gets 403 forbidden, not an RLS 404, before any upload (R-02, C-07)', async () => {
    h.role = 'resident'
    const res = await call()
    expect(res.status).toBe(403)
    expect((await json(res)).error?.code).toBe('forbidden')
    expect(h.uploads).toHaveLength(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('a signed-out caller gets 401 unauthenticated', async () => {
    h.role = null
    const res = await call()
    expect(res.status).toBe(401)
    expect((await json(res)).error?.code).toBe('unauthenticated')
  })

  it('a board member uploads: 201 camelCase body, org-scoped server-built path, vendor org-checked', async () => {
    const res = await call({ file: pdf('../../other-org/evil.pdf'), docType: 'w9', expiresAt: '2027-01-31' })
    expect(res.status).toBe(201)
    const body = await json(res)
    expect(body).toEqual({ storagePath: expect.any(String), documentId: 'doc-1' })
    expect(body.storagePath).toMatch(new RegExp(`^org-1/vendors/${VENDOR}/w9/\\d+-[0-9a-f-]+\\.pdf$`))
    expect(h.ownedChecks[0]).toEqual([
      ['id', VENDOR],
      ['organization_id', 'org-1'],
    ])
    expect(h.inserts[0]).toMatchObject({ organization_id: 'org-1', doc_type: 'w9', expires_at: '2027-01-31' })
  })

  it('a malformed multipart body is 400 validation_failed, not a thrown 500 (R-20)', async () => {
    const res = await POST(
      new Request(`http://x/api/vendors/${VENDOR}/documents`, {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=nope' },
        body: 'garbage',
      }),
      { params: Promise.resolve({ id: VENDOR }) },
    )
    expect(res.status).toBe(400)
    expect((await json(res)).error?.code).toBe('validation_failed')
  })

  it('an unknown docType is 400 validation_failed with issues', async () => {
    const res = await call({ file: pdf(), docType: 'passport' })
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error?.code).toBe('validation_failed')
    expect(body.error?.issues).toEqual([expect.objectContaining({ path: 'docType' })])
  })

  it('a bad expiresAt is 400, never a Postgres date error', async () => {
    const res = await call({ file: pdf(), docType: 'coi', expiresAt: '2026-02-30' })
    expect(res.status).toBe(400)
    expect(h.uploads).toHaveLength(0)
  })

  it('a missing file is 400 validation_failed', async () => {
    const res = await call({ docType: 'coi' })
    expect(res.status).toBe(400)
    expect((await json(res)).error?.code).toBe('validation_failed')
  })

  it('a non-uuid vendor id is 400 and never reaches the database', async () => {
    const res = await call(undefined, 'not-a-uuid')
    expect(res.status).toBe(400)
    expect(h.ownedChecks).toHaveLength(0)
  })

  it('an oversized file is 413 payload_too_large, not 400', async () => {
    const res = await call({ file: pdf('big.pdf', 'application/pdf', 25 * 1024 * 1024 + 1), docType: 'coi' })
    expect(res.status).toBe(413)
    const body = await json(res)
    expect(body.error).toMatchObject({ code: 'payload_too_large', maxBytes: 25 * 1024 * 1024 })
  })

  it('a disallowed MIME type is 415 unsupported_media_type', async () => {
    const res = await call({ file: pdf('x.html', 'text/html'), docType: 'coi' })
    expect(res.status).toBe(415)
    expect((await json(res)).error?.code).toBe('unsupported_media_type')
  })

  it('a typeless HEIC is accepted by extension; a typeless .exe is 415', async () => {
    const ok = await call({ file: pdf('photo.HEIC', ''), docType: 'license' })
    expect(ok.status).toBe(201)
    expect(h.uploads[0]?.contentType).toBe('image/heic')
    const bad = await call({ file: pdf('run.exe', ''), docType: 'license' })
    expect(bad.status).toBe(415)
  })

  it('a foreign or missing vendor is 404 not_found', async () => {
    h.vendorFound = false
    const res = await call()
    expect(res.status).toBe(404)
    expect((await json(res)).error?.code).toBe('not_found')
    expect(h.uploads).toHaveLength(0)
  })

  it('a missing bucket is 503 not_configured with no raw storage text', async () => {
    h.uploadError = { statusCode: '404', message: `Bucket not found ${SECRET}` }
    const res = await call()
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('not_configured')
    expect(text).not.toContain('Bucket not found')
  })

  it('any other storage failure is the generic 500 envelope with no raw text', async () => {
    h.uploadError = { statusCode: '500', message: SECRET }
    const res = await call()
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(text).not.toContain('duplicate key')
  })

  it('an insert failure removes the uploaded object and returns the generic 500 with no raw text', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.insertError = { code: '23503', message: SECRET }
    const res = await call()
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(text).not.toContain('duplicate key')
    expect(h.removes).toEqual([[h.uploads[0]!.path]])
    expect(JSON.stringify(spy.mock.calls)).not.toContain('example.com')
    spy.mockRestore()
  })

  it('a failed cleanup is logged without the storage message, still 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.insertError = { code: '23503', message: SECRET }
    h.removeError = { message: SECRET }
    const res = await call()
    expect(res.status).toBe(500)
    expect(JSON.stringify(spy.mock.calls)).toContain('vendors.documents.cleanup')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('example.com')
    spy.mockRestore()
  })
})
