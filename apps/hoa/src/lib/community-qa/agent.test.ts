import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The agent loop feeds every tool result back to the LLM, so whatever a
// tool error says can end up in the answer (RC-2). These tests drive the
// loop with a fake /chat/completions and inspect what the model is sent
// and what the agent hands back to the route.

const W1 = vi.hoisted(() => ({ queryGoverningDocs: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W1', () => W1)
vi.mock('@homeowner-portal/ai', () => ({ resolveModel: () => 'test-model' }))

const { askCommunity } = await import('./agent')

const SECRET = 'relation "hoa_properties" violates key (owner_email)=(pat@example.com)'

/** A query chain that resolves to one fixed `{ data, error }`. */
function fixedDb(result: { data: unknown; error: unknown; count?: number | null }) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'lt', 'ilike', 'order', 'limit', 'range']) q[m] = () => q
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return { from: () => q } as never
}

type Call = { name: string; args?: Record<string, unknown> }

/** First reply asks for `calls`; the second reply is a final answer. */
function fakeLlm(calls: Call[], answer = 'Done.') {
  const bodies: Array<{ messages: Array<{ role: string; content?: string | null }> }> = []
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body))
    const first = bodies.length === 1
    const message = first
      ? {
          role: 'assistant',
          content: null,
          tool_calls: calls.map((c, i) => ({
            id: `tc${i}`,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
          })),
        }
      : { role: 'assistant', content: answer }
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { bodies, fetchMock }
}

const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  process.env.AI_API_KEY = 'test-key'
  errSpy.mockClear()
  W1.queryGoverningDocs.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('askCommunity tool errors', () => {
  it('a DB failure reaches the model and the caller only as a fixed code', async () => {
    const { bodies } = fakeLlm([{ name: 'count_properties' }])
    const db = fixedDb({ data: null, error: { code: '23505', message: SECRET }, count: null })
    const r = await askCommunity('How many?', { db, orgId: 'org-1', canSeeOwnerContact: true })

    const toolMsg = bodies[1]!.messages.find((m) => m.role === 'tool')!
    expect(JSON.parse(toolMsg.content!)).toEqual({ failed: true, code: 'lookup_failed' })
    expect(r.toolCalls).toEqual([{ name: 'count_properties', args: {}, result: { failed: true, code: 'lookup_failed' } }])

    const everything = JSON.stringify(bodies) + JSON.stringify(r) + JSON.stringify(errSpy.mock.calls)
    expect(everything).not.toContain('hoa_properties')
    expect(everything).not.toContain('pat@example.com')
    // The log line carries the db code for triage, nothing else.
    expect(JSON.stringify(errSpy.mock.calls)).toContain('23505')
  })

  it('a W1 throw reaches the model as docs_unavailable, not the provider text', async () => {
    W1.queryGoverningDocs.mockRejectedValue(new Error(`upstream 500: ${SECRET}`))
    const { bodies } = fakeLlm([{ name: 'search_governing_docs', args: { question: 'pets' } }])
    const r = await askCommunity('Pets?', { db: fixedDb({ data: null, error: null }), orgId: 'org-1', canSeeOwnerContact: true })
    const toolMsg = bodies[1]!.messages.find((m) => m.role === 'tool')!
    expect(JSON.parse(toolMsg.content!)).toEqual({ failed: true, code: 'docs_unavailable' })
    expect(r.citations).toEqual([])
    expect(JSON.stringify(bodies) + JSON.stringify(r)).not.toContain('upstream 500')
  })

  it('an unknown tool name is coded, and the model-chosen name is not echoed back', async () => {
    const { bodies } = fakeLlm([{ name: 'drop_table<script>', args: { x: 1 } }])
    const r = await askCommunity('?', { db: fixedDb({ data: null, error: null }), orgId: 'org-1', canSeeOwnerContact: true })
    const toolMsg = bodies[1]!.messages.find((m) => m.role === 'tool')!
    expect(JSON.parse(toolMsg.content!)).toEqual({ failed: true, code: 'unknown_tool' })
    expect(r.toolCalls).toEqual([{ name: 'unknown', args: {}, result: { failed: true, code: 'unknown_tool' } }])
  })

  it('the public tool log drops owner contact and unknown args, the model still gets the contact', async () => {
    const { bodies } = fakeLlm([{ name: 'get_unit_owner', args: { address: '829', injected: 'x'.repeat(5000) } }])
    const db = fixedDb({
      data: [{ id: 'p1', address: '829 Pistace Ct', owner_name: 'Pat', owner_email: 'pat@example.com', owner_phone: '555-0100', tenure: null }],
      error: null,
    })
    const r = await askCommunity('Who owns 829?', { db, orgId: 'org-1', canSeeOwnerContact: true })
    expect(bodies[1]!.messages.find((m) => m.role === 'tool')!.content).toContain('pat@example.com')
    expect(r.toolCalls).toEqual([
      { name: 'get_unit_owner', args: { address: '829' }, result: { matches: [{ address: '829 Pistace Ct', ownerName: 'Pat', tenure: null }] } },
    ])
  })

  it('a provider HTTP failure throws without the provider body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`bad key sk-live-123 ${SECRET}`, { status: 401 })))
    const p = askCommunity('?', { db: fixedDb({ data: null, error: null }), orgId: 'org-1', canSeeOwnerContact: true })
    await expect(p).rejects.toThrow()
    await p.catch((e: Error) => {
      expect(e.message).not.toContain('sk-live-123')
      expect(e.message).not.toContain('hoa_properties')
    })
  })
})
