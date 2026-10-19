import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  role: 'resident' as 'admin' | 'board' | 'resident' | null,
  gate: { on: true } as Record<string, unknown>,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } })),
}))

const scope = { db: {}, orgId: 'org-1', userId: 'user-1', email: null, units: [] }
vi.mock('@/lib/resident-assistant/server', () => ({ resolveResidentAssistant: vi.fn(async () => h.gate) }))

const agent = vi.hoisted(() => ({ askResident: vi.fn() }))
vi.mock('@/lib/resident-assistant/agent', () => ({ askResident: agent.askResident, MAX_TURNS: 12 }))

const quota = vi.hoisted(() => ({ requireAiQuota: vi.fn() }))
vi.mock('@/lib/api/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/rate-limit')>()),
  requireAiQuota: quota.requireAiQuota,
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const { POST } = await import('./route')
const { rateLimitedError } = await import('@/lib/api/rate-limit')

const post = (body: unknown) =>
  POST(new Request('http://x/api/ai/resident-assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
const ask = { messages: [{ role: 'user', content: 'What do I owe?' }] }

beforeEach(() => {
  h.role = 'resident'
  h.gate = { on: true, scope, associationIds: ['assoc-1'] }
  quota.requireAiQuota.mockReset()
  quota.requireAiQuota.mockResolvedValue({ usageId: 'usage-1', userId: 'user-1' })
  agent.askResident.mockReset()
  agent.askResident.mockResolvedValue({
    answer: 'You owe $325.00.',
    citations: [],
    handoffs: [{ action: 'ask_board', subject: 'Billing', description: 'Question' }],
    docsUnanswered: false,
    toolsUsed: ['my_account'],
    steps: 2,
  })
})

describe('POST /api/ai/resident-assistant', () => {
  it('answers with the named fields only', async () => {
    const res = await post(ask)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      answer: 'You owe $325.00.',
      citations: [],
      handoffs: [{ action: 'ask_board', subject: 'Billing', description: 'Question' }],
      docsUnanswered: false,
    })
    expect(quota.requireAiQuota).toHaveBeenCalledWith('resident_assistant', 'org-1')
    expect(agent.askResident.mock.calls[0]![1]).toEqual({ scope, associationId: 'assoc-1' })
  })

  it('switched off / impersonating → 403 with the reason, no quota drawn, no model call', async () => {
    for (const reason of ['switched_off', 'impersonating', 'not_resident']) {
      h.gate = { on: false, reason }
      const res = await post(ask)
      expect(res.status).toBe(403)
      expect((await res.json()).error.reason).toBe(reason)
    }
    expect(quota.requireAiQuota).not.toHaveBeenCalled()
    expect(agent.askResident).not.toHaveBeenCalled()
  })

  it('no model configured → 503', async () => {
    h.gate = { on: false, reason: 'not_configured' }
    expect((await post(ask)).status).toBe(503)
  })

  it('the last message must be the resident’s', async () => {
    const res = await post({ messages: [{ role: 'assistant', content: 'hello' }] })
    expect(res.status).toBe(400)
    expect(agent.askResident).not.toHaveBeenCalled()
  })

  it('rate limited → 429 before the model is called', async () => {
    quota.requireAiQuota.mockRejectedValue(rateLimitedError('resident_assistant', { ok: false, scope: 'user', retryAfterSeconds: 600 }))
    const res = await post(ask)
    expect(res.status).toBe(429)
    expect(agent.askResident).not.toHaveBeenCalled()
  })

  it('an agent failure is upstream_unavailable with no provider text', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    agent.askResident.mockRejectedValue(new Error('LLM call failed: HTTP 500 sk-secret'))
    const res = await post(ask)
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toContain('sk-secret')
    spy.mockRestore()
  })

  it('signed out → 401', async () => {
    h.role = null
    const { getSupabaseServerClient } = await import('@/lib/supabase/server')
    vi.mocked(getSupabaseServerClient).mockResolvedValueOnce({ auth: { getUser: async () => ({ data: { user: null } }) } } as never)
    expect((await post(ask)).status).toBe(401)
  })
})
