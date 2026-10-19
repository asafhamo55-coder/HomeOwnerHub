import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The resident agent driven by a fake /chat/completions (no real model).

const W1 = vi.hoisted(() => ({ queryGoverningDocs: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W1', () => W1)
vi.mock('@homeowner-portal/ai', async (orig) => ({ ...(await orig<object>()), resolveModel: () => 'test-model' }))

const { askResident, RESIDENT_SYSTEM_PROMPT } = await import('./agent')

type Call = { name: string; args?: Record<string, unknown> }

function fakeLlm(calls: Call[], answer = 'Done.') {
  const bodies: Array<{ messages: Array<{ role: string; content?: string | null }>; tools: Array<{ function: { name: string } }> }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      const message =
        bodies.length === 1 && calls.length > 0
          ? {
              role: 'assistant',
              content: null,
              tool_calls: calls.map((c, i) => ({ id: `tc${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) } })),
            }
          : { role: 'assistant', content: answer }
      return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }), { status: 200 })
    }),
  )
  return bodies
}

const db = { from: vi.fn(), rpc: vi.fn() }
const ctx = {
  scope: { db: db as never, orgId: 'org-1', userId: 'u1', email: null, units: [] },
  associationId: null,
}

const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
beforeEach(() => {
  process.env.AI_API_KEY = 'test-key'
  W1.queryGoverningDocs.mockReset()
  db.from.mockReset()
  errSpy.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('askResident', () => {
  it('sends the resident prompt, the history, and only resident tools', async () => {
    const bodies = fakeLlm([], 'Hi!')
    const r = await askResident(
      [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'Hi, how can I help?' },
        { role: 'user', content: 'What do I owe?' },
      ],
      ctx,
    )
    expect(r.answer).toBe('Hi!')
    expect(bodies[0]!.messages[0]).toEqual({ role: 'system', content: RESIDENT_SYSTEM_PROMPT })
    expect(bodies[0]!.messages.slice(1).map((m) => m.content)).toEqual(['hello', 'Hi, how can I help?', 'What do I owe?'])
    const names = bodies[0]!.tools.map((t) => t.function.name)
    expect(names).not.toContain('get_unit_owner')
    expect(names).not.toContain('list_overdue_dues')
    expect(names).toContain('my_account')
  })

  it('a board tool named by the model is unknown, and runs nothing', async () => {
    const bodies = fakeLlm([{ name: 'get_unit_owner', args: { address: '1 Elm' } }])
    const r = await askResident([{ role: 'user', content: 'Who owns 1 Elm?' }], ctx)
    const toolMsg = bodies[1]!.messages.find((m) => m.role === 'tool')!
    expect(JSON.parse(toolMsg.content!)).toEqual({ failed: true, code: 'unknown_tool' })
    expect(db.from).not.toHaveBeenCalled()
    expect(r.toolsUsed).toEqual(['unknown'])
  })

  it('cited rules answer: citations and confidence, no forced hand-off', async () => {
    W1.queryGoverningDocs.mockResolvedValue({
      answer: 'Front doors may be painted from the approved palette.',
      confidence: 'HIGH',
      citations: [{ chunkId: 'c1', documentId: 'd1', docType: 'rules', section: '4.2' }],
      runId: 'run-1',
    })
    fakeLlm([{ name: 'search_governing_docs', args: { question: 'front door paint' } }, { name: 'suggest_arc_application', args: { subject: 'Paint front door', description: 'Paint my front door blue.' } }], 'Yes, from the palette (§4.2).')
    const r = await askResident([{ role: 'user', content: 'Can I paint my front door?' }], ctx)
    expect(r.citations).toEqual([{ chunkId: 'c1', documentId: 'd1', docType: 'rules', section: '4.2' }])
    expect(r.confidence).toBe('HIGH')
    expect(r.docsUnanswered).toBe(false)
    expect(r.handoffs).toEqual([{ action: 'start_arc', subject: 'Paint front door', description: 'Paint my front door blue.' }])
  })

  it('a rules question the docs don’t answer always offers Ask the board', async () => {
    W1.queryGoverningDocs.mockResolvedValue({ answer: 'Not found.', confidence: 'LOW', citations: [], runId: 'run-2' })
    fakeLlm([{ name: 'search_governing_docs', args: { question: 'hot tub' } }], "I don't see that in your community's documents.")
    const r = await askResident([{ role: 'user', content: 'Can I put a hot tub in my yard?' }], ctx)
    expect(r.docsUnanswered).toBe(true)
    expect(r.handoffs).toEqual([
      { action: 'ask_board', subject: 'Can I put a hot tub in my yard?', description: 'Can I put a hot tub in my yard?' },
    ])
  })

  it('hand-offs dedupe to one per action, the latest wins', async () => {
    fakeLlm([
      { name: 'suggest_ask_board', args: { subject: 'First', description: 'a' } },
      { name: 'suggest_ask_board', args: { subject: 'Second', description: 'b' } },
    ])
    const r = await askResident([{ role: 'user', content: 'help' }], ctx)
    expect(r.handoffs).toEqual([{ action: 'ask_board', subject: 'Second', description: 'b' }])
  })

  it('a provider failure throws with the status only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('key sk-secret echoed', { status: 500 })))
    await expect(askResident([{ role: 'user', content: 'hi' }], ctx)).rejects.toThrow('LLM call failed: HTTP 500')
  })
})
