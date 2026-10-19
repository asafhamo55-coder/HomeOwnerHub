import { beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/ai/translate-communication — board-only (BL-025). The model is
// mocked; nothing here reaches a provider.

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  signedIn: true,
  runMain: vi.fn<(...args: unknown[]) => Promise<string>>(),
  requireAiQuota: vi.fn(),
}))

const ORG = { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 }

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => (h.role === null ? null : { role: h.role, org: ORG })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.signedIn ? { id: 'user-1' } : null } }) },
  })),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@homeowner-portal/ai', () => ({ runMain: (...a: unknown[]) => h.runMain(...a) }))
vi.mock('@/lib/api/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/rate-limit')>()),
  requireAiQuota: h.requireAiQuota,
}))

const { rateLimitedError } = await import('@/lib/api/rate-limit')
const { POST } = await import('./route')

const INPUT = { subject: 'Pool opens', bodyHtml: '<p>Hi {{ recipient_name }}, the pool opens Saturday.</p>' }
const GOOD = JSON.stringify({
  subject: 'La piscina abre',
  bodyHtml: '<p>Hola {{ recipient_name }}, la piscina abre el sábado.</p>',
})

function post(body: unknown, raw = false): Request {
  return new Request('http://x/api/ai/translate-communication', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

beforeEach(() => {
  h.role = 'board'
  h.signedIn = true
  h.runMain.mockReset()
  h.runMain.mockResolvedValue(GOOD)
  h.requireAiQuota.mockReset()
  h.requireAiQuota.mockResolvedValue({ usageId: 'u-1', userId: 'user-1' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai/translate-communication', () => {
  it('returns the Spanish draft for a board member', async () => {
    const res = await POST(post(INPUT))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(JSON.parse(GOOD))
    expect(h.requireAiQuota).toHaveBeenCalledWith('translate', 'org-1')
    expect(h.requireAiQuota.mock.invocationCallOrder[0]!).toBeLessThan(h.runMain.mock.invocationCallOrder[0]!)
  })

  it('refuses a resident with 403 before reading the body', async () => {
    h.role = 'resident'
    const res = await POST(post('{bad', true))
    expect(res.status).toBe(403)
    expect(h.runMain).not.toHaveBeenCalled()
  })

  it('401 when signed out', async () => {
    h.role = null
    h.signedIn = false
    expect((await POST(post(INPUT))).status).toBe(401)
  })

  it('400 invalid_json and validation_failed, no quota drawn', async () => {
    const bad = await POST(post('{bad', true))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe('invalid_json')
    const miss = await POST(post({ subject: '' }))
    expect(miss.status).toBe(400)
    expect((await miss.json()).error.code).toBe('validation_failed')
    expect(h.requireAiQuota).not.toHaveBeenCalled()
  })

  it('429 when the translate bucket is full, and no model call', async () => {
    h.requireAiQuota.mockRejectedValue(rateLimitedError('translate', { ok: false, scope: 'user', retryAfterSeconds: 600 }))
    const res = await POST(post(INPUT))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('600')
    expect(h.runMain).not.toHaveBeenCalled()
  })

  it('503 without raw provider text when the model throws', async () => {
    h.runMain.mockRejectedValue(new Error('Groq 500 key gsk_secret'))
    const res = await POST(post(INPUT))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(text).not.toContain('gsk_secret')
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain('gsk_secret')
  })

  it('503 when the reply drops a merge field (after one retry)', async () => {
    h.runMain.mockResolvedValue(JSON.stringify({ subject: 'Piscina', bodyHtml: '<p>Hola, la piscina abre.</p>' }))
    const res = await POST(post(INPUT))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatchObject({ code: 'upstream_unavailable', reason: 'unusable_reply' })
    expect(h.runMain).toHaveBeenCalledTimes(2)
  })
})
