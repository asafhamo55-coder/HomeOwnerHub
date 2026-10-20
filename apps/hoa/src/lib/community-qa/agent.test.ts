import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The agent loop feeds every tool result back to the LLM, so whatever a
// tool error says can end up in the answer (RC-2). These tests drive the
// loop with a fake /chat/completions and inspect what the model is sent
// and what the agent hands back to the route.

const W1 = vi.hoisted(() => ({ queryGoverningDocs: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W1', () => W1)
// Spread the real module: the state_law tool's W30 import defines its workflow at load.
vi.mock('@homeowner-portal/ai', async (orig) => ({ ...(await orig<object>()), resolveModel: () => 'test-model' }))

const { askCommunity } = await import('./agent')
const { findContactPII } = await import('@homeowner-portal/ai/pii')

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

  it('the model gets contact tokens, never raw email/phone; the vault resolves them (BL-062)', async () => {
    const { bodies } = fakeLlm(
      [{ name: 'get_unit_owner', args: { address: '829', injected: 'x'.repeat(5000) } }],
      'Pat owns it: [OWNER_EMAIL_1].',
    )
    const db = fixedDb({
      data: [{ id: 'p1', address: '829 Pistace Ct', owner_name: 'Pat', owner_email: 'pat@example.com', owner_phone: '(305) 555-0142', tenure: null }],
      error: null,
    })
    const r = await askCommunity('Who owns 829?', { db, orgId: 'org-1', canSeeOwnerContact: true })
    const sent = JSON.stringify(bodies)
    expect(findContactPII(sent)).toEqual([])
    expect(sent).toContain('[OWNER_EMAIL_1]')
    // The agent hands back the model's text; filling is the route's job.
    expect(r.answer).toBe('Pat owns it: [OWNER_EMAIL_1].')
    expect(r.contactVault.resolve('[OWNER_EMAIL_1]')).toBe('pat@example.com')
    expect(r.contactVault.resolve('[OWNER_PHONE_1]')).toBe('(305) 555-0142')
    expect(r.toolCalls).toEqual([
      { name: 'get_unit_owner', args: { address: '829' }, result: { matches: [{ address: '829 Pistace Ct', ownerName: 'Pat', tenure: null }] } },
    ])
  })

  it('no tool sends fixture contact PII to the model (BL-062 guard)', async () => {
    W1.queryGoverningDocs.mockResolvedValue({ answer: 'Two pets.', confidence: 'HIGH', citations: [], runId: 'run-1' })
    const { bodies } = fakeLlm([
      { name: 'count_units_by_tenure' },
      { name: 'list_overdue_dues' },
      { name: 'get_unit_owner', args: { address: '829' } },
      { name: 'count_open_violations' },
      { name: 'list_recent_meetings' },
      { name: 'count_properties' },
      { name: 'search_governing_docs', args: { question: 'pets' } },
    ])
    // Every row carries PII in every column a tool could select.
    const pii = {
      id: 'p1', address: '829 Pistace Ct', owner_name: 'Pat', owner_email: 'pat@example.com',
      owner_phone: '305-555-0142', tenure: 'leased', status: 'open', amount: 100, due_date: '2026-01-01',
      meeting_date: '2026-01-02', meeting_type: 'board', payments: [], unit: { address_line1: '829 Pistace Ct', lot_number: '12' },
      email: 'pat@example.com', phone: '305-555-0142', timezone: 'America/New_York',
    }
    // Like fixedDb, but a paged read (readAll) sees the row on page one only.
    const db = {
      from: () => {
        let page = 0
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'neq', 'is', 'lt', 'ilike', 'order', 'limit']) q[m] = () => q
        q.range = (from: number) => ((page = from), q)
        q.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: page === 0 ? [pii] : [], error: null, count: 1 }).then(resolve)
        return q
      },
    } as never
    const r = await askCommunity('Everything?', { db, orgId: 'org-1', canSeeOwnerContact: true })
    // Not vacuous: every tool really ran and returned data to the model.
    expect(r.toolCalls.filter((c) => (c.result as { failed?: boolean })?.failed).map((c) => c.name)).toEqual([])
    expect(r.toolCalls).toHaveLength(7)
    expect(JSON.stringify(bodies)).toContain('829 Pistace Ct')
    expect(findContactPII(JSON.stringify(bodies))).toEqual([])
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
