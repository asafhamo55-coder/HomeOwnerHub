import { beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/ai/compose-communication — board-only (BL-102 A2). The model is
// mocked; nothing here reaches a provider, and nothing is sent.

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

// Synthetic: no real person.
const INPUT = { message: 'Water off Thursday 9-2 on Elm St, Mrs Example at 12 Elm asked', localNow: '2026-10-20T10:15' }
const REPLY = {
  subject: 'Water off Thursday, 9am to 2pm',
  body: 'Hi {{ recipient_name }},\n\nThe water will be off Thursday from 9am to 2pm on Elm St.\n\n{{ association_name }} Board',
  audience: 'everyone',
  street: 'Elm St',
  urgency: 'urgent',
  category: 'emergency',
  templateId: 'builtin:water-shutoff',
  sendAt: null,
  missingFacts: [],
  why: 'A water shutoff is urgent.',
}

function post(body: unknown, raw = false): Request {
  return new Request('http://x/api/ai/compose-communication', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

function logged(): string {
  return JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
}

beforeEach(() => {
  h.role = 'board'
  h.signedIn = true
  h.runMain.mockReset()
  h.runMain.mockResolvedValue(JSON.stringify(REPLY))
  h.requireAiQuota.mockReset()
  h.requireAiQuota.mockResolvedValue({ usageId: 'u-1', userId: 'user-1' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai/compose-communication', () => {
  it('returns a proposal for a board member, drawing on the compose bucket first', async () => {
    const res = await POST(post(INPUT))
    expect(res.status).toBe(200)
    const { proposal } = await res.json()
    expect(proposal).toMatchObject({
      audience: 'everyone',
      street: 'Elm St',
      urgency: 'urgent',
      templateId: 'builtin:water-shutoff',
      sendAt: null,
    })
    expect(h.requireAiQuota).toHaveBeenCalledWith('compose', 'org-1')
    expect(h.requireAiQuota.mock.invocationCallOrder[0]!).toBeLessThan(h.runMain.mock.invocationCallOrder[0]!)
  })

  it('offers the model only the built-in templates', async () => {
    await POST(post(INPUT))
    const messages = h.runMain.mock.calls[0]![0] as Array<{ role: string; content: string }>
    expect(messages[0]!.content).toContain('builtin:water-shutoff')
    expect(messages[1]!.content).toContain('Elm St')
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
    const miss = await POST(post({ message: 'hi there', localNow: 'tomorrow' }))
    expect(miss.status).toBe(400)
    expect((await miss.json()).error.code).toBe('validation_failed')
    expect(h.requireAiQuota).not.toHaveBeenCalled()
  })

  it('429 when the compose bucket is full, and no model call', async () => {
    h.requireAiQuota.mockRejectedValue(rateLimitedError('compose', { ok: false, scope: 'user', retryAfterSeconds: 600 }))
    const res = await POST(post(INPUT))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('600')
    expect(h.runMain).not.toHaveBeenCalled()
  })

  it('503 without provider text or the board’s words when the model throws', async () => {
    h.runMain.mockRejectedValue(new Error('Groq 500 key gsk_secret'))
    const res = await POST(post(INPUT))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(text).not.toContain('gsk_secret')
    expect(logged()).not.toContain('gsk_secret')
    expect(logged()).not.toContain('Mrs Example')
  })

  it('503 when the reply uses a merge field the send cannot fill (after one retry)', async () => {
    h.runMain.mockResolvedValue(JSON.stringify({ ...REPLY, body: `${REPLY.body} {{ unit_address }}` }))
    const res = await POST(post(INPUT))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatchObject({ code: 'upstream_unavailable', reason: 'unusable_reply' })
    expect(h.runMain).toHaveBeenCalledTimes(2)
    expect(logged()).not.toContain('Mrs Example')
  })
})
