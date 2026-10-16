import { beforeEach, describe, expect, it, vi } from 'vitest'

// suggest-fields is a board-only surface (RC-4): both callers live under
// app/(dashboard) (violations/new/Wizard.tsx, meetings/MeetingWizard.tsx).

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  user: true,
  suggest: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: h.user ? { id: 'user-1' } : null } })) },
  })),
}))

vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@homeowner-portal/ai', () => ({ suggestFieldValues: h.suggest }))

import { POST } from './route'

const URL_ = 'http://localhost/api/ai/suggest-fields'

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const VALID = {
  kind: 'violation',
  partialState: { notes: 'Trash cans left out', propertyAddress: '1 Main', unitNumber: null, hasPhoto: true },
  fields: ['cure_period_days', 'fine_amount', 'severity', 'violation_type'],
}

async function json(res: Response) {
  return (await res.json()) as { error?: { code: string; message: string; issues?: unknown[]; reason?: string } }
}

beforeEach(() => {
  h.role = 'board'
  h.user = true
  h.suggest.mockReset()
  h.suggest.mockResolvedValue([{ field: 'severity', value: 'low', reasoning: 'Minor.' }])
})

describe('POST /api/ai/suggest-fields', () => {
  it('returns suggestions for a board member', async () => {
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ suggestions: [{ field: 'severity', value: 'low', reasoning: 'Minor.' }] })
    expect(h.suggest).toHaveBeenCalledWith({
      kind: 'violation',
      partialState: VALID.partialState,
      fields: VALID.fields,
    })
  })

  it('refuses a resident with 403 before reading the body or calling the model', async () => {
    h.role = 'resident'
    const res = await POST(req('not json'))
    expect(res.status).toBe(403)
    expect((await json(res)).error?.code).toBe('forbidden')
    expect(h.suggest).not.toHaveBeenCalled()
  })

  it('answers a signed-out caller 401 before validating the body (RC-3)', async () => {
    h.role = null
    h.user = false
    const res = await POST(req({ kind: 'nope' }))
    expect(res.status).toBe(401)
    expect((await json(res)).error?.code).toBe('unauthenticated')
  })

  it('answers a signed-in caller with no org 403 no_org in the envelope', async () => {
    h.role = null
    const res = await POST(req(VALID))
    expect(res.status).toBe(403)
    const body = await json(res)
    expect(body.error?.code).toBe('forbidden')
    expect(body.error?.reason).toBe('no_org')
  })

  it('answers bad JSON with 400 invalid_json', async () => {
    const res = await POST(req('{not json'))
    expect(res.status).toBe(400)
    expect((await json(res)).error?.code).toBe('invalid_json')
  })

  it('answers a schema miss with 400 validation_failed and issues', async () => {
    const res = await POST(req({ kind: 'nope', partialState: {} }))
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error?.code).toBe('validation_failed')
    expect(Array.isArray(body.error?.issues)).toBe(true)
    expect(body.error?.issues?.length).toBeGreaterThan(0)
  })

  it('bounds partialState strings, keys and the fields array (RC-8)', async () => {
    const longValue = await POST(req({ ...VALID, partialState: { notes: 'x'.repeat(20_001) } }))
    expect(longValue.status).toBe(400)
    const manyKeys = await POST(
      req({ ...VALID, partialState: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 'v'])) }),
    )
    expect(manyKeys.status).toBe(400)
    const nested = await POST(req({ ...VALID, partialState: { deep: { a: 1 } } }))
    expect(nested.status).toBe(400)
    const manyFields = await POST(req({ ...VALID, fields: Array.from({ length: 101 }, (_, i) => `f${i}`) }))
    expect(manyFields.status).toBe(400)
    expect(h.suggest).not.toHaveBeenCalled()
  })

  it('answers an oversized body with 413', async () => {
    const res = await POST(req(VALID, { 'content-length': String(2 * 1024 * 1024) }))
    expect(res.status).toBe(413)
    expect((await json(res)).error?.code).toBe('payload_too_large')
  })

  it('maps a provider failure to 503 upstream_unavailable with no raw text', async () => {
    h.suggest.mockRejectedValue(new Error('groq 500: model llama-x quota for org secret-123'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req(VALID))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(text).not.toContain('secret-123')
    for (const call of errSpy.mock.calls) expect(JSON.stringify(call)).not.toContain('secret-123')
    errSpy.mockRestore()
  })
})
