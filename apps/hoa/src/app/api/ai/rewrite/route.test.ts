import { beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/ai/rewrite is a MIXED surface: AiRewriteButton renders on board
// pages under app/(dashboard) and on four resident pages (resident/arc/new,
// resident/ask, resident/report-violation, resident/tickets/new). So the
// gate is requireRouteMember — residents must succeed, not get 403.

// ─── Mocks ───────────────────────────────────────────────────────────

type Ctx = { role: 'admin' | 'board' | 'resident'; org: { id: string } } | null
let roleCtx: Ctx = { role: 'resident', org: { id: 'org-1' } }
let user: { id: string } | null = { id: 'user-1' }

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => roleCtx),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
  })),
}))

const runMain = vi.fn<(...args: unknown[]) => Promise<string>>()
vi.mock('@homeowner-portal/ai', () => ({ runMain: (...args: unknown[]) => runMain(...args) }))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const { POST } = await import('./route')

const GOOD_REPLY = JSON.stringify({
  variants: [
    { label: 'Polished', text: 'A polished version.' },
    { label: 'Concise', text: 'Short.' },
    { label: 'Warmer', text: 'A friendly version.' },
  ],
})

function req(body: string | object): Request {
  return new Request('http://localhost/api/ai/rewrite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

beforeEach(() => {
  roleCtx = { role: 'resident', org: { id: 'org-1' } }
  user = { id: 'user-1' }
  runMain.mockReset()
  runMain.mockResolvedValue(GOOD_REPLY)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai/rewrite — auth', () => {
  it('answers a signed-out caller 401 before reading the body', async () => {
    roleCtx = null
    user = null
    const res = await POST(req('{not json'))
    expect(res.status).toBe(401)
    expect(await json(res)).toEqual({
      error: expect.objectContaining({ code: 'unauthenticated', message: expect.any(String) }),
    })
    expect(runMain).not.toHaveBeenCalled()
  })

  it('answers a signed-in caller with no HOA org 403 forbidden / no_org', async () => {
    roleCtx = null
    const res = await POST(req({ text: 'hello' }))
    expect(res.status).toBe(403)
    const body = await json(res)
    expect(body.error).toMatchObject({ code: 'forbidden', reason: 'no_org' })
    expect(runMain).not.toHaveBeenCalled()
  })

  it('lets a resident rewrite their own text (resident ARC / ticket / report / ask pages)', async () => {
    roleCtx = { role: 'resident', org: { id: 'org-1' } }
    const res = await POST(req({ text: 'my fence request', context: 'Resident ARC application' }))
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.error).toBeUndefined()
    expect(body.variants).toHaveLength(3)
    expect(runMain).toHaveBeenCalledTimes(1)
  })

  it('lets a board member rewrite', async () => {
    roleCtx = { role: 'board', org: { id: 'org-1' } }
    const res = await POST(req({ text: 'dues reminder' }))
    expect(res.status).toBe(200)
    expect((await json(res)).variants).toHaveLength(3)
  })
})

describe('POST /api/ai/rewrite — parsing and validation', () => {
  it('answers bad JSON with 400 invalid_json in the envelope', async () => {
    const res = await POST(req('{not json'))
    expect(res.status).toBe(400)
    expect((await json(res)).error).toMatchObject({ code: 'invalid_json' })
    expect(runMain).not.toHaveBeenCalled()
  })

  it('answers a schema miss with 400 validation_failed and path/message issues, not raw Zod', async () => {
    const res = await POST(req({ text: '' }))
    expect(res.status).toBe(400)
    const err = (await json(res)).error as Record<string, unknown>
    expect(err.code).toBe('validation_failed')
    expect(Array.isArray(err.issues)).toBe(true)
    for (const issue of err.issues as Array<Record<string, unknown>>) {
      expect(Object.keys(issue).sort()).toEqual(['message', 'path'])
    }
    expect(runMain).not.toHaveBeenCalled()
  })

  it('refuses text over the 8000-char bound with 400 validation_failed', async () => {
    const res = await POST(req({ text: 'x'.repeat(8001) }))
    expect(res.status).toBe(400)
    expect((await json(res)).error).toMatchObject({ code: 'validation_failed' })
  })

  it('answers an oversized body with 413 payload_too_large', async () => {
    const res = await POST(req({ text: 'x'.repeat(2 * 1024 * 1024) }))
    expect(res.status).toBe(413)
    expect((await json(res)).error).toMatchObject({ code: 'payload_too_large' })
    expect(runMain).not.toHaveBeenCalled()
  })
})

describe('POST /api/ai/rewrite — provider failures', () => {
  it('maps a provider throw to 503 upstream_unavailable without the raw error text', async () => {
    runMain.mockRejectedValue(new Error('Groq 400: model llama-3.3 decommissioned, key gsk_secret'))
    const res = await POST(req({ text: 'hello' }))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error).toMatchObject({ code: 'upstream_unavailable' })
    expect(text).not.toContain('Groq')
    expect(text).not.toContain('gsk_secret')
    // The log line carries no message either.
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(logged).not.toContain('gsk_secret')
  })

  it('maps an unusable model reply to 503 upstream_unavailable, not 502', async () => {
    runMain.mockResolvedValue('not json at all')
    const res = await POST(req({ text: 'hello' }))
    expect(res.status).toBe(503)
    expect((await json(res)).error).toMatchObject({ code: 'upstream_unavailable' })
  })
})
