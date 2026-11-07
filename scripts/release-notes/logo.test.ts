import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRAND, LOGO_DIRS, LOGO_FILE } from './lib/brand'
import { wordmarkHeader } from './lib/email'
import { getLogoUrl, resetLogo, resolveLogo } from './lib/logo'

const origin = BRAND.prodUrl.replace(/\/+$/, '')
const urlFor = (dir: string) => `${origin}/${dir}/${LOGO_FILE}`
const [newest, previous] = LOGO_DIRS

function reply(status: number, type = 'image/png'): Response {
  return new Response(null, { status, headers: { 'content-type': type } })
}

/** A fetch that answers per URL: a number is a status, 'throw' rejects, 'hang' never settles until aborted. */
function fakeFetch(answers: Record<string, number | 'throw' | 'hang' | Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const a = answers[String(input)] ?? 404
    if (a === 'throw') throw new Error('network down')
    if (a === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    return typeof a === 'number' ? reply(a) : a
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

afterEach(() => resetLogo())

describe('logo fallback', () => {
  it('keeps an ordered list, newest first, and builds logoUrl from the first', () => {
    expect(LOGO_DIRS.length).toBeGreaterThanOrEqual(2)
    expect(BRAND.logoUrl).toBe(urlFor(newest))
  })

  it('uses the newest folder when it loads', async () => {
    const f = fakeFetch({ [urlFor(newest)]: 200 })
    expect(await resolveLogo(f)).toBe(urlFor(newest))
    expect(f).toHaveBeenCalledTimes(1)
    expect(wordmarkHeader('X')).toContain(urlFor(newest))
  })

  it('falls back to the previous folder when the newest 404s', async () => {
    const f = fakeFetch({ [urlFor(newest)]: 404, [urlFor(previous)]: 200 })
    const log = vi.fn()
    expect(await resolveLogo(f, log)).toBe(urlFor(previous))
    expect(getLogoUrl()).toBe(urlFor(previous))
    const html = wordmarkHeader('X')
    expect(html).toContain(urlFor(previous))
    expect(html).not.toContain(urlFor(newest))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('not live yet'))
  })

  it('skips a 200 that is not an image (an HTML error page)', async () => {
    const f = fakeFetch({ [urlFor(newest)]: reply(200, 'text/html; charset=utf-8'), [urlFor(previous)]: 200 })
    expect(await resolveLogo(f)).toBe(urlFor(previous))
  })

  it('uses the text wordmark when nothing loads', async () => {
    const f = fakeFetch({ [urlFor(newest)]: 500, [urlFor(previous)]: 'throw' })
    expect(await resolveLogo(f)).toBeNull()
    expect(getLogoUrl()).toBeNull()
    const html = wordmarkHeader('Owner actions')
    expect(html).not.toContain('<img')
    expect(html).toContain(BRAND.productName)
    expect(html).toContain('Owner actions')
  })

  it('times out a hanging request and moves on without throwing', async () => {
    const f = fakeFetch({ [urlFor(newest)]: 'hang', [urlFor(previous)]: 200 })
    expect(await resolveLogo(f, undefined, 20)).toBe(urlFor(previous))
    const g = fakeFetch({ [urlFor(newest)]: 'hang', [urlFor(previous)]: 'hang' })
    expect(await resolveLogo(g, undefined, 20)).toBeNull()
  })

  it('logs no URL, only the folder', async () => {
    const log = vi.fn()
    await resolveLogo(fakeFetch({ [urlFor(previous)]: 200 }), log)
    for (const [line] of log.mock.calls) expect(String(line)).not.toContain('http')
  })
})
