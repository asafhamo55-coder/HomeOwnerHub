import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_JSON_BYTES, MAX_UPLOAD_BYTES } from '@/lib/api/limits'

// ─── Mocks ───────────────────────────────────────────────────────────

type Validation =
  | { ok: true; invitation: { id: string; organizationId: string; inviteeEmail: string; inviteeName: string | null; expiresAt: string } }
  | { ok: false; reason: 'not_found' | 'expired' | 'consumed' | 'revoked' }

const TOKEN = 'A'.repeat(43)
const RAW = 'duplicate key value violates unique constraint "vendors_secret_idx" Key (ein)=(123456789)'

let validation: Validation
const validateInvitationToken = vi.fn(async (_t: string) => validation)
vi.mock('@/lib/vendor-invitations', () => ({ validateInvitationToken }))

const sendEmail = vi.fn(async () => ({ ok: true as const, messageId: null }))
vi.mock('@/lib/email', () => ({ sendEmail, appUrl: (p: string) => `https://app.test${p}` }))

type Res = { data: unknown; error: { code?: string; message: string } | null }
/** Programmable responses keyed `${table}.${op}`; default is success with no data. */
let responses: Record<string, (call: Call) => Res> = {}
interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  values?: unknown
  filters: Array<[string, string, unknown]>
}
const calls: Call[] = []
const uploads: string[] = []
const removed: string[][] = []
let uploadError: { message: string } | null = null

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] }
  calls.push(call)
  const resolve = (): Res => (responses[`${table}.${call.op}`] ?? (() => ({ data: null, error: null })))(call)
  const b = {
    select() {
      return b
    },
    insert(values: unknown) {
      call.op = 'insert'
      call.values = values
      return b
    },
    update(values: unknown) {
      call.op = 'update'
      call.values = values
      return b
    },
    delete() {
      call.op = 'delete'
      return b
    },
    eq(col: string, val: unknown) {
      call.filters.push(['eq', col, val])
      return b
    },
    gt(col: string, val: unknown) {
      call.filters.push(['gt', col, val])
      return b
    },
    async single() {
      return resolve()
    },
    limit(n: number) {
      call.filters.push(['limit', 'limit', n])
      return b
    },
    async maybeSingle() {
      // Like postgrest-js: more than one row is PGRST116 with data null.
      const r = resolve()
      if (Array.isArray(r.data) && r.data.length > 1) {
        return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
      }
      return Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r
    },
    then(ok: (r: Res) => unknown, fail?: (e: unknown) => unknown) {
      return Promise.resolve(resolve()).then(ok, fail)
    },
  }
  return b
}

const db = {
  from: (table: string) => builder(table),
  storage: {
    from: () => ({
      async upload(path: string) {
        if (uploadError) return { data: null, error: uploadError }
        uploads.push(path)
        return { data: { path }, error: null }
      },
      async remove(paths: string[]) {
        removed.push(paths)
        return { data: [], error: null }
      },
    }),
  },
}
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => db }))

const { POST } = await import('./route')

// ─── Helpers ─────────────────────────────────────────────────────────

const GOOD = {
  legal_name: 'Acme Landscaping LLC',
  ein: '12-3456789',
  primary_email: 'ops@example.test',
  trades: ['landscaping'],
  service_area_zips: ['30022-1234'],
}

const NO_PAYLOAD = Symbol('no payload')

function form(payload: unknown = GOOD, files: Record<string, File> = {}): FormData {
  const f = new FormData()
  if (payload !== NO_PAYLOAD) f.append('payload', typeof payload === 'string' ? payload : JSON.stringify(payload))
  for (const [k, v] of Object.entries(files)) f.append(k, v)
  return f
}

function call(body: FormData | string = form(), token = TOKEN) {
  const req = new Request(`http://x/api/vendor-onboard/${token}/submit`, { method: 'POST', body })
  return POST(req, { params: Promise.resolve({ token }) })
}

const pdf = (name = 'coi.pdf', size = 10, type = 'application/pdf') => new File([new Uint8Array(size)], name, { type })

async function json(res: Response) {
  return (await res.json()) as { error?: { code: string; message: string; reason?: string; field?: string; issues?: Array<{ path: string; message: string }> } } & Record<string, unknown>
}

const claimCalls = () =>
  calls.filter((c) => c.table === 'vendor_onboarding_invitations' && c.op === 'update' && (c.values as { status?: string }).status === 'submitted')
const releaseCalls = () =>
  calls.filter((c) => c.table === 'vendor_onboarding_invitations' && c.op === 'update' && (c.values as { status?: string }).status === 'pending')
const vendorInserts = () => calls.filter((c) => c.table === 'vendors' && c.op === 'insert')

let errSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  validation = {
    ok: true,
    invitation: { id: 'inv-1', organizationId: 'org-1', inviteeEmail: 'v@example.test', inviteeName: null, expiresAt: '2999-01-01T00:00:00Z' },
  }
  responses = {
    'vendor_onboarding_invitations.update': (c) =>
      (c.values as { status?: string }).status === 'submitted' ? { data: [{ id: 'inv-1' }], error: null } : { data: null, error: null },
    'vendors.insert': () => ({ data: { id: 'vendor-1' }, error: null }),
  }
  calls.length = 0
  uploads.length = 0
  removed.length = 0
  uploadError = null
  validateInvitationToken.mockClear()
  sendEmail.mockClear()
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  // RC-2: nothing raw ever reaches a log line.
  const logged = JSON.stringify([...errSpy.mock.calls, ...warnSpy.mock.calls])
  expect(logged).not.toContain('vendors_secret_idx')
  expect(logged).not.toContain('bucket internals')
  errSpy.mockRestore()
  warnSpy.mockRestore()
})

function expectEnvelope(body: Awaited<ReturnType<typeof json>>, code: string) {
  expect(body.error?.code).toBe(code)
  expect(typeof body.error?.message).toBe('string')
  expect(JSON.stringify(body)).not.toContain('vendors_secret_idx')
  expect(JSON.stringify(body)).not.toContain('bucket internals')
}

// ─── Token (RC-5) ────────────────────────────────────────────────────

describe('token', () => {
  it('a malformed token is 404 without a lookup', async () => {
    const res = await call(form(), 'bad token!')
    expect(res.status).toBe(404)
    expectEnvelope(await json(res), 'not_found')
    expect(validateInvitationToken).not.toHaveBeenCalled()
  })

  it('an unknown token is 404, not 410', async () => {
    validation = { ok: false, reason: 'not_found' }
    const res = await call()
    expect(res.status).toBe(404)
    expectEnvelope(await json(res), 'not_found')
  })

  it.each(['expired', 'revoked'] as const)('a %s token is 410 gone with a reason', async (reason) => {
    validation = { ok: false, reason }
    const res = await call()
    expect(res.status).toBe(410)
    const body = await json(res)
    expectEnvelope(body, 'gone')
    expect(body.error?.reason).toBe(reason)
  })

  it('a token lookup that FAILED (DB error) is the generic 500, not 404 invalid link', async () => {
    validateInvitationToken.mockRejectedValueOnce(
      Object.assign(new Error('relation vendors_secret_idx timed out'), { code: '57014' }),
    )
    const res = await call()
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
    expect(vendorInserts()).toHaveLength(0)
  })

  it('an already-submitted token is 409 already_submitted', async () => {
    validation = { ok: false, reason: 'consumed' }
    const res = await call()
    expect(res.status).toBe(409)
    const body = await json(res)
    expectEnvelope(body, 'conflict')
    expect(body.error?.reason).toBe('already_submitted')
  })
})

// ─── Parse + validate (RC-8, RC-10) ──────────────────────────────────

describe('parsing', () => {
  it('a body that is not multipart is 400 validation_failed, not a thrown 500', async () => {
    const req = new Request(`http://x/api/vendor-onboard/${TOKEN}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=nope' },
      body: 'garbage',
    })
    const res = await POST(req, { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(400)
    expectEnvelope(await json(res), 'validation_failed')
  })

  it('a missing payload is 400 validation_failed with a payload issue', async () => {
    const res = await call(form(NO_PAYLOAD))
    expect(res.status).toBe(400)
    const body = await json(res)
    expectEnvelope(body, 'validation_failed')
    expect(body.error?.issues?.[0]?.path).toBe('payload')
  })

  it('a payload that is not JSON is 400 invalid_json', async () => {
    const res = await call(form('{not json'))
    expect(res.status).toBe(400)
    expectEnvelope(await json(res), 'invalid_json')
  })

  it('a schema miss is 400 validation_failed with field issues, never raw Zod JSON', async () => {
    const res = await call(form({ ...GOOD, legal_name: 'A', ein: '12' }))
    expect(res.status).toBe(400)
    const body = await json(res)
    expectEnvelope(body, 'validation_failed')
    const paths = body.error?.issues?.map((i) => i.path)
    expect(paths).toContain('legal_name')
    expect(paths).toContain('ein')
    expect(body.error?.message).not.toContain('[')
    expect(vendorInserts()).toHaveLength(0)
  })

  it('strings and arrays are bounded', async () => {
    for (const bad of [
      { ...GOOD, legal_name: 'x'.repeat(10_000) },
      { ...GOOD, address: { line1: 'x'.repeat(10_000) } },
      { ...GOOD, trades: Array.from({ length: 1000 }, (_, i) => `t${i}`) },
      { ...GOOD, service_area_zips: Array.from({ length: 1000 }, () => '30022') },
    ]) {
      const res = await call(form(bad))
      expect(res.status).toBe(400)
      expectEnvelope(await json(res), 'validation_failed')
    }
    expect(vendorInserts()).toHaveLength(0)
  })

  it('caps the payload field on UTF-8 bytes, not UTF-16 code units (413)', async () => {
    // 3-byte characters: under the cap in code units, over it in bytes.
    const big = JSON.stringify({ ...GOOD, dba: '\u20ac'.repeat(Math.ceil(MAX_JSON_BYTES / 3) + 10) })
    expect(big.length).toBeLessThan(MAX_JSON_BYTES)
    const res = await call(form(big))
    expect(res.status).toBe(413)
    expectEnvelope(await json(res), 'payload_too_large')
  })

  it('an oversized file is 413 payload_too_large', async () => {
    const res = await call(form(GOOD, { file_coi: pdf('big.pdf', MAX_UPLOAD_BYTES + 1) }))
    expect(res.status).toBe(413)
    const body = await json(res)
    expectEnvelope(body, 'payload_too_large')
    expect(body.error?.field).toBe('file_coi')
    expect(claimCalls()).toHaveLength(0)
  })

  it('a disallowed file type is 415', async () => {
    const res = await call(form(GOOD, { file_w9: pdf('w9.exe', 10, 'application/x-msdownload') }))
    expect(res.status).toBe(415)
    const body = await json(res)
    expectEnvelope(body, 'unsupported_media_type')
    expect(body.error?.field).toBe('file_w9')
  })

  it('a file with no type and an unknown extension is 415', async () => {
    const res = await call(form(GOOD, { file_w9: pdf('w9.bin', 10, '') }))
    expect(res.status).toBe(415)
  })
})

// ─── Claim + writes (RC-5, RC-6, RC-2) ───────────────────────────────

describe('claim and writes', () => {
  it('claims the invitation atomically before creating the vendor', async () => {
    const res = await call()
    expect(res.status).toBe(201)
    const claim = claimCalls()[0]!
    expect(claim.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', 'inv-1'],
        ['eq', 'status', 'pending'],
      ]),
    )
    expect(claim.filters.some(([op, col]) => op === 'gt' && col === 'expires_at')).toBe(true)
    expect(calls.indexOf(claim)).toBeLessThan(calls.indexOf(vendorInserts()[0]!))
  })

  const emptyClaim = (row: { status: string; expires_at: string } | null, error: Res['error'] = null) => {
    responses['vendor_onboarding_invitations.update'] = () => ({ data: [], error: null })
    responses['vendor_onboarding_invitations.select'] = () => ({ data: row, error })
  }
  const FUTURE = '2999-01-01T00:00:00Z'
  const PAST = '2000-01-01T00:00:00Z'

  it('a lost claim race is 409 already_submitted and creates nothing', async () => {
    emptyClaim({ status: 'submitted', expires_at: FUTURE })
    const res = await call()
    expect(res.status).toBe(409)
    const body = await json(res)
    expectEnvelope(body, 'conflict')
    expect(body.error?.reason).toBe('already_submitted')
    expect(vendorInserts()).toHaveLength(0)
  })

  it.each([
    ['revoked during the upload', { status: 'revoked', expires_at: FUTURE }, 'revoked'],
    ['expired during the upload (still pending)', { status: 'pending', expires_at: PAST }, 'expired'],
    ['marked expired during the upload', { status: 'expired', expires_at: PAST }, 'expired'],
  ] as const)('an invitation %s is 410 gone, not "already submitted"', async (_label, row, reason) => {
    emptyClaim({ ...row })
    const res = await call()
    expect(res.status).toBe(410)
    const body = await json(res)
    expectEnvelope(body, 'gone')
    expect(body.error?.reason).toBe(reason)
    expect(body.error?.message).not.toContain('already been submitted')
    expect(vendorInserts()).toHaveLength(0)
    expect(releaseCalls()).toHaveLength(0)
  })

  it('a claim taken and released by another submit is 409 in_progress (retryable)', async () => {
    emptyClaim({ status: 'pending', expires_at: FUTURE })
    const res = await call()
    expect(res.status).toBe(409)
    const body = await json(res)
    expectEnvelope(body, 'conflict')
    expect(body.error?.reason).toBe('in_progress')
    expect(vendorInserts()).toHaveLength(0)
  })

  it('an invitation deleted during the upload is 404', async () => {
    emptyClaim(null)
    const res = await call()
    expect(res.status).toBe(404)
    expectEnvelope(await json(res), 'not_found')
  })

  it('a failed re-read after an empty claim is a generic 500', async () => {
    emptyClaim(null, { code: 'XX000', message: RAW })
    const res = await call()
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
    expect(vendorInserts()).toHaveLength(0)
  })

  it('a failed claim write is a generic 500', async () => {
    responses['vendor_onboarding_invitations.update'] = () => ({ data: null, error: { code: 'XX000', message: RAW } })
    const res = await call()
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
    expect(vendorInserts()).toHaveLength(0)
  })

  it('an existing EIN is 409 duplicate_ein and releases the claim', async () => {
    responses['vendors.select'] = () => ({ data: [{ id: 'vendor-0' }], error: null })
    const res = await call()
    expect(res.status).toBe(409)
    const body = await json(res)
    expectEnvelope(body, 'conflict')
    expect(body.error?.reason).toBe('duplicate_ein')
    expect(vendorInserts()).toHaveLength(0)
    expect(releaseCalls()).toHaveLength(1)
  })

  it('an EIN already held by two vendors in the org is still 409 duplicate_ein, not a 500', async () => {
    responses['vendors.select'] = () => ({ data: [{ id: 'vendor-0' }, { id: 'vendor-00' }], error: null })
    const res = await call()
    expect(res.status).toBe(409)
    const body = await json(res)
    expectEnvelope(body, 'conflict')
    expect(body.error?.reason).toBe('duplicate_ein')
    expect(vendorInserts()).toHaveLength(0)
    expect(releaseCalls()).toHaveLength(1)
  })

  it('a failed vendor delete during rollback still releases the claim and answers the original error', async () => {
    responses['vendor_documents.insert'] = () => ({ data: null, error: { code: 'XX000', message: RAW } })
    responses['vendors.delete'] = () => ({ data: null, error: { code: 'XX000', message: RAW } })
    const res = await call(form(GOOD, { file_coi: pdf() }))
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
    expect(releaseCalls()).toHaveLength(1)
  })

  it('a failed EIN lookup is a generic 500, not a silent pass', async () => {
    responses['vendors.select'] = () => ({ data: null, error: { code: 'XX000', message: RAW } })
    const res = await call()
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
    expect(vendorInserts()).toHaveLength(0)
    expect(releaseCalls()).toHaveLength(1)
  })

  it('a unique violation on the vendor insert is 409 duplicate_ein', async () => {
    responses['vendors.insert'] = () => ({ data: null, error: { code: '23505', message: RAW } })
    const res = await call()
    expect(res.status).toBe(409)
    const body = await json(res)
    expectEnvelope(body, 'conflict')
    expect(body.error?.reason).toBe('duplicate_ein')
    expect(releaseCalls()).toHaveLength(1)
  })

  it('a failed vendor insert is a generic 500 with no raw text and releases the claim', async () => {
    responses['vendors.insert'] = () => ({ data: null, error: { code: 'XX000', message: RAW } })
    const res = await call()
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
    expect(releaseCalls()).toHaveLength(1)
  })

  it('a failed upload is a generic 500 and rolls back files, vendor and claim', async () => {
    uploadError = { message: 'bucket internals hoa-documents policy' }
    const res = await call(form(GOOD, { file_coi: pdf() }))
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
    expect(calls.some((c) => c.table === 'vendors' && c.op === 'delete')).toBe(true)
    expect(releaseCalls()).toHaveLength(1)
  })

  it('a failed document row insert removes the uploaded file, the vendor and the claim', async () => {
    responses['vendor_documents.insert'] = () => ({ data: null, error: { code: 'XX000', message: RAW } })
    const res = await call(form(GOOD, { file_coi: pdf() }))
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
    expect(removed).toEqual([uploads])
    expect(calls.some((c) => c.table === 'vendors' && c.op === 'delete')).toBe(true)
    expect(releaseCalls()).toHaveLength(1)
  })

  it('a failed vendor link on the invitation rolls everything back', async () => {
    responses['vendor_onboarding_invitations.update'] = (c) => {
      const v = c.values as { status?: string; vendor_id?: string }
      if (v.status === 'submitted') return { data: [{ id: 'inv-1' }], error: null }
      if (v.vendor_id) return { data: null, error: { code: 'XX000', message: RAW } }
      return { data: null, error: null }
    }
    const res = await call(form(GOOD, { file_coi: pdf() }))
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
    expect(removed).toHaveLength(1)
    expect(releaseCalls()).toHaveLength(1)
  })
})

// ─── Success (RC-1, RC-11) ───────────────────────────────────────────

describe('success', () => {
  it('201 with camelCase fields, no ok flag and no storage paths', async () => {
    const res = await call(form(GOOD, { file_coi: pdf(), file_license: pdf('lic.heic', 10, '') }))
    expect(res.status).toBe(201)
    const body = await json(res)
    expect(body).toEqual({ vendorId: 'vendor-1', documentTypes: ['coi', 'license'] })
    expect(uploads.every((p) => p.startsWith('org-1/vendors/vendor-1/'))).toBe(true)
    const insert = vendorInserts()[0]!.values as Record<string, unknown>
    expect(insert.ein).toBe('123456789')
    expect(insert.organization_id).toBe('org-1')
    expect(insert.service_area_zips).toEqual(['30022'])
    expect(releaseCalls()).toHaveLength(0)
  })

  it('a failing manager notification does not fail the submission', async () => {
    responses['vendor_onboarding_invitations.select'] = () => ({ data: { created_by: 'u-1', invitee_name: null, invitee_email: 'v@example.test', org: null }, error: null })
    responses['profiles.select'] = () => ({ data: { email: 'm@example.test', full_name: null }, error: null })
    sendEmail.mockRejectedValueOnce(new Error('bucket internals smtp'))
    const res = await call()
    expect(res.status).toBe(201)
  })
})
