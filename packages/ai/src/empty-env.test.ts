import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { embedTexts } from './embeddings'

describe('empty env vars fall through to the default endpoint', () => {
  const saved = { url: process.env.EMBEDDING_BASE_URL, tok: process.env.HUGGINGFACE_API_TOKEN }
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => {
    process.env.EMBEDDING_BASE_URL = saved.url
    process.env.HUGGINGFACE_API_TOKEN = saved.tok
  })

  it('ignores an EMPTY EMBEDDING_BASE_URL instead of fetching ""', async () => {
    process.env.EMBEDDING_BASE_URL = ''
    process.env.HUGGINGFACE_API_TOKEN = 'tok'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([new Array(768).fill(0.1)]), { status: 200 }),
    )
    await embedTexts(['x'])
    const calledWith = String(fetchMock.mock.calls[0]![0])
    expect(calledWith).not.toBe('')
    expect(calledWith).toContain('https://')
  })

  it('ignores a whitespace-only EMBEDDING_BASE_URL', async () => {
    process.env.EMBEDDING_BASE_URL = '   '
    process.env.HUGGINGFACE_API_TOKEN = 'tok'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([new Array(768).fill(0.1)]), { status: 200 }),
    )
    await embedTexts(['x'])
    expect(String(fetchMock.mock.calls[0]![0]).trim()).toContain('https://')
  })

  it('treats an EMPTY token as missing rather than sending "Bearer "', async () => {
    process.env.HUGGINGFACE_API_TOKEN = ''
    await expect(embedTexts(['x'])).rejects.toThrow(/HUGGINGFACE_API_TOKEN is not set/)
  })
})
