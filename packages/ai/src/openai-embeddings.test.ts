import { describe, it, expect, vi, afterEach } from 'vitest'
import { embedTexts } from './embeddings'

const dim = 768
const vec = (fill: number) => new Array(dim).fill(fill)

function mockOpenAI(rows: Array<{ index: number; embedding: number[] }>) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: rows }), { status: 200 }),
  )
}

describe('OpenAI embeddings', () => {
  const saved = process.env.OPENAI_API_KEY
  afterEach(() => {
    process.env.OPENAI_API_KEY = saved
    vi.restoreAllMocks()
  })

  it('sends the OpenAI shape and asks for 768 dimensions', async () => {
    process.env.OPENAI_API_KEY = 'k'
    const f = mockOpenAI([{ index: 0, embedding: vec(0.1) }])
    await embedTexts(['hello'])
    const body = JSON.parse(String((f.mock.calls[0]![1] as RequestInit).body))
    expect(body.input).toEqual(['hello'])
    expect(body.dimensions).toBe(dim)
    expect(body.model).toContain('text-embedding')
    // The schema column is vector(768); a request without `dimensions`
    // would return 1536 and fail the dimension assertion.
  })

  it('reorders an out-of-order response by index', async () => {
    process.env.OPENAI_API_KEY = 'k'
    // OpenAI does not guarantee `data` is index-ordered. The caller pairs
    // vectors to messages positionally, so a wrong order silently attaches
    // each reply's embedding to the wrong message.
    mockOpenAI([
      { index: 1, embedding: vec(0.2) },
      { index: 0, embedding: vec(0.1) },
    ])
    const out = await embedTexts(['first', 'second'])
    expect(out[0]![0]).toBeCloseTo(0.1)
    expect(out[1]![0]).toBeCloseTo(0.2)
  })

  it('refuses a vector of the wrong dimension rather than storing it', async () => {
    process.env.OPENAI_API_KEY = 'k'
    mockOpenAI([{ index: 0, embedding: new Array(1536).fill(0.1) }])
    await expect(embedTexts(['hello'])).rejects.toThrow(/768-dim/)
  })

  it('names OPENAI_API_KEY when it is missing', async () => {
    delete process.env.OPENAI_API_KEY
    await expect(embedTexts(['hello'])).rejects.toThrow(/OPENAI_API_KEY is not set/)
  })
})
