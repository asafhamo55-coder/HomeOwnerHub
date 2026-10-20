import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// SEC-001: the shared loop's tool budget, driven by a fake
// /chat/completions (no real model).

const W1 = vi.hoisted(() => ({ queryGoverningDocs: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W1', () => W1)
vi.mock('@homeowner-portal/ai', async (orig) => ({ ...(await orig<object>()), resolveModel: () => 'test-model' }))

const { runToolLoop, DEFAULT_TOOL_BUDGET } = await import('./loop')
type LoopTool<C> = import('./loop').LoopTool<C>

type Body = {
  tool_choice: string
  messages: Array<{ role: string; content?: string | null; tool_call_id?: string; tool_calls?: Array<{ id: string }> }>
}

/** Each step's reply asks for `perStep[i]` (a list of tool names); after the list, a final answer. */
function fakeLlm(steps: string[][], answer = 'Done.') {
  const bodies: Body[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Body
      bodies.push(body)
      const calls = steps[bodies.length - 1]
      const message =
        calls && body.tool_choice !== 'none'
          ? {
              role: 'assistant',
              content: null,
              tool_calls: calls.map((name, i) => ({
                id: `s${bodies.length}c${i}`,
                type: 'function',
                function: { name, arguments: '{}' },
              })),
            }
          : { role: 'assistant', content: answer }
      return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }), { status: 200 })
    }),
  )
  return bodies
}

function tools(names: string[]) {
  const runs: Record<string, number> = {}
  const list: LoopTool<null>[] = names.map((name) => ({
    def: { name, description: name, parameters: { type: 'object', properties: {} } },
    execute: async () => {
      runs[name] = (runs[name] ?? 0) + 1
      return { ok: name }
    },
  }))
  return { list, runs }
}

function run(list: LoopTool<null>[], budget?: Parameters<typeof runToolLoop>[0]['budget']) {
  return runToolLoop<null>({
    systemPrompt: 's',
    turns: [{ role: 'user', content: 'q' }],
    tools: list,
    ctx: null,
    logTag: 'test.loop',
    logIds: {},
    ...(budget ? { budget } : {}),
  })
}

/** Every tool_call_id the model sent got exactly one tool reply (the provider rejects the next request otherwise). */
function everyCallAnswered(bodies: Body[]) {
  const last = bodies[bodies.length - 1]!.messages
  const asked = last.flatMap((m) => (m.tool_calls ?? []).map((t) => t.id))
  const answered = last.filter((m) => m.role === 'tool').map((m) => m.tool_call_id)
  expect(answered.sort()).toEqual(asked.sort())
}

function budgetReplies(bodies: Body[]): number {
  return bodies[bodies.length - 1]!.messages.filter(
    (m) => m.role === 'tool' && m.content === JSON.stringify({ failed: true, code: 'budget' }),
  ).length
}

beforeEach(() => {
  process.env.AI_API_KEY = 'test-key'
})
afterEach(() => vi.unstubAllGlobals())

describe('runToolLoop tool budget (SEC-001)', () => {
  it('runs only the first perStep calls of a step; the rest get budget', async () => {
    const t = tools(['a'])
    const bodies = fakeLlm([['a', 'a', 'a', 'a', 'a', 'a']])
    const r = await run(t.list, { perStep: 4, perRun: 6 })
    expect(t.runs.a).toBe(4)
    expect(r.log).toHaveLength(4)
    expect(r.refused).toBe(2)
    expect(budgetReplies(bodies)).toBe(2)
    everyCallAnswered(bodies)
    expect(r.answer).toBe('Done.')
  })

  it('caps the whole run, then asks for the answer with tool_choice none', async () => {
    const t = tools(['a'])
    const bodies = fakeLlm([['a', 'a'], ['a', 'a'], ['a', 'a'], ['a', 'a'], ['a', 'a']])
    const r = await run(t.list, { perStep: 4, perRun: 6 })
    expect(t.runs.a).toBe(6)
    expect(r.refused).toBe(0)
    // Steps 1-3 ran 6; step 4 is sent with tools disabled and answers.
    expect(bodies.map((b) => b.tool_choice)).toEqual(['auto', 'auto', 'auto', 'none'])
    expect(r.answer).toBe('Done.')
  })

  it('a step that crosses the run cap is cut at the cap', async () => {
    const t = tools(['a'])
    const bodies = fakeLlm([['a', 'a', 'a', 'a'], ['a', 'a', 'a', 'a']])
    const r = await run(t.list, { perStep: 4, perRun: 6 })
    expect(t.runs.a).toBe(6)
    expect(r.refused).toBe(2)
    everyCallAnswered(bodies)
  })

  it('caps a single tool per run (docs searches for residents)', async () => {
    const t = tools(['search_governing_docs', 'b'])
    const bodies = fakeLlm([['search_governing_docs', 'search_governing_docs', 'search_governing_docs', 'b']])
    const r = await run(t.list, { perStep: 4, perRun: 6, perTool: { search_governing_docs: 2 } })
    expect(t.runs.search_governing_docs).toBe(2)
    expect(t.runs.b).toBe(1)
    expect(r.refused).toBe(1)
    everyCallAnswered(bodies)
  })

  it('the step limit still bounds a model that never stops asking', async () => {
    const t = tools(['a'])
    fakeLlm(Array.from({ length: 20 }, () => ['a']))
    const r = await run(t.list, { perStep: 4, perRun: 100 })
    expect(r.answer).toBeNull()
    expect(t.runs.a).toBe(8)
  })

  it('the board default: 8 per step, 16 per run', async () => {
    expect(DEFAULT_TOOL_BUDGET).toEqual({ perStep: 8, perRun: 16 })
    const t = tools(['a'])
    fakeLlm([Array(10).fill('a'), Array(10).fill('a'), Array(10).fill('a')])
    const r = await run(t.list)
    expect(t.runs.a).toBe(16)
    // 2 refused in each of the two tool steps; the third step has tools off.
    expect(r.refused).toBe(4)
    expect(r.answer).toBe('Done.')
  })
})
