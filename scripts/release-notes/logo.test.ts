import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOGO_DIR } from '../../packages/workflows/src/email-brand'
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

  it('sends the HEAD request with an abort signal', async () => {
    const f = fakeFetch({ [urlFor(newest)]: 200 })
    await resolveLogo(f)
    const init = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    expect(init.method).toBe('HEAD')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  describe('HEAD not supported', () => {
    /** HEAD answers `headStatus`; GET answers 206 with an image. */
    function headBlocked(headRes: () => Response) {
      return vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'HEAD' ? headRes() : new Response('x', { status: 206, headers: { 'content-type': 'image/png' } }),
      ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
    }

    it.each([405, 403, 501])('retries with a ranged GET after HEAD %i', async (status) => {
      const f = headBlocked(() => reply(status, 'text/plain'))
      expect(await resolveLogo(f)).toBe(urlFor(newest))
      const calls = f.mock.calls as [string, RequestInit][]
      expect(calls.map((c) => c[1].method)).toEqual(['HEAD', 'GET'])
      expect((calls[1]![1].headers as Record<string, string>).Range).toBe('bytes=0-0')
      expect(calls[1]![1].signal).toBeInstanceOf(AbortSignal)
    })

    it('retries with GET when HEAD is 200 with no content-type', async () => {
      const f = headBlocked(() => new Response(null, { status: 200 }))
      expect(await resolveLogo(f)).toBe(urlFor(newest))
      expect(f).toHaveBeenCalledTimes(2)
    })

    it('rejects when the GET retry is not an image', async () => {
      const f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'HEAD' ? reply(405) : reply(200, 'text/html'),
      ) as unknown as typeof fetch
      expect(await resolveLogo(f)).toBeNull()
    })

    it('does not retry a 404', async () => {
      const f = fakeFetch({})
      await resolveLogo(f)
      expect(f).toHaveBeenCalledTimes(LOGO_DIRS.length)
    })
  })

  it('uses the app LOGO_DIR as the newest folder', () => {
    expect(LOGO_DIRS[0]).toBe(LOGO_DIR)
  })

  it('marks the logo and the text wordmark for dark mode', async () => {
    expect(wordmarkHeader('X')).toContain('<img class="rn-link"')
    await resolveLogo(fakeFetch({}))
    expect(wordmarkHeader('X')).toContain('<span class="rn-link"')
  })
})
