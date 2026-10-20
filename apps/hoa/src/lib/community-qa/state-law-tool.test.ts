import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The board Copilot must never answer state law from model memory. state_law
// (W30, grounded in state_statutes) is its only source; with no statute text
// on file it reports "not loaded" without any model call, and askCommunity
// replaces whatever the model wrote with the fixed message. A failed lookup
// becomes a fixed "couldn't look it up" answer, never a guess.

const W30 = vi.hoisted(() => ({ askStateLaw: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W30', async (orig) => ({ ...(await orig<object>()), ...W30 }))
const W1 = vi.hoisted(() => ({ queryGoverningDocs: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W1', () => W1)
vi.mock('@homeowner-portal/ai', async (orig) => ({ ...(await orig<object>()), resolveModel: () => 'test-model' }))

const { TOOLS, TOOL_BY_NAME, COPILOT_STATE_LAW_CAP } = await import('./tools')
const { askCommunity, STATE_LAW_UNAVAILABLE_MESSAGE } = await import('./agent')
const { ContactVault } = await import('./contact-placeholders')
const { stateNotLoadedMessage } = await import('@homeowner-portal/workflows/W30')

const stateLaw = TOOL_BY_NAME.state_law!

interface Assoc {
  id: string
  state: string | null
  governing_law_state: string | null
}

/** Answers `associations` with the given rows and `state_statutes` with a count. */
function fakeDb(opts: { associations: Assoc[]; statutes?: number; countError?: boolean }) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  return {
    calls,
    from(table: string) {
      const entry = { table, filters: [] as Array<[string, unknown]> }
      calls.push(entry)
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'is']) {
        q[m] = (...a: unknown[]) => {
          if (m !== 'select') entry.filters.push([String(a[0]), a[1]])
          return q
        }
      }
      const result =
        table === 'associations'
          ? { data: opts.associations, error: null }
          : opts.countError
            ? { data: null, count: null, error: { code: '500' } }
            : { data: null, count: opts.statutes ?? 0, error: null }
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return q
    },
  }
}

function ctx(db: unknown, associationId: string | null = 'assoc-1') {
  return { db: db as never, orgId: 'org-1', associationId, canSeeOwnerContact: true, contactVault: new ContactVault() }
}

const FL_ANSWER = {
  answer: 'At least 14 days’ notice and a hearing before a committee (Fla. Stat. § 720.305(2)).',
  confidence: 'HIGH',
  citations: [
    { chunkId: 'c1', statuteId: 's1', codeCitation: 'Fla. Stat. § 720.305', title: 'Obligations of members; remedies', category: 'fines' },
  ],
  disclaimer: 'Informational only, not legal advice.',
  stateLoaded: true,
  runId: 'run-1',
}

type Call = { name: string; args?: Record<string, unknown> }

/** First reply asks for `calls`; the second is the model's final text. */
function fakeLlm(calls: Call[], answer: string) {
  const bodies: Array<{ messages: Array<{ role: string; content?: string | null }> }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      const message =
        bodies.length === 1
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
    }),
  )
  return bodies
}

const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  process.env.AI_API_KEY = 'test-key'
  W30.askStateLaw.mockReset()
  errSpy.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('Copilot state_law tool', () => {
  it('is registered in the Copilot toolset', () => {
    expect(TOOLS).toContain(stateLaw)
    expect(stateLaw.def.description).toMatch(/never answer state law from memory/i)
  })

  it('a loaded state answers through W30 with statute citations and a contact-free question', async () => {
    W30.askStateLaw.mockResolvedValue(FL_ANSWER)
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 36 })
    const r = await stateLaw.execute({ question: 'fine hearing notice, email me at a@b.test' }, ctx(db))
    const [q, state, opts] = W30.askStateLaw.mock.calls[0]!
    expect(q).not.toContain('a@b.test')
    expect(state).toBe('FL')
    expect(opts).toEqual({ organizationId: 'org-1' })
    expect(r).toEqual({
      available: true,
      state: 'FL',
      answer: FL_ANSWER.answer,
      confidence: 'HIGH',
      citations: [{ codeCitation: 'Fla. Stat. § 720.305', title: 'Obligations of members; remedies' }],
      disclaimer: FL_ANSWER.disclaimer,
    })
    const assoc = db.calls.find((c) => c.table === 'associations')!
    expect(assoc.filters).toEqual([
      ['organization_id', 'org-1'],
      ['id', 'assoc-1'],
    ])
  })

  for (const state of ['GA', 'FL', 'CA', 'TX'] as const) {
    it(`${state} with no statutes on file: "not loaded", with no model call`, async () => {
      const db = fakeDb({ associations: [{ id: 'assoc-1', state, governing_law_state: null }], statutes: 0 })
      const r = await stateLaw.execute({ question: 'How much notice before a fine hearing?' }, ctx(db))
      expect(r).toEqual({ available: false, reason: 'state_not_loaded', state, message: stateNotLoadedMessage(state) })
      expect(W30.askStateLaw).not.toHaveBeenCalled()
    })
  }

  it('uses the governing-law state over the address state', async () => {
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'GA', governing_law_state: 'CA' }], statutes: 0 })
    expect(await stateLaw.execute({ question: 'Open meeting rules?' }, ctx(db))).toMatchObject({
      reason: 'state_not_loaded',
      state: 'CA',
    })
  })

  it('associations in different states with none selected: ambiguous, not answered', async () => {
    const db = fakeDb({
      associations: [
        { id: 'a', state: 'FL', governing_law_state: null },
        { id: 'b', state: 'GA', governing_law_state: null },
      ],
      statutes: 50,
    })
    expect(await stateLaw.execute({ question: 'Fines?' }, ctx(db, null))).toEqual({ available: false, reason: 'state_ambiguous' })
    expect(W30.askStateLaw).not.toHaveBeenCalled()
  })

  it('a failed coverage read is lookup_failed, never "not loaded" and never an answer', async () => {
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], countError: true })
    await expect(stateLaw.execute({ question: 'Fines?' }, ctx(db))).rejects.toMatchObject({ code: 'lookup_failed' })
    expect(W30.askStateLaw).not.toHaveBeenCalled()
  })

  it('a W30 throw is lookup_failed', async () => {
    W30.askStateLaw.mockRejectedValue(new Error('provider 500: statute body text'))
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 36 })
    await expect(stateLaw.execute({ question: 'Fines?' }, ctx(db))).rejects.toMatchObject({ code: 'lookup_failed' })
  })
})

describe('askCommunity with state law', () => {
  it('tells the model never to answer state law from general knowledge', async () => {
    W30.askStateLaw.mockResolvedValue(FL_ANSWER)
    const bodies = fakeLlm([{ name: 'state_law', args: { question: 'fine hearing notice' } }], 'ok')
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 36 })
    await askCommunity('Notice before a fine hearing?', { db: db as never, orgId: 'org-1', associationId: 'assoc-1', canSeeOwnerContact: true })
    const system = bodies[0]!.messages.find((m) => m.role === 'system')!.content!
    expect(system).toMatch(/Never answer state law from general knowledge/)
  })

  it('a loaded state: the answer stands and cites the statutes', async () => {
    W30.askStateLaw.mockResolvedValue(FL_ANSWER)
    const bodies = fakeLlm(
      [{ name: 'state_law', args: { question: 'fine hearing notice' } }],
      'Florida requires at least 14 days’ notice and a hearing before a fine (Fla. Stat. § 720.305).',
    )
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 36 })
    const r = await askCommunity('Notice before a fine hearing?', { db: db as never, orgId: 'org-1', associationId: 'assoc-1', canSeeOwnerContact: true })
    expect(r.answer).toContain('Fla. Stat. § 720.305')
    expect(r.statuteCitations).toEqual([{ state: 'FL', codeCitation: 'Fla. Stat. § 720.305', title: 'Obligations of members; remedies' }])
    // The model was handed the statute citation to ground its answer.
    const toolMsg = bodies[1]!.messages.find((m) => m.role === 'tool')!
    expect(toolMsg.content).toContain('Fla. Stat. § 720.305')
  })

  it('an unloaded state: the fixed message replaces a from-memory answer', async () => {
    fakeLlm(
      [{ name: 'state_law', args: { question: 'fine hearing notice' } }],
      // A model ignoring the prompt and answering from memory.
      'Florida law requires 14 days of notice before a fine hearing.',
    )
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 0 })
    const r = await askCommunity('Notice before a fine hearing?', { db: db as never, orgId: 'org-1', associationId: 'assoc-1', canSeeOwnerContact: true })
    expect(r.answer).toBe(stateNotLoadedMessage('FL'))
    expect(r.answer).toMatch(/^Florida state law isn't loaded yet/)
    expect(r.answer).not.toContain('14 days')
    expect(r.statuteCitations).toBeUndefined()
    expect(W30.askStateLaw).not.toHaveBeenCalled()
  })

  it('a failed lookup: a fixed error answer, never a guess, and no provider text', async () => {
    W30.askStateLaw.mockRejectedValue(new Error('provider 500: secret statute body'))
    const bodies = fakeLlm(
      [{ name: 'state_law', args: { question: 'fine hearing notice' } }],
      'Under Florida law you need 14 days of notice.',
    )
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 36 })
    const r = await askCommunity('Notice before a fine hearing?', { db: db as never, orgId: 'org-1', associationId: 'assoc-1', canSeeOwnerContact: true })
    expect(r.answer).toBe(STATE_LAW_UNAVAILABLE_MESSAGE)
    expect(r.answer).not.toContain('14 days')
    const toolMsg = bodies[1]!.messages.find((m) => m.role === 'tool')!
    expect(JSON.parse(toolMsg.content!)).toEqual({ failed: true, code: 'lookup_failed' })
    expect(JSON.stringify(bodies) + JSON.stringify(r)).not.toContain('secret statute body')
  })

  it('state_law calls count against the per-question budget', async () => {
    W30.askStateLaw.mockResolvedValue(FL_ANSWER)
    const n = COPILOT_STATE_LAW_CAP + 2
    const bodies = fakeLlm(
      Array.from({ length: n }, (_, i) => ({ name: 'state_law', args: { question: `question number ${i}` } })),
      'Done.',
    )
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 36 })
    const r = await askCommunity('Many law questions', { db: db as never, orgId: 'org-1', associationId: 'assoc-1', canSeeOwnerContact: true })
    expect(W30.askStateLaw).toHaveBeenCalledTimes(COPILOT_STATE_LAW_CAP)
    expect(r.toolCalls.filter((c) => c.name === 'state_law')).toHaveLength(COPILOT_STATE_LAW_CAP)
    const refused = bodies[1]!.messages
      .filter((m) => m.role === 'tool')
      .filter((m) => JSON.parse(m.content!).code === 'budget')
    expect(refused).toHaveLength(n - COPILOT_STATE_LAW_CAP)
  })
})
