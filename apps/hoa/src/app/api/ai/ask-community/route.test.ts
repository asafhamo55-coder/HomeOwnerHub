import { beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/ai/ask-community against api-route-conventions RC-1..RC-4,
// RC-8 and RC-2: board-only gate, envelope shape, validation, foreign
// association ids, and no raw provider / tool text in any response.

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  user: { id: 'user-1' } as { id: string } | null,
  assocFound: true,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))

vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => null) }))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      maybeSingle: vi.fn(async () => ({ data: h.assocFound ? { id: 'x' } : null, error: null })),
    }
    return {
      auth: { getUser: vi.fn(async () => ({ data: { user: h.user } })) },
      from: vi.fn(() => q),
    }
  }),
}))

const askCommunity = vi.hoisted(() => vi.fn())
vi.mock('@/lib/community-qa/agent', () => ({ askCommunity }))

// BL-106: the limiter is mocked (lib/api/rate-limit.test.ts pins the ledger
// and the bucket math); the real rateLimitedError builds the 429 below.
const quota = vi.hoisted(() => ({ requireAiQuota: vi.fn() }))
vi.mock('@/lib/api/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/rate-limit')>()),
  requireAiQuota: quota.requireAiQuota,
}))

import { POST } from './route'
import { rateLimitedError } from '@/lib/api/rate-limit'
import { ContactVault } from '@/lib/community-qa/contact-placeholders'

const ASSOC = '11111111-1111-4111-8111-111111111111'

function req(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/ai/ask-community', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

async function envelope(res: Response) {
  const json = (await res.json()) as { error: { code: string; message: string; [k: string]: unknown } }
  expect(typeof json.error).toBe('object')
  expect(typeof json.error.message).toBe('string')
  return json.error
}

beforeEach(() => {
  h.role = 'board'
  h.user = { id: 'user-1' }
  h.assocFound = true
  process.env.AI_API_KEY = 'test-key'
  askCommunity.mockReset()
  askCommunity.mockResolvedValue({ answer: 'Twelve.', toolCalls: [], steps: 1 })
  quota.requireAiQuota.mockReset()
  quota.requireAiQuota.mockResolvedValue({ usageId: 'usage-1', userId: 'user-1' })
})

describe('POST /api/ai/ask-community', () => {
  it('answers a board member', async () => {
    const res = await POST(req({ question: 'How many units are leased?' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ answer: 'Twelve.', toolCalls: [], steps: 1 })
    expect(askCommunity).toHaveBeenCalledWith('How many units are leased?', expect.objectContaining({ orgId: 'org-1', associationId: null }))
  })

  it('refuses a resident with the 403 envelope before reading the body', async () => {
    h.role = 'resident'
    const res = await POST(req('{not json', true))
    expect(res.status).toBe(403)
    expect((await envelope(res)).code).toBe('forbidden')
    expect(askCommunity).not.toHaveBeenCalled()
  })

  it('answers a signed-out caller with the 401 envelope', async () => {
    h.role = null
    h.user = null
    const res = await POST(req({ question: 'How many units?' }))
    expect(res.status).toBe(401)
    expect((await envelope(res)).code).toBe('unauthenticated')
  })

  it('answers a signed-in caller with no org with 403 no_org', async () => {
    h.role = null
    const res = await POST(req({ question: 'How many units?' }))
    expect(res.status).toBe(403)
    const e = await envelope(res)
    expect(e.code).toBe('forbidden')
    expect(e.reason).toBe('no_org')
  })

  it('rejects bad JSON with 400 invalid_json', async () => {
    const res = await POST(req('{not json', true))
    expect(res.status).toBe(400)
    expect((await envelope(res)).code).toBe('invalid_json')
  })

  it('rejects a schema miss with 400 validation_failed and flat issues', async () => {
    const res = await POST(req({ question: 'hi', associationId: 'nope' }))
    expect(res.status).toBe(400)
    const e = await envelope(res)
    expect(e.code).toBe('validation_failed')
    const issues = e.issues as Array<{ path: string; message: string }>
    expect(issues.map((i) => i.path).sort()).toEqual(['associationId', 'question'])
    for (const i of issues) expect(Object.keys(i).sort()).toEqual(['message', 'path'])
  })

  it('rejects an oversized question with 400 and an oversized body with 413', async () => {
    const long = await POST(req({ question: 'x'.repeat(2001) }))
    expect(long.status).toBe(400)
    const huge = await POST(req({ question: 'x'.repeat(1024 * 1024 + 10) }))
    expect(huge.status).toBe(413)
    expect((await envelope(huge)).code).toBe('payload_too_large')
  })

  it('answers a foreign associationId with 404 and never runs the agent', async () => {
    h.assocFound = false
    const res = await POST(req({ question: 'Pet limit?', associationId: ASSOC }))
    expect(res.status).toBe(404)
    expect((await envelope(res)).code).toBe('not_found')
    expect(askCommunity).not.toHaveBeenCalled()
  })

  it('passes an owned associationId through', async () => {
    const res = await POST(req({ question: 'Pet limit?', associationId: ASSOC }))
    expect(res.status).toBe(200)
    expect(askCommunity).toHaveBeenCalledWith('Pet limit?', expect.objectContaining({ associationId: ASSOC }))
  })

  it('answers a missing AI key with 503 not_configured', async () => {
    delete process.env.AI_API_KEY
    const res = await POST(req({ question: 'How many units?' }))
    expect(res.status).toBe(503)
    expect((await envelope(res)).code).toBe('not_configured')
    expect(askCommunity).not.toHaveBeenCalled()
  })

  it('maps a provider failure to 503 upstream_unavailable with no raw text', async () => {
    askCommunity.mockRejectedValue(new Error('LLM call failed: HTTP 500 — secret provider body'))
    const res = await POST(req({ question: 'How many units?' }))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(text).not.toContain('secret provider body')
    expect(text).not.toContain('LLM call failed')
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
  })

  it('lets the agent see owner contact only because the caller is board or admin', async () => {
    await POST(req({ question: 'Who owns 829?' }))
    expect(askCommunity).toHaveBeenCalledWith('Who owns 829?', expect.objectContaining({ canSeeOwnerContact: true }))
  })

  it('fills contact tokens in the answer server-side for board/admin (BL-062)', async () => {
    const vault = new ContactVault()
    vault.token('email', 'pat@example.com')
    vault.token('phone', '305-555-0142')
    askCommunity.mockResolvedValue({
      answer: 'Pat: [OWNER_EMAIL_1], [OWNER_PHONE_1], [OWNER_EMAIL_9].',
      toolCalls: [],
      steps: 2,
      contactVault: vault,
    })
    for (const role of ['board', 'admin'] as const) {
      h.role = role
      const res = await POST(req({ question: 'How do I reach the owner of 829?' }))
      // Same public shape as before: the vault itself never ships.
      expect(await res.json()).toEqual({
        answer: 'Pat: pat@example.com, 305-555-0142, (not on file).',
        toolCalls: [],
        steps: 2,
      })
    }
  })

  it('returns only the named response fields, camelCase', async () => {
    askCommunity.mockResolvedValue({
      answer: 'Two.',
      toolCalls: [{ name: 'count_properties', args: {}, result: { failed: true, code: 'lookup_failed' } }],
      steps: 2,
      citations: [],
      confidence: 'LOW',
      runId: 'run-1',
      internal_debug: 'should not ship',
    })
    const res = await POST(req({ question: 'How many properties?' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      answer: 'Two.',
      toolCalls: [{ name: 'count_properties', args: {}, result: { failed: true, code: 'lookup_failed' } }],
      steps: 2,
      citations: [],
      confidence: 'LOW',
      runId: 'run-1',
    })
  })

  describe('BL-106 quota (ask_community bucket)', () => {
    it('draws on its own ask_community bucket with the gate org id, before the agent runs', async () => {
      const res = await POST(req({ question: 'How many units are leased?' }))
      expect(res.status).toBe(200)
      expect(quota.requireAiQuota).toHaveBeenCalledTimes(1)
      expect(quota.requireAiQuota).toHaveBeenCalledWith('ask_community', 'org-1')
      expect(quota.requireAiQuota.mock.invocationCallOrder[0]).toBeLessThan(askCommunity.mock.invocationCallOrder[0]!)
    })

    it('over the cap: 429 rate_limited with Retry-After and the friendly message, and no agent call', async () => {
      quota.requireAiQuota.mockRejectedValue(
        rateLimitedError('ask_community', { ok: false, scope: 'user', retryAfterSeconds: 900 }),
      )
      const res = await POST(req({ question: 'How many units are leased?' }))
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBe('900')
      expect((await res.json()).error).toEqual({
        code: 'rate_limited',
        reason: 'user_limit',
        retryAfterSeconds: 900,
        message: 'You’ve reached the limit of 15 Copilot questions an hour. Try again in about 15 minutes.',
      })
      expect(askCommunity).not.toHaveBeenCalled()
    })

    it('a failed agent run still counts: the slot is taken before the provider is reached', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      askCommunity.mockRejectedValue(new Error('provider down'))
      const res = await POST(req({ question: 'How many units are leased?' }))
      expect(res.status).toBe(503)
      expect(quota.requireAiQuota).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    })

    it('does not spend quota on a refused caller, a bad request, a foreign association or a missing key', async () => {
      h.role = 'resident'
      await POST(req({ question: 'How many units?' }))
      h.role = 'board'
      await POST(req('{not json', true))
      await POST(req({ question: 'hi' }))
      h.assocFound = false
      await POST(req({ question: 'Pet limit?', associationId: ASSOC }))
      h.assocFound = true
      delete process.env.AI_API_KEY
      const unset = await POST(req({ question: 'How many units?' }))
      expect(unset.status).toBe(503)
      expect(quota.requireAiQuota).not.toHaveBeenCalled()
    })
  })
})
