import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain .mjs tool script, no types
import { buildPayloads, list, loadScenes, readApiKey, redact, totalSeconds } from './generate.mjs'

const KEY = 'sk_test_SECRET_1234567890'

function envFile(text: string) {
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'hg-')), 'heygen.env')
  writeFileSync(f, text)
  return f
}

afterEach(() => vi.unstubAllGlobals())

describe('readApiKey', () => {
  it('reads the key, with comments, quotes and export', () => {
    expect(readApiKey(envFile(`# c\nOTHER=1\nexport HEYGEN_API_KEY="${KEY}"\n`))).toBe(KEY)
    expect(readApiKey(envFile(`HEYGEN_API_KEY=${KEY}`))).toBe(KEY)
  })

  it('does not print the key and never puts it in an error', () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
    readApiKey(envFile(`HEYGEN_API_KEY=${KEY}`))
    expect(() => readApiKey(envFile('HEYGEN_API_KEY=\n'))).toThrow(/not set/)
    expect(() => readApiKey('/nonexistent/heygen.env')).toThrow(/Cannot read/)
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(KEY)
    spies.forEach((s) => s.mockRestore())
  })
})

describe('buildPayloads', () => {
  const { scenes, speed } = loadScenes()
  const p = buildPayloads({ scenes, speed, avatarId: 'av1', voiceId: 'vo1', orientation: 'portrait', assetIds: { [scenes[0].background.portrait]: 'asset-1' } })

  it('keeps scene order and pairs avatar, voice, line and background', () => {
    expect(p.map((x: { script: string }) => x.script)).toEqual(scenes.map((s: { line: string }) => s.line))
    expect(p[0]).toMatchObject({ type: 'avatar', avatar_id: 'av1', voice_id: 'vo1', voice_settings: { speed: 0.9 }, aspect_ratio: '9:16', background: { type: 'image', asset_id: 'asset-1' } })
    expect(p[0].caption.style).toBe('default')
  })

  it('uses 16:9 for landscape and each landscape background', () => {
    const l = buildPayloads({ scenes, speed, avatarId: 'a', voiceId: 'v', orientation: 'landscape' })
    expect(l.every((x: { aspect_ratio: string }) => x.aspect_ratio === '16:9')).toBe(true)
    expect(l[3].background.asset_id).toContain(scenes[3].background.landscape)
  })

  it('rejects an unknown orientation', () => {
    expect(() => buildPayloads({ scenes, avatarId: 'a', voiceId: 'v', orientation: 'square' })).toThrow(/orientation/)
  })

  it('totals about 90 to 120 seconds, and only first and last lines say Madison Park', () => {
    const t = totalSeconds(scenes)
    expect(t).toBeGreaterThanOrEqual(90)
    expect(t).toBeLessThanOrEqual(120)
    scenes.forEach((s: { line: string }, i: number) => {
      expect(/Madison Park/.test(s.line)).toBe(i === 0 || i === scenes.length - 1)
      expect(s.line).not.toMatch(/[—–]/)
    })
  })
})

describe('redact', () => {
  it('removes the key from headers and from any string', () => {
    const out = JSON.stringify(redact({ headers: { 'x-api-key': KEY, Authorization: `Bearer ${KEY}` }, note: `oops ${KEY}` }, KEY))
    expect(out).not.toContain(KEY)
    expect(out).toContain('[REDACTED]')
  })
})

describe('list (mocked fetch)', () => {
  it('sends the key only as a header, filters to English voices, and follows pages', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })
    vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers })
      if (url.includes('/v3/avatars/looks')) return reply({ data: [{ id: 'look1', name: 'Anna', gender: 'female', avatar_type: 'studio_avatar' }], has_more: false })
      if (url.includes('token=t2')) return reply({ data: [{ voice_id: 'v3', name: 'Ben', language: 'English' }], has_more: false })
      return reply({ data: [{ voice_id: 'v1', name: 'Cara', language: 'en-US' }, { voice_id: 'v2', name: 'Dieter', language: 'de-DE' }], has_more: true, next_token: 't2' })
    })
    const lines: string[] = []
    await list(KEY, 3, (l: string) => lines.push(l))
    const text = lines.join('\n')
    expect(text).toContain('look1')
    expect(text).toContain('v1')
    expect(text).toContain('v3')
    expect(text).not.toContain('v2 ')
    expect(text).not.toContain(KEY)
    expect(calls).toHaveLength(3)
    expect(calls.every((c) => c.headers['x-api-key'] === KEY && !c.url.includes(KEY))).toBe(true)
  })

  it('reports HTTP errors without the key', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: `bad key ${KEY}` }), { status: 401 }))
    const err = await list(KEY, 1, () => {}).catch((e: Error) => e)
    expect((err as Error).message).toContain('HTTP 401')
    expect((err as Error).message).not.toContain(KEY)
  })
})
