import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The resident assistant must never answer state law from model memory.
// state_law is its only source; with no statute text on file for the
// resident's state it reports "not loaded" without any model call, and the
// agent replaces whatever the model wrote with the fixed message.

const W30 = vi.hoisted(() => ({ askStateLaw: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W30', async (orig) => ({ ...(await orig<object>()), ...W30 }))
const W1 = vi.hoisted(() => ({ queryGoverningDocs: vi.fn() }))
vi.mock('@homeowner-portal/workflows/W1', () => W1)
vi.mock('@homeowner-portal/ai', async (orig) => ({ ...(await orig<object>()), resolveModel: () => 'test-model' }))

const { stateLawTool } = await import('./state-law-tool')
const { RESIDENT_TOOLS } = await import('./tools')
const { askResident } = await import('./agent')
const { stateNotLoadedMessage } = await import('@homeowner-portal/workflows/W30')

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
  return {
    scope: {
      db: db as never,
      orgId: 'org-1',
      userId: 'u1',
      email: null,
      units: [{ unit_id: 'unit-1', association_id: 'assoc-1' }],
    },
    associationId,
  }
}

beforeEach(() => {
  W30.askStateLaw.mockReset()
})

describe('state_law tool', () => {
  for (const state of ['FL', 'CA', 'TX'] as const) {
    it(`${state} with no statutes on file: "not loaded", with no model call`, async () => {
      const db = fakeDb({ associations: [{ id: 'assoc-1', state, governing_law_state: null }], statutes: 0 })
      const r = await stateLawTool.execute({ question: 'How much notice before a fine hearing?' }, ctx(db))
      expect(r).toEqual({ available: false, reason: 'state_not_loaded', state, message: stateNotLoadedMessage(state) })
      expect(W30.askStateLaw).not.toHaveBeenCalled()
      const count = db.calls.find((c) => c.table === 'state_statutes')!
      expect(count.filters).toEqual([
        ['state', state],
        ['superseded_at', null],
      ])
    })
  }

  it('a loaded state answers through W30, with a contact-free question and only citation labels', async () => {
    W30.askStateLaw.mockResolvedValue({
      answer: 'At least 14 days’ notice (Fla. Stat. § 720.305).',
      confidence: 'HIGH',
      citations: [
        { chunkId: 'c', statuteId: 's', codeCitation: 'Fla. Stat. § 720.305', title: 'Obligations of members', category: 'enforcement' },
      ],
      disclaimer: 'Informational only.',
      stateLoaded: true,
      runId: 'run-1',
    })
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 36 })
    const r = await stateLawTool.execute({ question: 'fine hearing notice, email me at a@b.test' }, ctx(db))
    const [q, state, opts] = W30.askStateLaw.mock.calls[0]!
    expect(q).not.toContain('a@b.test')
    expect(state).toBe('FL')
    expect(opts).toEqual({ organizationId: 'org-1' })
    expect(r).toEqual({
      available: true,
      state: 'FL',
      answer: 'At least 14 days’ notice (Fla. Stat. § 720.305).',
      confidence: 'HIGH',
      citations: [{ codeCitation: 'Fla. Stat. § 720.305', title: 'Obligations of members' }],
      disclaimer: 'Informational only.',
    })
  })

  it('if W30 itself finds the state empty (a race with the count), still "not loaded"', async () => {
    W30.askStateLaw.mockResolvedValue({ answer: 'x', confidence: 'LOW', citations: [], disclaimer: 'd', stateLoaded: false, runId: 'r' })
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'TX', governing_law_state: null }], statutes: 61 })
    const r = await stateLawTool.execute({ question: 'Can the HOA foreclose?' }, ctx(db))
    expect(r).toMatchObject({ available: false, reason: 'state_not_loaded', state: 'TX' })
  })

  it('uses the governing-law state over the address state', async () => {
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'GA', governing_law_state: 'CA' }], statutes: 0 })
    const r = await stateLawTool.execute({ question: 'Open meeting rules?' }, ctx(db))
    expect(r).toMatchObject({ reason: 'state_not_loaded', state: 'CA' })
  })

  it('reads every association of the resident when none is singled out', async () => {
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 0 })
    await stateLawTool.execute({ question: 'Records inspection?' }, ctx(db, null))
    const assoc = db.calls.find((c) => c.table === 'associations')!
    expect(assoc.filters).toEqual([
      ['organization_id', 'org-1'],
      ['id', ['assoc-1']],
    ])
  })

  it('a state the brain does not cover is said so, not answered', async () => {
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'NY', governing_law_state: null }] })
    expect(await stateLawTool.execute({ question: 'Fines?' }, ctx(db))).toEqual({
      available: false,
      reason: 'state_not_covered',
    })
    expect(W30.askStateLaw).not.toHaveBeenCalled()
  })

  it('a failed coverage read is lookup_failed, never "not loaded" and never an answer', async () => {
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], countError: true })
    await expect(stateLawTool.execute({ question: 'Fines?' }, ctx(db))).rejects.toMatchObject({ code: 'lookup_failed' })
    expect(W30.askStateLaw).not.toHaveBeenCalled()
  })

  it('is registered in the resident toolset', () => {
    expect(RESIDENT_TOOLS).toContain(stateLawTool)
  })
})

describe('askResident with a state that is not loaded', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('replaces a from-memory answer with the plain "not loaded" message and offers Ask the board', async () => {
    process.env.AI_API_KEY = 'test-key'
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n++
        const message =
          n === 1
            ? {
                role: 'assistant',
                content: null,
                tool_calls: [
                  { id: 't0', type: 'function', function: { name: 'state_law', arguments: JSON.stringify({ question: 'fine hearing notice' }) } },
                ],
              }
            : // A model ignoring the prompt and answering from memory.
              { role: 'assistant', content: 'Florida law requires 14 days of notice before a fine hearing.' }
        return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }), { status: 200 })
      }),
    )
    const db = fakeDb({ associations: [{ id: 'assoc-1', state: 'FL', governing_law_state: null }], statutes: 0 })
    const r = await askResident([{ role: 'user', content: 'How much notice before a fine hearing in Florida?' }], ctx(db))
    expect(r.answer).toBe(stateNotLoadedMessage('FL'))
    expect(r.answer).not.toContain('14 days')
    expect(r.handoffs.some((h) => h.action === 'ask_board')).toBe(true)
    expect(r.toolsUsed).toContain('state_law')
    expect(W30.askStateLaw).not.toHaveBeenCalled()
  })
})
