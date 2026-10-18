import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The model is mocked: no test reaches a provider.

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  user: { id: 'user-1' } as { id: string } | null,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } })),
}))
const model = vi.hoisted(() => ({ completeAskWithModel: vi.fn() }))
vi.mock('@/lib/guide/ask-model', () => model)

const { POST } = await import('./route')

function req(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/help/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

const ANSWER = JSON.stringify({ answer: '1. Open Dues. [S1]\n2. Select [[Mark paid]]. [S1] See https://evil.example', citations: ['S1', 'S9'], route: 'S1', covered: true })

let logs: string[] = []
beforeEach(() => {
  h.role = 'board'
  h.user = { id: 'user-1' }
  model.completeAskWithModel.mockReset()
  model.completeAskWithModel.mockResolvedValue(ANSWER)
  logs = []
  for (const m of ['log', 'info', 'warn', 'error'] as const)
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')))
})
afterEach(() => vi.restoreAllMocks())

describe('POST /api/help/ask', () => {
  it('401 when signed out, before reading the body', async () => {
    h.role = null
    h.user = null
    const res = await POST(req('not json', true))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthenticated')
  })

  it('400 invalid_json, 400 validation_failed, 413 oversized', async () => {
    expect((await POST(req('{nope', true))).status).toBe(400)
    const v = await POST(req({ question: 'x' }))
    expect(v.status).toBe(400)
    expect((await v.json()).error.code).toBe('validation_failed')
    expect((await POST(req({ question: 'a'.repeat(501) }))).status).toBe(400)
    expect((await POST(req({ question: 'How do I pay?', route: '/x'.repeat(5000) }))).status).toBe(413)
  })

  it('answers from the guide with validated citations and a frontmatter deep link', async () => {
    const res = await POST(req({ question: 'How do I record a check payment?', route: '/dues' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.kind).toBe('answer')
    expect(body.citations).toHaveLength(1)
    expect(body.citations[0]).toMatchObject({ articleId: 'dues-record-payment', href: expect.stringMatching(/^\/help\/dues-record-payment#/) })
    expect(body.takeMeThere).toEqual({ label: 'Record a payment by check or cash', href: '/dues' })
    expect(JSON.stringify(body)).not.toContain('evil.example')
    expect(body.meta).toBeUndefined()
  })

  it('residents may ask, and only ever get resident articles', async () => {
    h.role = 'resident'
    const res = await POST(req({ question: 'How do I pay my dues?' }))
    const body = await res.json()
    expect(body.kind).toBe('answer')
    expect(body.citations.every((c: { articleId: string }) => c.articleId === 'resident-portal-basics')).toBe(true)
  })

  it('refuses an uncovered question without calling the model', async () => {
    const body = await (await POST(req({ question: 'How do I sync our books with QuickBooks?' }))).json()
    expect(body.kind).toBe('not_covered')
    expect(model.completeAskWithModel).not.toHaveBeenCalled()
  })

  it('routes rules questions to the right Ask the Docs', async () => {
    expect(await (await POST(req({ question: 'Can I paint my front door red?' }))).json()).toEqual({ kind: 'rules_question', askDocsHref: '/ai/ask' })
    h.role = 'resident'
    expect(await (await POST(req({ question: 'Can I paint my front door red?' }))).json()).toEqual({ kind: 'rules_question', askDocsHref: '/resident/ask' })
  })

  it('model down: 200 with the matching articles instead', async () => {
    model.completeAskWithModel.mockRejectedValue(new Error('ai_http_503 secret-provider-text'))
    const res = await POST(req({ question: 'How do I record a check payment?' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.kind).toBe('unavailable')
    expect(body.suggestions[0].articleId).toBe('dues-record-payment')
    expect(JSON.stringify(body)).not.toContain('secret-provider-text')
  })

  it('redacts contact details before the model, and never logs the question, path ids or contact details', async () => {
    const question = 'How do I record a check payment from jane.doe@example.test or 305-555-0142?'
    await POST(req({ question, route: '/properties/7b1e2c90-0000-4000-8000-000000000001' }))
    const sent = JSON.stringify(model.completeAskWithModel.mock.calls[0]![0])
    expect(sent).not.toContain('jane.doe@example.test')
    expect(sent).not.toContain('305-555-0142')

    const all = logs.join('\n')
    expect(all).not.toContain('check payment')
    expect(all).not.toContain('jane.doe')
    expect(all).not.toContain('7b1e2c90')
    const line = logs.find((l) => l.includes('"help_event"'))!
    expect(JSON.parse(line)).toEqual({
      type: 'help_event',
      event: 'help.ask',
      routeTemplate: '/properties/[id]',
      kind: 'answer',
      citationCount: 1,
      topScoreBucket: expect.any(String),
      latencyBucket: '<1s',
      role: 'board',
    })
  })
})
