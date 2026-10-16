import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  user: { id: 'user-1' } as { id: string } | null,
  uploadError: null as null | { message: string; status?: number; statusCode?: string },
  signError: null as null | { message: string },
  uploads: [] as Array<{ path: string; contentType: string | undefined }>,
  dbTouched: 0,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))

vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    h.dbTouched++
    return {
      auth: { getUser: async () => ({ data: { user: h.user } }) },
      storage: {
        from: () => ({
          upload: async (path: string, _file: unknown, opts: { contentType?: string }) => {
            h.uploads.push({ path, contentType: opts.contentType })
            return { data: h.uploadError ? null : { path }, error: h.uploadError }
          },
          createSignedUrl: async (path: string) =>
            h.signError
              ? { data: null, error: h.signError }
              : { data: { signedUrl: `https://signed.example/${path}` }, error: null },
        }),
      },
    }
  }),
}))

import { POST } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])

function photo(name = 'yard.png', type = 'image/png', bytes: BlobPart = PNG): File {
  return new File([bytes], name, { type })
}

function req(fd: FormData | string, headers: Record<string, string> = {}): Request {
  return new Request('http://x/api/violations/photo', { method: 'POST', body: fd, headers })
}

function withFile(file: File | string): FormData {
  const fd = new FormData()
  fd.append('file', file)
  return fd
}

/** A raw multipart body, so the part's Content-Type is exactly what a hostile client sends. */
function rawMultipart(filename: string, partType: string | null): Request {
  const boundary = 'xBOUNDARYx'
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    (partType === null ? '' : `Content-Type: ${partType}\r\n`) +
    `\r\n<html>not an image</html>\r\n--${boundary}--\r\n`
  return req(body, { 'content-type': `multipart/form-data; boundary=${boundary}` })
}

async function json(res: Response) {
  return (await res.json()) as { error?: { code: string; message: string; [k: string]: unknown } } & Record<
    string,
    unknown
  >
}

beforeEach(() => {
  h.role = 'board'
  h.user = { id: 'user-1' }
  h.uploadError = null
  h.signError = null
  h.uploads = []
  h.dbTouched = 0
})

// ─── Auth and role (RC-3, RC-4) ──────────────────────────────────────

describe('POST /api/violations/photo — gate', () => {
  it('a resident gets 403 forbidden and nothing is uploaded', async () => {
    h.role = 'resident'
    const res = await POST(req(withFile(photo())))
    expect(res.status).toBe(403)
    expect((await json(res)).error?.code).toBe('forbidden')
    expect(h.uploads).toEqual([])
  })

  it('no session gets 401 unauthenticated', async () => {
    h.role = null
    h.user = null
    const res = await POST(req(withFile(photo())))
    expect(res.status).toBe(401)
    expect((await json(res)).error?.code).toBe('unauthenticated')
  })

  it('signed in with no HOA org gets 403 reason no_org', async () => {
    h.role = null
    const res = await POST(req(withFile(photo())))
    expect(res.status).toBe(403)
    expect((await json(res)).error).toMatchObject({ code: 'forbidden', reason: 'no_org' })
  })

  it('a resident with a malformed body still gets 403, not 400 (auth before parse)', async () => {
    h.role = 'resident'
    const res = await POST(req('garbage', { 'content-type': 'multipart/form-data; boundary=nope' }))
    expect(res.status).toBe(403)
  })
})

// ─── Parse and validate (RC-8, RC-10) ────────────────────────────────

describe('POST /api/violations/photo — validation', () => {
  it('a malformed multipart body is 400 validation_failed, not a thrown 500', async () => {
    const res = await POST(req('garbage', { 'content-type': 'multipart/form-data; boundary=nope' }))
    expect(res.status).toBe(400)
    expect((await json(res)).error?.code).toBe('validation_failed')
  })

  it('no file is 400 validation_failed with issues', async () => {
    const res = await POST(req(new FormData()))
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error?.code).toBe('validation_failed')
    expect(body.error?.issues).toEqual([{ path: 'file', message: expect.any(String) }])
  })

  it('a text field instead of a file is 400', async () => {
    const res = await POST(req(withFile('not a file')))
    expect(res.status).toBe(400)
  })

  it('an empty file is 400', async () => {
    const res = await POST(req(withFile(photo('a.png', 'image/png', new Uint8Array()))))
    expect(res.status).toBe(400)
  })

  it('over MAX_UPLOAD_BYTES is 413 payload_too_large with maxBytes', async () => {
    const big = photo('big.png', 'image/png', new Uint8Array(25 * 1024 * 1024 + 1))
    const res = await POST(req(withFile(big)))
    expect(res.status).toBe(413)
    expect((await json(res)).error).toMatchObject({ code: 'payload_too_large', maxBytes: 25 * 1024 * 1024 })
    expect(h.uploads).toEqual([])
  })

  it.each([
    ['notes.pdf', 'application/pdf'],
    ['page.html', 'text/html'],
    ['x.svg', 'image/svg+xml'],
  ])('a disallowed type (%s, %s) is 415 unsupported_media_type', async (name, type) => {
    const res = await POST(req(withFile(photo(name, type))))
    expect(res.status).toBe(415)
    expect((await json(res)).error?.code).toBe('unsupported_media_type')
    expect(h.uploads).toEqual([])
  })

  it('no type and an unknown or missing extension is 415 (not uploaded as octet-stream)', async () => {
    for (const name of ['photo.exe', 'photo']) {
      const res = await POST(req(withFile(photo(name, ''))))
      expect(res.status).toBe(415)
    }
    expect(h.uploads).toEqual([])
  })

  // Object.prototype keys must not pass an allowlist built from an object literal.
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    'a part declared Content-Type: %s is 415',
    async (partType) => {
      const res = await POST(rawMultipart('x.png', partType))
      expect(res.status).toBe(415)
      expect((await json(res)).error?.code).toBe('unsupported_media_type')
      expect(h.uploads).toEqual([])
    },
  )

  it.each(['x.constructor', 'x.__proto__', 'x.toString'])(
    'an untyped file named %s is 415 (extension fallback is not prototype-keyed)',
    async (name) => {
      for (const partType of [null, 'application/octet-stream']) {
        const res = await POST(rawMultipart(name, partType))
        expect(res.status).toBe(415)
      }
      expect(h.uploads).toEqual([])
    },
  )
})

// ─── Work (RC-4 paths, RC-6 writes, RC-2 no raw text) ────────────────

describe('POST /api/violations/photo — upload', () => {
  it('a board member uploads under the org prefix with a server-built name', async () => {
    const res = await POST(req(withFile(photo('../../other-org/evil name.PNG', 'image/png'))))
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.error).toBeUndefined()
    expect(h.uploads).toHaveLength(1)
    const [{ path, contentType }] = h.uploads
    expect(path).toMatch(/^org-1\/\d+-[0-9a-f-]{36}\.png$/)
    expect(contentType).toBe('image/png')
    expect(body).toEqual({ storagePath: path, signedUrl: `https://signed.example/${path}` })
  })

  it('an admin may upload too', async () => {
    h.role = 'admin'
    const res = await POST(req(withFile(photo('a.jpg', 'image/jpeg'))))
    expect(res.status).toBe(200)
  })

  it('an untyped .heic file falls back to its extension', async () => {
    const res = await POST(req(withFile(photo('IMG_1.HEIC', ''))))
    expect(res.status).toBe(200)
    expect(h.uploads[0]).toMatchObject({ contentType: 'image/heic', path: expect.stringMatching(/\.heic$/) })
  })

  it('the stored extension follows the type, not the client file name', async () => {
    const res = await POST(req(withFile(photo('photo.html', 'image/webp'))))
    expect(res.status).toBe(200)
    expect(h.uploads[0]!.path).toMatch(/\.webp$/)
  })

  it('a storage failure is 500 internal with the generic message and no raw text', async () => {
    h.uploadError = { message: 'new row violates row-level security policy for table "objects"', status: 400, statusCode: '403' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req(withFile(photo())))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(text).not.toMatch(/row-level|objects|policy/)
    // The log carries codes, never the storage message.
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/row-level|objects/)
    err.mockRestore()
  })

  it('a missing bucket is 503 not_configured, reason bucket_missing, no raw text', async () => {
    h.uploadError = { message: 'Bucket not found', status: 400, statusCode: '404' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req(withFile(photo())))
    expect(res.status).toBe(503)
    const body = await json(res)
    expect(body.error).toMatchObject({ code: 'not_configured', reason: 'bucket_missing' })
    expect(body.error?.message).not.toMatch(/Bucket not found|hoa-photos|Supabase/)
    err.mockRestore()
  })

  it('a signing failure still answers 200 with signedUrl null (the object is stored)', async () => {
    h.signError = { message: 'boom' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req(withFile(photo())))
    expect(res.status).toBe(200)
    expect((await json(res)).signedUrl).toBeNull()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
