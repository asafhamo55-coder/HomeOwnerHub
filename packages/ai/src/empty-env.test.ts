import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { embedTexts } from './embeddings'
import { resolveVisionBaseUrl } from './agents/vision'

describe('empty env vars fall through to the default endpoint', () => {
  const saved = { url: process.env.EMBEDDING_BASE_URL, tok: process.env.OPENAI_API_KEY }
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => {
    process.env.EMBEDDING_BASE_URL = saved.url
    process.env.OPENAI_API_KEY = saved.tok
  })

  it('ignores an EMPTY EMBEDDING_BASE_URL instead of fetching ""', async () => {
    process.env.EMBEDDING_BASE_URL = ''
    process.env.OPENAI_API_KEY = 'tok'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ index: 0, embedding: new Array(768).fill(0.1) }] }), { status: 200 }),
    )
    await embedTexts(['x'])
    const calledWith = String(fetchMock.mock.calls[0]![0])
    expect(calledWith).not.toBe('')
    expect(calledWith).toContain('https://')
  })

  it('ignores a whitespace-only EMBEDDING_BASE_URL', async () => {
    process.env.EMBEDDING_BASE_URL = '   '
    process.env.OPENAI_API_KEY = 'tok'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ index: 0, embedding: new Array(768).fill(0.1) }] }), { status: 200 }),
    )
    await embedTexts(['x'])
    expect(String(fetchMock.mock.calls[0]![0]).trim()).toContain('https://')
  })

  it('treats an EMPTY token as missing rather than sending "Bearer "', async () => {
    process.env.OPENAI_API_KEY = ''
    await expect(embedTexts(['x'])).rejects.toThrow(/OPENAI_API_KEY is not set/)
  })
})

/**
 * AI_BASE_URL_VISION was never set — ADR-002 planned a separate self-hosted
 * vision box that was never built — so an unguarded read sent every image to
 * api.openai.com with a Groq key.
 */
describe('vision base URL falls back to the shared endpoint', () => {
  const saved = {
    vision: process.env.AI_BASE_URL_VISION,
    shared: process.env.AI_BASE_URL,
  }
  afterEach(() => {
    process.env.AI_BASE_URL_VISION = saved.vision
    process.env.AI_BASE_URL = saved.shared
  })

  it('prefers a real AI_BASE_URL_VISION when one is set', () => {
    process.env.AI_BASE_URL_VISION = 'https://vision.example/v1'
    process.env.AI_BASE_URL = 'https://shared.example/v1'

    expect(resolveVisionBaseUrl()).toBe('https://vision.example/v1')
  })

  it('falls back to AI_BASE_URL when the vision-specific one is unset', () => {
    delete process.env.AI_BASE_URL_VISION
    process.env.AI_BASE_URL = 'https://shared.example/v1'

    expect(resolveVisionBaseUrl()).toBe('https://shared.example/v1')
  })

  it('treats an EMPTY AI_BASE_URL_VISION as absent, not as a base URL of ""', () => {
    process.env.AI_BASE_URL_VISION = ''
    process.env.AI_BASE_URL = 'https://shared.example/v1'

    expect(resolveVisionBaseUrl()).toBe('https://shared.example/v1')
  })

  it('treats a whitespace-only AI_BASE_URL_VISION as absent', () => {
    process.env.AI_BASE_URL_VISION = '   '
    process.env.AI_BASE_URL = 'https://shared.example/v1'

    expect(resolveVisionBaseUrl()).toBe('https://shared.example/v1')
  })

  // undefined lets the SDK apply its own default; '' makes it fetch "".
  it('returns undefined, never an empty string, when neither is usable', () => {
    process.env.AI_BASE_URL_VISION = ''
    process.env.AI_BASE_URL = '  '

    expect(resolveVisionBaseUrl()).toBeUndefined()
  })
})
