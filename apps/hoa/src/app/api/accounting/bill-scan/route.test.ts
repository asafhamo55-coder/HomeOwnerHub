import { beforeEach, describe, expect, it, vi } from 'vitest'

// No model and no database: scanBill and proposeApproval are mocked, and
// the Supabase client is a canned stand-in. Proves the route's rules
// (RC-1..RC-12) and that it only ever PROPOSES.

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  user: { id: 'user-1' } as { id: string } | null,
  assoc: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }] as Array<{ id: string }>,
  existing: [] as Array<{ id: string }>,
  uploadError: null as null | { message: string; statusCode?: string },
  uploads: [] as string[],
  removed: [] as string[],
  tablesRead: [] as string[],
  pdfText: 'INVOICE SL-2210 Sample Landscaping Co total 1200.00',
  scanBill: vi.fn(),
  proposeApproval: vi.fn(),
  quota: vi.fn(),
  linkRun: vi.fn(),
}))

// BL-059: the scan draws on the shared board_ai limit (scan-core.ts).
vi.mock('@/lib/api/rate-limit', () => ({ checkAndRecordAiUsage: h.quota, linkAiUsageToRun: h.linkRun }))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/pdf/extract-text', () => ({
  extractPdfText: vi.fn(async () => ({ text: h.pdfText, numPages: 1, truncated: false, parserVersion: 'pdfjs-dist-test' })),
}))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn(() => ({ tag: 'admin' })) }))
vi.mock('@homeowner-portal/workflows', () => ({
  W36_AP_BILL: 'w36.ap_bill',
  MAX_BILL_TEXT_CHARS: 20_000,
  scanBill: h.scanBill,
  proposeApproval: h.proposeApproval,
}))

const TABLE_DATA: Record<string, () => unknown[]> = {
  associations: () => h.assoc,
  approval_requests: () => h.existing,
  chart_of_accounts: () => [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', account_number: '5100', account_name: 'Landscaping' }],
  vendors: () => [{ id: '11111111-1111-4111-8111-111111111111', legal_name: 'Sample Landscaping Co', dba: null }],
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from(table: string) {
      h.tablesRead.push(table)
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'in', 'is', 'neq', 'order', 'limit']) b[op] = () => b
      let paged = false
      b.range = (from: number) => {
        paged = from > 0
        return b
      }
      b.then = (resolve: (r: unknown) => unknown) => resolve({ data: paged ? [] : TABLE_DATA[table]!(), error: null })
      return b
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          h.uploads.push(path)
          return { data: h.uploadError ? null : { path }, error: h.uploadError }
        },
        remove: async (paths: string[]) => {
          h.removed.push(...paths)
          return { data: null, error: null }
        },
      }),
    },
  })),
}))

import { POST } from './route'

const SCAN = {
  runId: 'run-1',
  vendorName: { value: 'Sample Landscaping Co', confidence: 'high' },
  invoiceNumber: { value: 'SL-2210', confidence: 'high' },
  invoiceDate: { value: '2026-10-01', confidence: 'high' },
  dueDate: { value: null, confidence: 'low' },
  total: { value: 1200, confidence: 'medium' },
  lineItems: [],
  expenseAccount: { accountNumber: '5100', reasoning: 'Grounds work.', confidence: 'high' },
  warnings: [],
}

function bill(name = 'bill.pdf', type = 'application/pdf', bytes: BlobPart = new Uint8Array([37, 80, 68, 70, 1, 2])): FormData {
  const fd = new FormData()
  fd.append('file', new File([bytes], name, { type }))
  return fd
}
const req = (body: FormData | string, headers: Record<string, string> = {}) =>
  new Request('http://x/api/accounting/bill-scan', { method: 'POST', body, headers })
async function json(res: Response) {
  return (await res.json()) as Record<string, unknown> & { error?: { code: string; message: string; [k: string]: unknown } }
}

beforeEach(() => {
  h.role = 'board'
  h.user = { id: 'user-1' }
  h.assoc = [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }]
  h.existing = []
  h.uploadError = null
  h.uploads = []
  h.removed = []
  h.tablesRead = []
  h.pdfText = 'INVOICE SL-2210 Sample Landscaping Co total 1200.00'
  h.scanBill.mockReset().mockResolvedValue(SCAN)
  h.proposeApproval.mockReset().mockResolvedValue({ id: 'req-1', status: 'proposed', created: true })
  h.quota.mockReset().mockResolvedValue({ usageId: 'usage-1' })
  h.linkRun.mockReset().mockResolvedValue(undefined)
})

describe('POST /api/accounting/bill-scan — AI limit (BL-059)', () => {
  it('draws on the shared board_ai bucket once, and links the usage to the run', async () => {
    expect((await POST(req(bill()))).status).toBe(201)
    expect(h.quota).toHaveBeenCalledTimes(1)
    expect(h.quota).toHaveBeenCalledWith('board_ai', { orgId: 'org-1', userId: 'user-1' })
    expect(h.linkRun).toHaveBeenCalledWith('usage-1', 'run-1')
  })

  it('over the limit is 429 rate_limited, and nothing is uploaded or scanned', async () => {
    const { ApiRouteError } = await import('@/lib/api/errors')
    h.quota.mockRejectedValueOnce(new ApiRouteError('rate_limited', 'limit', { reason: 'org_limit', retryAfterSeconds: 60 }, { 'Retry-After': '60' }))
    const res = await POST(req(bill()))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(h.uploads).toEqual([])
    expect(h.scanBill).not.toHaveBeenCalled()
  })

  it('a duplicate file spends no quota', async () => {
    h.existing = [{ id: 'req-old' }]
    await POST(req(bill()))
    expect(h.quota).not.toHaveBeenCalled()
  })
})

describe('POST /api/accounting/bill-scan — gate', () => {
  it('a resident gets 403 and nothing is read, scanned or proposed', async () => {
    h.role = 'resident'
    const res = await POST(req(bill()))
    expect(res.status).toBe(403)
    expect((await json(res)).error?.code).toBe('forbidden')
    expect(h.tablesRead).toEqual([])
    expect(h.scanBill).not.toHaveBeenCalled()
    expect(h.proposeApproval).not.toHaveBeenCalled()
  })

  it('no session gets 401', async () => {
    h.role = null
    h.user = null
    expect((await POST(req(bill()))).status).toBe(401)
  })

  it('a resident with a malformed body still gets 403 (auth before parse)', async () => {
    h.role = 'resident'
    expect((await POST(req('garbage', { 'content-type': 'multipart/form-data; boundary=nope' }))).status).toBe(403)
  })
})

describe('POST /api/accounting/bill-scan — validation', () => {
  it('a malformed body is 400 validation_failed', async () => {
    const res = await POST(req('garbage', { 'content-type': 'multipart/form-data; boundary=nope' }))
    expect(res.status).toBe(400)
    expect((await json(res)).error?.code).toBe('validation_failed')
  })

  it('no file is 400 with issues', async () => {
    const res = await POST(req(new FormData()))
    expect(res.status).toBe(400)
    expect((await json(res)).error?.issues).toEqual([{ path: 'file', message: expect.any(String) }])
  })

  it('over MAX_UPLOAD_BYTES is 413', async () => {
    const res = await POST(req(bill('big.pdf', 'application/pdf', new Uint8Array(25 * 1024 * 1024 + 1))))
    expect(res.status).toBe(413)
    expect((await json(res)).error).toMatchObject({ code: 'payload_too_large', maxBytes: 25 * 1024 * 1024 })
  })

  it('an image over the vision limit is 413 before any model call', async () => {
    const res = await POST(req(bill('big.png', 'image/png', new Uint8Array(3 * 1024 * 1024 + 1))))
    expect(res.status).toBe(413)
    expect(h.scanBill).not.toHaveBeenCalled()
  })

  it.each([
    ['x.heic', 'image/heic'],
    ['x.html', 'text/html'],
    ['x.svg', 'image/svg+xml'],
    ['x.exe', ''],
  ])('a disallowed type (%s) is 415', async (name, type) => {
    const res = await POST(req(bill(name, type)))
    expect(res.status).toBe(415)
    expect(h.uploads).toEqual([])
  })

  it('an org with no association is 422 no_association', async () => {
    h.assoc = []
    const res = await POST(req(bill()))
    expect(res.status).toBe(422)
    expect((await json(res)).error).toMatchObject({ code: 'unprocessable', reason: 'no_association' })
  })

  it('a PDF with no text layer is 422 no_text_layer and nothing is uploaded or scanned', async () => {
    h.pdfText = '   '
    const res = await POST(req(bill()))
    expect(res.status).toBe(422)
    expect((await json(res)).error).toMatchObject({ code: 'unprocessable', reason: 'no_text_layer' })
    expect(h.uploads).toEqual([])
    expect(h.scanBill).not.toHaveBeenCalled()
  })
})

describe('POST /api/accounting/bill-scan — proposes, never enters', () => {
  it('scans a PDF through the text path and files a w36.ap_bill proposal', async () => {
    const res = await POST(req(bill()))
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({
      approvalRequestId: 'req-1',
      duplicate: false,
      summary: 'Bill from Sample Landscaping Co · #SL-2210',
      amountCents: 120000,
      missing: [],
      needsCheck: ['total'],
      warnings: [],
    })
    const [input, ctx] = h.scanBill.mock.calls[0]!
    expect(input).toMatchObject({ source: 'pdf_text', documentText: expect.stringContaining('SL-2210'), contentType: 'application/pdf' })
    expect(input.expenseAccounts).toEqual([{ accountNumber: '5100', accountName: 'Landscaping' }])
    expect(ctx).toEqual({ organizationId: 'org-1', imageDataUrl: null })
    const [, proposal] = h.proposeApproval.mock.calls[0]!
    expect(proposal).toMatchObject({
      organizationId: 'org-1',
      workflowId: 'W36',
      actionType: 'w36.ap_bill',
      subjectType: 'bill_document',
      amount: 1200,
    })
    expect(proposal.payload.storagePath).toMatch(/^org-1\/bills\/\d+-[0-9a-f-]+\.pdf$/)
    expect(h.uploads).toHaveLength(1)
    // Nothing writes accounting here.
    expect(h.tablesRead).not.toContain('invoices')
    expect(h.tablesRead).not.toContain('journal_entries')
  })

  it('sends an image to the vision path inline, never as a URL', async () => {
    const res = await POST(req(bill('bill.png', 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))))
    expect(res.status).toBe(201)
    const [input, ctx] = h.scanBill.mock.calls[0]!
    expect(input).toMatchObject({ source: 'image', documentText: null })
    expect(ctx.imageDataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('the same file with a live proposal returns it without calling the model', async () => {
    h.existing = [{ id: 'req-old' }]
    const res = await POST(req(bill()))
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ approvalRequestId: 'req-old', duplicate: true })
    expect(h.scanBill).not.toHaveBeenCalled()
    expect(h.uploads).toEqual([])
  })

  it('a model failure is 503 upstream_unavailable, with no raw text, and the upload is removed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.scanBill.mockRejectedValueOnce(new Error('groq said: Remit to 12 Secret Lane'))
    const res = await POST(req(bill()))
    expect(res.status).toBe(503)
    const body = await json(res)
    expect(body.error?.code).toBe('upstream_unavailable')
    expect(JSON.stringify(body)).not.toContain('Secret Lane')
    expect(JSON.stringify(log.mock.calls)).not.toContain('Secret Lane')
    expect(h.removed).toEqual(h.uploads)
    expect(h.proposeApproval).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('a failed proposal insert is a generic 500 and the upload is removed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.proposeApproval.mockRejectedValueOnce(new Error('approval_request_insert_failed: duplicate key (summary)=(x)'))
    const res = await POST(req(bill()))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await json(res))).not.toContain('duplicate key')
    expect(h.removed).toEqual(h.uploads)
  })

  it('a missing bucket is 503 not_configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.uploadError = { message: 'Bucket not found', statusCode: '404' }
    const res = await POST(req(bill()))
    expect(res.status).toBe(503)
    expect((await json(res)).error).toMatchObject({ code: 'not_configured', reason: 'bucket_missing' })
    expect(h.scanBill).not.toHaveBeenCalled()
  })

  it('a concurrent upload that lost the slot returns the winner and removes its own file', async () => {
    h.proposeApproval.mockResolvedValueOnce({ id: 'req-winner', status: 'proposed', created: false })
    const res = await POST(req(bill()))
    expect(await json(res)).toEqual({ approvalRequestId: 'req-winner', duplicate: true })
    expect(h.removed).toEqual(h.uploads)
  })
})
