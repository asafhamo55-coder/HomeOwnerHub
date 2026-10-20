import { describe, expect, it, vi } from 'vitest'

// The model client must never be reached when nothing was retrieved.
const create = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } }
  },
}))

const { runStateLawBrain, StateLawBrainOutputSchema } = await import('./index')
const { stateNotLoadedMessage } = await import('./coverage')

function api() {
  return { setConfidence: vi.fn(), addCitations: vi.fn(), setTokens: vi.fn(), setModel: vi.fn() }
}

describe('W30 when a state has no statute text yet', () => {
  for (const state of ['FL', 'CA', 'TX'] as const) {
    it(`${state}: says plainly that the state isn't loaded, and never calls the model`, async () => {
      const countLive = vi.fn(async () => 0)
      const out = await runStateLawBrain(
        { state, question: 'How much notice is required before a fine hearing?' },
        api(),
        { retrieve: async () => [], countLive },
      )
      expect(countLive).toHaveBeenCalledWith(state)
      expect(out.stateLoaded).toBe(false)
      expect(out.answer).toBe(stateNotLoadedMessage(state))
      expect(out.citations).toEqual([])
      expect(out.confidence).toBe('LOW')
      expect(create).not.toHaveBeenCalled()
      expect(StateLawBrainOutputSchema.parse(out)).toEqual(out)
    })
  }

  it('names the state and says the answer would not come from memory', () => {
    expect(stateNotLoadedMessage('FL')).toMatch(/^Florida state law isn't loaded yet/)
    expect(stateNotLoadedMessage('CA')).toContain('never from general knowledge')
    expect(stateNotLoadedMessage('TX')).toContain('Texas')
  })

  it('a loaded state whose statutes miss the question still gets "not addressed", not "not loaded"', async () => {
    const out = await runStateLawBrain({ state: 'GA', question: 'Can the board ban pickup trucks?' }, api(), {
      retrieve: async () => [],
      countLive: async () => 27,
    })
    expect(out.stateLoaded).toBe(true)
    expect(out.answer).toMatch(/don't address this directly/)
    expect(create).not.toHaveBeenCalled()
  })

  it('a failed coverage read fails the request rather than claiming either answer', async () => {
    await expect(
      runStateLawBrain({ state: 'FL', question: 'Records inspection deadline?' }, api(), {
        retrieve: async () => [],
        countLive: async () => {
          throw new Error('state_statutes_count_failed: 500')
        },
      }),
    ).rejects.toThrow(/count_failed/)
  })

  it('does not spend a count query when retrieval found text', async () => {
    create.mockResolvedValueOnce({
      model: 'test-model',
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      choices: [{ message: { content: JSON.stringify({ answer: 'Per § 720.303 …', confidence: 'HIGH', cited_chunk_ids: ['c1'] }) } }],
    })
    const countLive = vi.fn(async () => 36)
    const out = await runStateLawBrain({ state: 'FL', question: 'Records inspection deadline?' }, api(), {
      retrieve: async () => [
        {
          id: 'c1',
          statuteId: '00000000-0000-4000-8000-000000000001',
          codeCitation: 'Fla. Stat. § 720.303',
          title: 'Association powers and duties',
          category: 'records',
          effectiveDate: null,
          content: 'Fla. Stat. § 720.303 — …',
          score: 1,
        },
      ],
      countLive,
    })
    expect(countLive).not.toHaveBeenCalled()
    expect(out.stateLoaded).toBe(true)
    expect(out.citations.map((c) => c.codeCitation)).toEqual(['Fla. Stat. § 720.303'])
  })
})
