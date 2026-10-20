import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyServerTiming, perfTimer, serverTimingValue, SLOW_LOADER_MS, timed } from './timing'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete process.env.PERF_LOG
})

describe('timed', () => {
  it('returns the loader result unchanged and stays quiet when fast', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    await expect(timed('/dues', 'dues.list', async () => [1, 2])).resolves.toEqual([1, 2])
    expect(info).not.toHaveBeenCalled()
    expect(debug).not.toHaveBeenCalled()
  })

  it('logs a slow loader at info level with route, loader and ms only', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1000 + SLOW_LOADER_MS + 12)
    await timed('/violations', 'violations.list', async () => ({ address: '1 Main St' }))
    expect(info).toHaveBeenCalledTimes(1)
    const line = String(info.mock.calls[0]![0])
    expect(line.startsWith('[perf] ')).toBe(true)
    expect(JSON.parse(line.slice(7))).toEqual({
      route: '/violations',
      loader: 'violations.list',
      ms: SLOW_LOADER_MS + 12,
      ok: true,
      slow: true,
    })
    // The result never reaches the log.
    expect(line).not.toContain('Main St')
  })

  it('logs fast loaders at debug when PERF_LOG=1', async () => {
    process.env.PERF_LOG = '1'
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    await timed('/', 'dashboard.kpis', async () => 1)
    expect(debug).toHaveBeenCalledTimes(1)
  })

  it('rethrows and records ok:false', async () => {
    process.env.PERF_LOG = '1'
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    await expect(
      timed('/', 'x', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(JSON.parse(String(debug.mock.calls[0]![0]).slice(7)).ok).toBe(false)
  })
})

describe('Server-Timing', () => {
  it('formats metrics and sanitises names', () => {
    expect(serverTimingValue([{ loader: 'dues list', ms: 5 }, { loader: 'a.b', ms: 7 }])).toBe(
      'dues_list;dur=5, a.b;dur=7',
    )
  })

  it('perfTimer collects timings and appends them to a response', async () => {
    const t = perfTimer('/api/x')
    await t.time('one', () => 1)
    await t.time('two', async () => 2)
    const res = new Response('ok', { headers: { 'Server-Timing': 'mw;dur=1' } })
    t.apply(res)
    expect(res.headers.get('Server-Timing')).toMatch(/^mw;dur=1, one;dur=\d+, two;dur=\d+$/)
  })

  it('leaves a response alone when there is nothing to report', () => {
    const res = new Response('ok')
    applyServerTiming(res, [])
    expect(res.headers.get('Server-Timing')).toBeNull()
  })
})
