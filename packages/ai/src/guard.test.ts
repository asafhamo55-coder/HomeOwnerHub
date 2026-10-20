import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AiPausedError,
  addAiCallObserver,
  aiKillSwitchOn,
  guardAiClient,
  isAiPausedError,
  recordPlatformAiUsage,
  setAiUsageRecorder,
  type PlatformAiUsage,
} from './guard'
import { embedTexts } from './embeddings'

// BL-112: the shared client-layer gate. AI_PLATFORM_KILL_SWITCH stops every
// guarded chat call and every embedding call before any network request.

function fakeClient() {
  const create = vi.fn(() => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }))
  return { client: guardAiClient({ chat: { completions: { create } } }), create }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  setAiUsageRecorder(null)
})

describe('kill switch at the client layer', () => {
  it('parses the flag the way BL-108 did', () => {
    expect(aiKillSwitchOn({ AI_PLATFORM_KILL_SWITCH: '1' })).toBe(true)
    expect(aiKillSwitchOn({ AI_PLATFORM_KILL_SWITCH: ' On ' })).toBe(true)
    expect(aiKillSwitchOn({ AI_PLATFORM_KILL_SWITCH: '0' })).toBe(false)
    expect(aiKillSwitchOn({})).toBe(false)
  })

  it('blocks a guarded chat call with AiPausedError before the provider is reached', async () => {
    vi.stubEnv('AI_PLATFORM_KILL_SWITCH', '1')
    const { client, create } = fakeClient()
    expect(() => client.chat.completions.create()).toThrow(AiPausedError)
    expect(create).not.toHaveBeenCalled()
  })

  it('passes through when the switch is off, and guarding twice is a no-op', async () => {
    const { client, create } = fakeClient()
    guardAiClient(client)
    await client.chat.completions.create()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('blocks embeddings before any fetch and records no usage', async () => {
    vi.stubEnv('AI_PLATFORM_KILL_SWITCH', 'true')
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const rec = vi.fn(async (_u: PlatformAiUsage) => {})
    setAiUsageRecorder(rec)
    await expect(embedTexts(['a'])).rejects.toBeInstanceOf(AiPausedError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rec).not.toHaveBeenCalled()
  })

  it('recognises the pause through defineWorkflow-style `.cause` wrapping', () => {
    const wrapped = new Error('workflow_W18_failed', { cause: new AiPausedError() })
    expect(isAiPausedError(wrapped)).toBe(true)
    expect(isAiPausedError(new Error('boom'))).toBe(false)
  })
})

describe('platform usage metering', () => {
  it('writes one ai.usage.embed row per embedding request', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    const vec = Array.from({ length: 768 }, () => 0.1)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const n = (JSON.parse(init.body) as { input: string[] }).input.length
        return new Response(JSON.stringify({ data: Array.from({ length: n }, (_, index) => ({ index, embedding: vec })) }))
      }),
    )
    const rec = vi.fn(async (_u: PlatformAiUsage) => {})
    setAiUsageRecorder(rec)
    await embedTexts(['a', 'b', 'c'], { batchSize: 2 })
    expect(rec).toHaveBeenCalledWith({ label: 'embed', calls: 2 })
  })

  it('notifies observers on each passing chat call, never on a blocked one', () => {
    const seen: string[] = []
    const off = addAiCallObserver((k) => seen.push(k))
    const { client } = fakeClient()
    void client.chat.completions.create()
    vi.stubEnv('AI_PLATFORM_KILL_SWITCH', '1')
    expect(() => client.chat.completions.create()).toThrow()
    off()
    expect(seen).toEqual(['chat'])
  })

  it('a failing recorder never throws into the call it meters', async () => {
    setAiUsageRecorder(async () => {
      throw new Error('db down')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordPlatformAiUsage({ label: 'embed', calls: 1 })).resolves.toBeUndefined()
  })
})
