import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

const TOKEN = 'A'.repeat(43) // 32 random bytes as base64url

type Validation =
  | { ok: true; invitation: Record<string, unknown>; alreadyBid: boolean; existingBidStatus: string | null }
  | { ok: false; reason: 'not_found' | 'rfp_closed' | 'revoked' | 'expired' }

const invitation = {
  invitationId: 'inv-1',
  organizationId: 'org-1',
  rfpId: 'rfp-1',
  vendorId: 'vendor-1',
}
let validation: Validation = { ok: true, invitation, alreadyBid: false, existingBidStatus: null }
const validateRfpInvitationToken = vi.fn(async (_token: string) => validation)
vi.mock('@/lib/rfp-invitations', () => ({ validateRfpInvitationToken }))

const RAW = 'duplicate key value violates unique constraint "bids_rfp_id_vendor_id_key"'

let uploadError: { message: string; statusCode?: string; status?: number } | null = null
let removeError: { message: string } | null = null
let bidInsertError: { code?: string; message: string } | null = null
let itemsInsertError: { code?: string; message: string } | null = null
let deleteError: { message: string } | null = null

const uploads: string[] = []
const removes: string[][] = []
const bidInserts: Array<Record<string, unknown>> = []
const itemInserts: Array<Array<Record<string, unknown>>> = []
const deletes: Array<[string, unknown]> = []

function from(table: string) {
  if (table === 'bids') {
    return {
      insert(row: Record<string, unknown>) {
        bidInserts.push(row)
        return {
          select: () => ({
            single: async () =>
              bidInsertError ? { data: null, error: bidInsertError } : { data: { id: 'bid-1' }, error: null },
          }),
        }
      },
      delete() {
        return {
          eq: async (col: string, val: unknown) => {
            deletes.push([col, val])
            return { error: deleteError }
          },
        }
      },
    }
  }
  if (table === 'bid_line_items') {
    return {
      insert: async (rows: Array<Record<string, unknown>>) => {
        itemInserts.push(rows)
        return { error: itemsInsertError }
      },
    }
  }
  throw new Error(`unexpected table ${table}`)
}

const createAdminClient = vi.fn(() => ({
  from,
  storage: {
    from: () => ({
      upload: async (path: string) => {
        uploads.push(path)
        return { error: uploadError }
      },
      remove: async (paths: string[]) => {
        removes.push(paths)
        return { error: removeError }
      },
    }),
  },
}))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient }))

const pdfParse = vi.fn(async (_buf: unknown) => {
  throw new Error('pdf secret text should not be logged')
})
vi.mock('pdf-parse', () => ({ default: pdfParse }))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const { POST } = await import('./route')

// ─── Helpers ─────────────────────────────────────────────────────────

const goodPayload = {
  total_amount: 1250.5,
  payment_terms: 'Net 30',
  warranty: '1 year',
  start_date: '2026-11-01',
  completion_date: '2026-12-15',
  line_items: [{ description: 'Mowing', quantity: 3, unit_price: 0.1, notes: null }],
}

function form(payload: unknown, file?: File): FormData {
  const fd = new FormData()
  if (payload !== undefined) fd.append('payload', typeof payload === 'string' ? payload : JSON.stringify(payload))
  if (file) fd.append('file', file)
  return fd
}

function call(body: FormData | string, token = TOKEN, headers?: HeadersInit) {
  const request = new Request(`http://localhost/api/rfp-bid/${token}/submit`, { method: 'POST', body, headers })
  return POST(request, { params: Promise.resolve({ token }) })
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

function errOf(body: Record<string, unknown>) {
  return body.error as { code: string; message: string; reason?: string; issues?: unknown[] }
}

const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'proposal.pdf', { type: 'application/pdf' })

let consoleSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  validation = { ok: true, invitation, alreadyBid: false, existingBidStatus: null }
  pdfParse.mockClear()
  uploadError = null
  removeError = null
  bidInsertError = null
  itemsInsertError = null
  deleteError = null
  uploads.length = 0
  removes.length = 0
  bidInserts.length = 0
  itemInserts.length = 0
  deletes.length = 0
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function loggedText(): string {
  return JSON.stringify([...consoleSpy.mock.calls, ...(vi.mocked(console.warn).mock.calls ?? [])])
}

// ─── Token (RC-5) ────────────────────────────────────────────────────

describe('POST /api/rfp-bid/[token]/submit — token', () => {
  it('answers an unknown token with 404 not_found, not 410', async () => {
    validation = { ok: false, reason: 'not_found' }
    const res = await call(form(goodPayload))
    expect(res.status).toBe(404)
    expect(errOf(await json(res)).code).toBe('not_found')
  })

  it('answers a token lookup that FAILED (DB error) with the generic 500, not 404 invalid link', async () => {
    validateRfpInvitationToken.mockRejectedValueOnce(Object.assign(new Error(RAW), { code: '57014' }))
    const res = await call(form(goodPayload))
    expect(res.status).toBe(500)
    const body = await json(res)
    expect(errOf(body).code).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('duplicate key')
    expect(loggedText()).not.toContain('duplicate key')
    expect(bidInserts).toHaveLength(0)
  })

  it('answers a malformed token with 404 without touching the database', async () => {
    const res = await call(form(goodPayload), 'not a token!')
    expect(res.status).toBe(404)
    expect(errOf(await json(res)).code).toBe('not_found')
    expect(validateRfpInvitationToken).not.toHaveBeenCalled()
  })

  it.each(['expired', 'rfp_closed', 'revoked'] as const)('answers a %s token with 410 gone + reason', async (reason) => {
    validation = { ok: false, reason }
    const res = await call(form(goodPayload))
    expect(res.status).toBe(410)
    const e = errOf(await json(res))
    expect(e.code).toBe('gone')
    expect(e.reason).toBe(reason)
    expect(typeof e.message).toBe('string')
  })

  it('answers an already-submitted bid with 409 conflict reason already_submitted, before any upload', async () => {
    validation = { ok: true, invitation, alreadyBid: true, existingBidStatus: 'submitted' }
    const res = await call(form(goodPayload, pdf()))
    expect(res.status).toBe(409)
    const e = errOf(await json(res))
    expect(e.code).toBe('conflict')
    expect(e.reason).toBe('already_submitted')
    expect(uploads).toHaveLength(0)
  })

  // R-07: a bid in any other status used to fall through, upload the file
  // and parse the PDF, and only then hit UNIQUE (rfp_id, vendor_id).
  it.each(['awarded', 'declined', 'withdrawn', 'draft'])(
    'refuses a vendor whose existing bid is %s with 409 bid_exists before any upload or parse',
    async (status) => {
      validation = { ok: true, invitation, alreadyBid: false, existingBidStatus: status }
      const res = await call(form(goodPayload, pdf()))
      expect(res.status).toBe(409)
      const e = errOf(await json(res))
      expect(e.code).toBe('conflict')
      expect(e.reason).toBe('bid_exists')
      expect(typeof e.message).toBe('string')
      expect(uploads).toHaveLength(0)
      expect(pdfParse).not.toHaveBeenCalled()
      expect(bidInserts).toHaveLength(0)
    },
  )
})

// ─── Parse + validate (RC-8, RC-10) ──────────────────────────────────

describe('POST /api/rfp-bid/[token]/submit — validation', () => {
  it('answers a malformed multipart body with 400 validation_failed, not a thrown 500', async () => {
    const res = await call('garbage', TOKEN, { 'content-type': 'multipart/form-data; boundary=x' })
    expect(res.status).toBe(400)
    expect(errOf(await json(res)).code).toBe('validation_failed')
  })

  it('answers a missing payload with 400 validation_failed naming the field', async () => {
    const res = await call(form(undefined))
    expect(res.status).toBe(400)
    const e = errOf(await json(res))
    expect(e.code).toBe('validation_failed')
    expect(e.issues).toEqual([expect.objectContaining({ path: 'payload' })])
  })

  it('answers a payload that is not JSON with 400 invalid_json', async () => {
    const res = await call(form('{nope'))
    expect(res.status).toBe(400)
    expect(errOf(await json(res)).code).toBe('invalid_json')
  })

  it('answers a schema miss with issues, never raw Zod JSON', async () => {
    const res = await call(form({ ...goodPayload, total_amount: -1 }))
    expect(res.status).toBe(400)
    const body = await json(res)
    const e = errOf(body)
    expect(e.code).toBe('validation_failed')
    expect(e.issues).toEqual([expect.objectContaining({ path: 'total_amount' })])
    expect(JSON.stringify(body)).not.toContain('too_small')
    expect(bidInserts).toHaveLength(0)
  })

  it.each([
    ['an impossible date', { start_date: '2026-02-30' }, 'start_date'],
    ['a free-text date', { completion_date: 'next spring' }, 'completion_date'],
    ['an unbounded string', { payment_terms: 'x'.repeat(10_000) }, 'payment_terms'],
    ['fractional cents', { total_amount: 10.005 }, 'total_amount'],
    ['an absurd amount', { total_amount: 1e15 }, 'total_amount'],
    [
      'too many line items',
      { line_items: Array.from({ length: 101 }, () => ({ description: 'x' })) },
      'line_items',
    ],
    ['an unbounded line description', { line_items: [{ description: 'x'.repeat(10_000) }] }, 'line_items.0.description'],
  ])('refuses %s with 400 before any write', async (_label, patch, path) => {
    const res = await call(form({ ...goodPayload, ...patch }))
    expect(res.status).toBe(400)
    const e = errOf(await json(res))
    expect(e.code).toBe('validation_failed')
    expect(e.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path })]))
    expect(bidInserts).toHaveLength(0)
    expect(uploads).toHaveLength(0)
  })

  it('accepts every two-decimal amount up to the $1B cap (no float false rejects)', async () => {
    // 276651707.6 * 100 === 27665170760.000004: an absolute-epsilon check refused it.
    const amounts = [276651707.6, 999_999_999.99, 1_000_000_000, 123_456_789.07, 0.01, 0.1, 0.29]
    // Deterministic LCG sample of k/100 for k in [1, 1e11].
    let seed = 42
    for (let i = 0; i < 400; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      const k = 1 + Math.floor((seed / 2147483648) * 1e11)
      amounts.push(k / 100)
    }
    const refused: number[] = []
    for (const total_amount of amounts) {
      const res = await call(form({ ...goodPayload, total_amount, line_items: [] }))
      if (res.status !== 201) refused.push(total_amount)
    }
    expect(refused).toEqual([])
    // Stored to the cent exactly.
    expect(bidInserts[0]?.total_amount).toBe(276651707.6)
  })

  it.each([
    ['three decimals on a unit price', { line_items: [{ description: 'x', quantity: 1, unit_price: 12.345 }] }, 'line_items.0.unit_price'],
    ['three decimals on a large total', { total_amount: 276651707.605 }, 'total_amount'],
  ])('refuses %s with 400 naming the field', async (_label, patch, path) => {
    const res = await call(form({ ...goodPayload, ...patch }))
    expect(res.status).toBe(400)
    const e = errOf(await json(res))
    expect(e.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path })]))
  })

  it('caps the payload field on BYTES, not UTF-16 code units (413)', async () => {
    // 400k three-byte characters = 1.2 MB, but only 400k code units.
    const res = await call(form({ ...goodPayload, payment_terms: '€'.repeat(400_000) }))
    expect(res.status).toBe(413)
    expect(errOf(await json(res))).toMatchObject({ code: 'payload_too_large', maxBytes: 1024 * 1024 })
    expect(bidInserts).toHaveLength(0)
  })

  it('answers an over-limit file with 413 payload_too_large', async () => {
    const big = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' })
    const res = await call(form(goodPayload, big))
    expect(res.status).toBe(413)
    expect(errOf(await json(res)).code).toBe('payload_too_large')
    expect(uploads).toHaveLength(0)
  })

  it.each([
    ['a disallowed type', 'text/html'],
    ['a missing type', ''],
  ])('answers %s with 415 unsupported_media_type', async (_label, type) => {
    const res = await call(form(goodPayload, new File(['<p>'], 'x.html', { type })))
    expect(res.status).toBe(415)
    expect(errOf(await json(res)).code).toBe('unsupported_media_type')
    expect(uploads).toHaveLength(0)
  })
})

// ─── Writes (RC-2, RC-5, RC-6) ───────────────────────────────────────

describe('POST /api/rfp-bid/[token]/submit — writes', () => {
  it('stores the bid and answers 201 { bidId } with no ok flag', async () => {
    const res = await call(form(goodPayload, pdf()))
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({ bidId: 'bid-1' })
    expect(bidInserts[0]).toMatchObject({
      organization_id: 'org-1',
      rfp_id: 'rfp-1',
      vendor_id: 'vendor-1',
      total_amount: 1250.5,
      start_date: '2026-11-01',
      completion_date: '2026-12-15',
      status: 'submitted',
    })
    // The storage path is server-built under the org, with an extension from the MIME type.
    expect(uploads[0]).toMatch(/^org-1\/rfps\/rfp-1\/bids\/vendor-1\/\d+-[a-z0-9]+\.pdf$/)
    // Line total computed in integer cents: 3 × $0.10 is exactly $0.30.
    expect(itemInserts[0]?.[0]).toMatchObject({ bid_id: 'bid-1', quantity: 3, unit_price: 0.1, line_total: 0.3 })
  })

  it('does not log pdf-parse error text', async () => {
    await call(form(goodPayload, pdf()))
    expect(loggedText()).not.toContain('pdf secret text')
  })

  it('maps a concurrent duplicate (23505) to 409 conflict and removes the upload', async () => {
    bidInsertError = { code: '23505', message: RAW }
    const res = await call(form(goodPayload, pdf()))
    expect(res.status).toBe(409)
    const body = await json(res)
    expect(errOf(body).code).toBe('conflict')
    expect(errOf(body).reason).toBe('bid_exists')
    expect(JSON.stringify(body)).not.toContain('bids_rfp_id_vendor_id_key')
    expect(removes).toEqual([[uploads[0]]])
  })

  it('answers any other insert failure with the generic 500 and no raw text in body or logs', async () => {
    bidInsertError = { code: '22003', message: 'numeric field overflow in relation bids' }
    const res = await call(form(goodPayload, pdf()))
    expect(res.status).toBe(500)
    const body = await json(res)
    expect(errOf(body).code).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('relation bids')
    expect(loggedText()).not.toContain('relation bids')
    expect(removes).toEqual([[uploads[0]]])
  })

  it('answers an upload failure with the generic 500 and no storage text', async () => {
    uploadError = { message: 'Bucket hoa-documents policy denied', statusCode: '403' }
    const res = await call(form(goodPayload, pdf()))
    expect(res.status).toBe(500)
    const body = await json(res)
    expect(errOf(body).code).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('hoa-documents')
    expect(loggedText()).not.toContain('hoa-documents')
    expect(bidInserts).toHaveLength(0)
  })

  it.each([
    ['statusCode 404', { message: 'Bucket not found', statusCode: '404', status: 400 }],
    ['status 404', { message: 'Bucket not found', status: 404 }],
  ])('answers a missing storage bucket (%s) with 503 not_configured, no storage text', async (_l, err) => {
    uploadError = err
    const res = await call(form(goodPayload, pdf()))
    expect(res.status).toBe(503)
    const body = await json(res)
    expect(errOf(body).code).toBe('not_configured')
    expect(JSON.stringify(body)).not.toContain('Bucket not found')
    expect(loggedText()).not.toContain('Bucket not found')
    expect(bidInserts).toHaveLength(0)
  })

  it('rolls back the bid and the upload when line items fail, then answers the generic 500', async () => {
    itemsInsertError = { code: '23502', message: 'null value in column description of bid_line_items' }
    const res = await call(form(goodPayload, pdf()))
    expect(res.status).toBe(500)
    const body = await json(res)
    expect(errOf(body).code).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('bid_line_items')
    expect(loggedText()).not.toContain('bid_line_items')
    expect(deletes).toEqual([['id', 'bid-1']])
    expect(removes).toEqual([[uploads[0]]])
  })

  it('still answers the generic 500 (not success) when compensation itself fails, logging codes only', async () => {
    itemsInsertError = { code: '23502', message: 'boom in bid_line_items' }
    deleteError = { message: 'delete failed on bids for vendor@example.com' }
    removeError = { message: 'remove failed hoa-documents' }
    const res = await call(form(goodPayload, pdf()))
    expect(res.status).toBe(500)
    expect(loggedText()).not.toContain('vendor@example.com')
    expect(loggedText()).not.toContain('remove failed')
  })
})
