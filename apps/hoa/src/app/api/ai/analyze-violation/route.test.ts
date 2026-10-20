import { beforeEach, describe, expect, it, vi } from 'vitest'

// The route's own branching: role gate, envelope, validation, R-22 storage
// path check, read-error handling. The AI tasks and Supabase are mocked.

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  eqCalls: [] as Array<[string, string, unknown]>,
  orCalls: [] as Array<[string, string]>,
  signed: { data: { signedUrl: 'https://storage.example/signed/abc' }, error: null } as {
    data: { signedUrl: string } | null
    error: unknown
  },
  signCalls: [] as Array<[string, string]>,
  applyThrows: null as Error | null,
}))

// BL-104: the shared board AI ceiling is tested in lib/api/rate-limit.test.ts.
vi.mock('@/lib/api/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/rate-limit')>()),
  requireAiQuota: vi.fn(async () => ({ usageId: null, userId: 'user-1' })),
}))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))

function builder(table: string) {
  const result = () => h.tables[table] ?? { data: null, error: null }
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'not', 'order', 'limit', 'is']) b[m] = vi.fn(() => b)
  b.or = vi.fn((filter: string) => {
    h.orCalls.push([table, filter])
    return b
  })
  b.eq = vi.fn((col: string, val: unknown) => {
    h.eqCalls.push([table, col, val])
    return b
  })
  b.maybeSingle = vi.fn(async () => result())
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((t: string) => builder(t)),
    storage: {
      from: vi.fn((bucket: string) => ({
        createSignedUrl: vi.fn(async (path: string) => {
          h.signCalls.push([bucket, path])
          return h.signed
        }),
      })),
    },
  })),
}))

const ai = vi.hoisted(() => ({
  analyzeViolationPhoto: vi.fn(async () => ({ description: 'Trailer parked on lawn', violationDetected: true })),
  covenantBrainAnalyze: vi.fn(async () => ({
    ccrSection: '4.2',
    violationType: 'parking',
    severity: 'low' as const,
    confidence: 'high' as const,
  })),
  draftViolationLetter: vi.fn(async () => 'Dear Homeowner, …'),
}))
vi.mock('@homeowner-portal/ai', () => ai)

vi.mock('@homeowner-portal/workflows/W3-state-rules', async (importOriginal) => {
  const real = await importOriginal<typeof import('@homeowner-portal/workflows/W3-state-rules')>()
  return {
    ...real,
    applyStateRulesToDraft: vi.fn((args: Parameters<typeof real.applyStateRulesToDraft>[0]) => {
      if (h.applyThrows) throw h.applyThrows
      return real.applyStateRulesToDraft(args)
    }),
  }
})

import { POST } from './route'
import { AI_ELIGIBLE_DOCUMENT_FILTER } from '@/lib/documents-rules'

const PROPERTY = '11111111-1111-4111-8111-111111111111'
const PATH = 'org-1/1700000000000-abc123.jpg'

function req(body: unknown, raw?: string): Request {
  return new Request('http://x/api/ai/analyze-violation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
}

const valid = { propertyId: PROPERTY, photoStoragePath: PATH, curePeriodDays: 14, fineAmountCents: 2500 }

beforeEach(() => {
  h.role = 'board'
  h.eqCalls = []
  h.signCalls = []
  h.applyThrows = null
  h.signed = { data: { signedUrl: 'https://storage.example/signed/abc' }, error: null }
  h.tables = {
    hoa_properties: { data: { address: '1 Elm St', owner_name: 'Pat Owner' }, error: null },
    orgs: { data: { name: 'Test HOA' }, error: null },
    hoa_documents: { data: null, error: null },
    associations: { data: { state: null }, error: null },
  }
  vi.clearAllMocks()
})

describe('POST /api/ai/analyze-violation', () => {
  it('refuses a resident with 403 before reading the body or calling AI (F-03, R-02, R-16)', async () => {
    h.role = 'resident'
    const res = await POST(req(null, '{not json'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('forbidden')
    expect(typeof body.error.message).toBe('string')
    expect(ai.analyzeViolationPhoto).not.toHaveBeenCalled()
  })

  it('answers bad JSON with 400 invalid_json', async () => {
    const res = await POST(req(null, '{not json'))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_json')
  })

  it('answers a schema miss with 400 validation_failed and field issues, not raw Zod', async () => {
    const res = await POST(req({ propertyId: 'nope', photoStoragePath: PATH }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'propertyId' })]))
  })

  it('bounds manualDescription (R-17)', async () => {
    const res = await POST(req({ ...valid, manualDescription: 'x'.repeat(20_001) }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation_failed')
  })

  it('answers an oversized body with 413', async () => {
    const res = await POST(req({ ...valid, manualDescription: 'x'.repeat(1_100_000) }))
    expect(res.status).toBe(413)
    expect((await res.json()).error.code).toBe('payload_too_large')
  })

  it('takes money as integer cents (C-10)', async () => {
    const res = await POST(req({ ...valid, fineAmountCents: 25.5 }))
    expect(res.status).toBe(400)
  })

  it.each([
    ['another org', 'org-2/1700000000000-abc123.jpg'],
    ['a traversal', 'org-1/../org-2/x.jpg'],
    ['a URL', 'https://evil.example/x.jpg'],
  ])('refuses a photo path in %s and never calls the vision provider (R-22)', async (_label, path) => {
    const res = await POST(req({ ...valid, photoStoragePath: path }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('not_found')
    expect(body.error.reason).toBe('photo_not_found')
    expect(h.signCalls).toHaveLength(0)
    expect(ai.analyzeViolationPhoto).not.toHaveBeenCalled()
  })

  it('signs the org photo server-side and hands only that URL to vision (R-22)', async () => {
    const res = await POST(req({ ...valid, manualDescription: 'Seen twice' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBeUndefined()
    expect(h.signCalls).toEqual([['hoa-photos', PATH]])
    expect(ai.analyzeViolationPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: 'https://storage.example/signed/abc' }),
    )
    expect(body.description).toBe('Trailer parked on lawn. Seen twice')
    expect(typeof body.letterDraft).toBe('string')
    expect(ai.draftViolationLetter).toHaveBeenCalledWith(expect.objectContaining({ fineAmount: 25, hoaName: 'Test HOA' }))
  })

  it('M-3: never cites an unconfirmed file filed from the inbox as the CC&R', async () => {
    const res = await POST(req(valid))
    expect(res.status).toBe(200)
    expect(h.orCalls).toContainEqual(['hoa_documents', AI_ELIGIBLE_DOCUMENT_FILTER])
  })

  it('scopes the property lookup to the caller org and 404s a foreign or missing id', async () => {
    h.tables.hoa_properties = { data: null, error: null }
    const res = await POST(req(valid))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('not_found')
    expect(body.error.reason).toBe('property_not_found')
    expect(h.eqCalls).toContainEqual(['hoa_properties', 'org_id', 'org-1'])
  })

  it('turns a property read error into the generic 500, with no raw text', async () => {
    h.tables.hoa_properties = {
      data: null,
      error: { code: 'XX000', message: 'relation "hoa_properties" secret detail pat@example.com' },
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toMatch(/hoa_properties|secret detail|pat@example/)
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/secret detail|pat@example/)
    spy.mockRestore()
  })

  it('degrades a vision failure to a warning and never logs the error text', async () => {
    ai.analyzeViolationPhoto.mockRejectedValueOnce(new Error('provider said 1 Elm St pat@example.com'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await POST(req(valid))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.warnings.join(' ')).toMatch(/Photo analysis is offline/)
    const logged = JSON.stringify([...errSpy.mock.calls, ...warnSpy.mock.calls])
    expect(logged).not.toMatch(/pat@example|Elm St/)
    errSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('turns an unexpected state-rules throw into a JSON 500, not a framework 500 (R-20)', async () => {
    h.applyThrows = new Error('boom with raw detail')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toMatch(/raw detail/)
    expect(JSON.parse(text).error.code).toBe('internal')
    spy.mockRestore()
  })
})
