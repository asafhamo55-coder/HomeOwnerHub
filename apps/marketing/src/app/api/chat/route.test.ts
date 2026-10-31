import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const completeChat = vi.fn()
vi.mock('../../../lib/chat/model', () => ({
  chatKey: () => process.env.AI_API_KEY?.trim() || undefined,
  completeChat: (...a: unknown[]) => completeChat(...a),
}))

import { GET, POST } from './route'
import { resetLimitsForTests, MAX_MESSAGE_CHARS } from '../../../lib/chat/limits'

function req(body: unknown, ip = '1.2.3.4') {
  return new Request('http://x/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
const ask = (q: string) => ({ messages: [{ role: 'user', content: q }] })

beforeEach(() => {
  resetLimitsForTests()
  completeChat.mockReset()
  vi.stubEnv('AI_API_KEY', 'test-key')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/chat', () => {
  it('returns 503 when the key is missing, and never calls the model', async () => {
    vi.stubEnv('AI_API_KEY', '')
    const res = await POST(req(ask('How much does it cost?')))
    expect(res.status).toBe(503)
    expect(completeChat).not.toHaveBeenCalled()
    expect(await (await GET()).json()).toEqual({ available: false })
  })

  it('answers from the mocked model and cites the sources it named', async () => {
    completeChat.mockResolvedValue('Plans start at the price on the pricing page.\nSOURCES: 1')
    const res = await POST(req(ask('How much does it cost?')))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.answer).toContain('pricing page')
    expect(j.sources[0].url).toBe('/pricing')
    // The model saw the sources and the rules.
    const sent = completeChat.mock.calls[0]![0] as { role: string; content: string }[]
    expect(sent[0]!.content).toContain('Answer only from the numbered SOURCES')
  })

  it('offers a person when the model says it is not in the sources', async () => {
    completeChat.mockResolvedValue('NOT_IN_SOURCES')
    const j = await (await POST(req(ask('How much does it cost?')))).json()
    expect(j).toEqual({ answer: '', sources: [], offerPerson: true })
  })

  it('offers a person without calling the model when nothing matches', async () => {
    const j = await (await POST(req(ask('zxqv blorptastic')))).json()
    expect(j.offerPerson).toBe(true)
    expect(completeChat).not.toHaveBeenCalled()
  })

  it('rejects an over-length question', async () => {
    const res = await POST(req(ask('a'.repeat(MAX_MESSAGE_CHARS + 1))))
    expect(res.status).toBe(413)
    expect(completeChat).not.toHaveBeenCalled()
  })

  it('rejects an oversized body and bad json', async () => {
    expect((await POST(req('x'.repeat(13_000)))).status).toBe(413)
    expect((await POST(req('{nope'))).status).toBe(400)
    expect((await POST(req({ messages: [] }))).status).toBe(400)
  })

  it('rejects more than 10 user turns', async () => {
    const eleven = Array.from({ length: 11 }, () => ({ role: 'user', content: 'hi' }))
    expect((await POST(req({ messages: eleven }))).status).toBe(429)
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'hi' }))
    expect((await POST(req({ messages: tooMany }))).status).toBe(400)
    expect(completeChat).not.toHaveBeenCalled()
  })

  it('rate limits per IP', async () => {
    completeChat.mockResolvedValue('ok\nSOURCES: 1')
    let last = 200
    for (let i = 0; i < 13; i++) last = (await POST(req(ask('How much does it cost?'), '9.9.9.9'))).status
    expect(last).toBe(429)
    expect((await POST(req(ask('How much does it cost?'), '8.8.8.8'))).status).toBe(200)
  })

  it('stops at the daily cap', async () => {
    vi.stubEnv('CHAT_DAILY_CAP', '2')
    completeChat.mockResolvedValue('ok\nSOURCES: 1')
    const codes: number[] = []
    for (let i = 0; i < 3; i++) codes.push((await POST(req(ask('How much does it cost?'), `7.7.7.${i}`))).status)
    expect(codes).toEqual([200, 200, 503])
  })

  it('maps a model failure to a friendly 503 without echoing the error', async () => {
    completeChat.mockRejectedValue(new Error('ai_http_500'))
    const res = await POST(req(ask('How much does it cost?')))
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toContain('ai_http')
  })
})
