import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_MAX_BYTES,
  DEFAULT_RANGE_MAX_BYTES,
  DEFAULT_USER_AGENT,
  ResponseTooLargeError,
  readBodyCapped,
  coalesceRanges,
  createPoliteGetter,
  createPoliteRangeGetter,
  parseContentRange,
  parseMultipartByteranges,
} from './http'

/** A fake fetch + clock: no network, no real waiting. */
function harness(status = 200) {
  let clock = 1_000_000
  const sleeps: number[] = []
  const requests: { url: string; init: RequestInit | undefined; at: number }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    requests.push({ url, init, at: clock })
    return new Response(status === 200 ? '<html>ok</html>' : null, { status })
  }) as unknown as typeof fetch
  const getter = createPoliteGetter({
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
  })
  return { getter, sleeps, requests, advance: (ms: number) => (clock += ms) }
}

describe('createPoliteGetter', () => {
  // flsenate.gov/robots.txt: Crawl-delay: 10
  it('spaces requests to one host by at least 10 seconds', async () => {
    const h = harness()
    await h.getter.get('https://www.flsenate.gov/a')
    h.advance(3_000)
    await h.getter.get('https://www.flsenate.gov/b')
    expect(h.sleeps).toEqual([7_000])
    expect(h.requests[1].at - h.requests[0].at).toBe(10_000)
  })

  it('does not throttle different hosts against each other', async () => {
    const h = harness()
    await h.getter.get('https://www.flsenate.gov/a')
    await h.getter.get('https://downloads.example.test/b')
    expect(h.sleeps).toEqual([])
  })

  it('identifies itself and does not follow redirects', async () => {
    const h = harness()
    await h.getter.get('https://www.flsenate.gov/a')
    const init = h.requests[0].init!
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(DEFAULT_USER_AGENT)
    expect(DEFAULT_USER_AGENT).toMatch(/^HomeownerHub-StateLawIngest\//)
    expect(init.redirect).toBe('manual')
  })

  it('reports a redirect as its status with no body', async () => {
    const h = harness(302)
    const res = await h.getter.get('https://www.flsenate.gov/Laws/Statutes/2027/Chapter720/All')
    expect(res.status).toBe(302)
    expect(res.body).toBe('')
  })
})

// ─── Byte ranges (CA bulk zip) ───────────────────────────────────────

const FILE = new TextEncoder().encode('0123456789abcdefghijklmnopqrstuvwxyz')

/** A fake server that honours Range like Apache: one range → a plain 206,
 *  several → multipart/byteranges. `ignoreRange` answers 200 instead. */
function rangeServer(opts: { ignoreRange?: boolean } = {}) {
  const requests: { range: string | null; ua: string | null }[] = []
  let cancelled = false
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const headers = init!.headers as Record<string, string>
    requests.push({ range: headers.Range ?? null, ua: headers['User-Agent'] ?? null })
    if (opts.ignoreRange) {
      const body = new ReadableStream({
        pull(c) {
          c.enqueue(FILE)
        },
        cancel() {
          cancelled = true
        },
      })
      return new Response(body, { status: 200 })
    }
    const spans = headers.Range!.replace('bytes=', '')
      .split(',')
      .map((s) => {
        const [a, b] = s.split('-')
        return a === '' ? [FILE.length - Number(b), FILE.length - 1] : [Number(a), Math.min(Number(b), FILE.length - 1)]
      })
    if (spans.length === 1) {
      const [a, b] = spans[0]
      return new Response(FILE.slice(a, b + 1), {
        status: 206,
        headers: { 'Content-Range': `bytes ${a}-${b}/${FILE.length}`, ETag: '"v1"' },
      })
    }
    const enc = new TextEncoder()
    const chunks: Uint8Array[] = []
    for (const [a, b] of spans) {
      chunks.push(enc.encode(`\r\n--XYZ\r\nContent-type: application/zip\r\nContent-range: bytes ${a}-${b}/${FILE.length}\r\n\r\n`))
      chunks.push(FILE.slice(a, b + 1))
    }
    chunks.push(enc.encode('\r\n--XYZ--\r\n'))
    return new Response(new Uint8Array(Buffer.concat(chunks)), {
      status: 206,
      headers: { 'Content-Type': 'multipart/byteranges; boundary=XYZ', ETag: '"v1"' },
    })
  }) as unknown as typeof fetch
  const getter = createPoliteRangeGetter({ fetchImpl, minIntervalMs: 0 })
  return { getter, requests, wasCancelled: () => cancelled }
}

const text = (b: Uint8Array) => new TextDecoder().decode(b)

describe('createPoliteRangeGetter', () => {
  it('reads a suffix range as a plain 206 and reports size and ETag', async () => {
    const s = rangeServer()
    const res = await s.getter.getRanges('https://downloads.example.test/a.zip', [{ suffix: 4 }])
    expect(res).toMatchObject({ status: 206, etag: '"v1"', totalSize: 36 })
    expect(text(res.parts[0])).toBe('wxyz')
    expect(s.requests[0]).toEqual({ range: 'bytes=-4', ua: DEFAULT_USER_AGENT })
  })

  it('reads several ranges in one multipart request, one slice per range asked for', async () => {
    const s = rangeServer()
    const res = await s.getter.getRanges('https://downloads.example.test/a.zip', [
      { start: 20, end: 22 },
      { start: 0, end: 2 },
      { start: 1, end: 4 }, // overlaps the previous one
      { start: 30, end: 31 },
    ])
    expect(res.parts.map(text)).toEqual(['klm', '012', '1234', 'uv'])
    // Sent ascending and merged (Apache refuses too many overlaps/reversals).
    expect(s.requests).toEqual([{ range: 'bytes=0-4,20-22,30-31', ua: DEFAULT_USER_AGENT }])
  })

  it('refuses a server that ignores Range, without reading the (whole-file) body', async () => {
    const s = rangeServer({ ignoreRange: true })
    const res = await s.getter.getRanges('https://downloads.example.test/a.zip', [{ start: 0, end: 3 }])
    expect(res.status).toBe(200)
    expect(res.parts).toEqual([])
    expect(s.wasCancelled()).toBe(true)
  })
})

describe('range helpers', () => {
  it('coalesceRanges merges overlapping and touching ranges and keeps suffixes', () => {
    expect(
      coalesceRanges([{ start: 10, end: 19 }, { suffix: 5 }, { start: 0, end: 9 }, { start: 30, end: 31 }]),
    ).toEqual([{ start: 0, end: 19 }, { start: 30, end: 31 }, { suffix: 5 }])
  })

  it('parseContentRange', () => {
    expect(parseContentRange('bytes 100-199/5000')).toEqual({ start: 100, end: 199, total: 5000 })
    expect(parseContentRange('bytes 0-1/*')).toEqual({ start: 0, end: 1, total: null })
    expect(parseContentRange(null)).toBeNull()
  })

  it('a multipart part that is cut short is an error, not a short read', () => {
    const body = new TextEncoder().encode('--B\r\nContent-Range: bytes 0-9/36\r\n\r\n01234')
    expect(() => parseMultipartByteranges(body, 'B')).toThrow(/truncated/)
  })
})

// ─── Body-size caps ──────────────────────────────────────────────────

/** A fake body that never ends: 1 KB chunks until cancelled. */
function endlessBody() {
  const state = { pulled: 0, cancelled: false }
  const chunk = new Uint8Array(1024).fill(0x61)
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      state.pulled += chunk.byteLength
      c.enqueue(chunk)
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { stream, state }
}

describe('body-size caps', () => {
  it('readBodyCapped returns a body at the cap intact', async () => {
    const res = new Response(new Uint8Array(100).fill(0x62))
    const out = await readBodyCapped(res, 'https://x.test/a', 100)
    expect(out.byteLength).toBe(100)
  })

  it('page getter aborts an endless stream at the per-getter cap', async () => {
    const { stream, state } = endlessBody()
    const fetchImpl = (async () => new Response(stream, { status: 200 })) as unknown as typeof fetch
    const getter = createPoliteGetter({ fetchImpl, minIntervalMs: 0, maxBodyBytes: 10 * 1024 })
    await expect(getter.get('https://www.flsenate.gov/a')).rejects.toBeInstanceOf(ResponseTooLargeError)
    expect(state.cancelled).toBe(true)
    // Stopped within a chunk or two of the cap, never buffered past it.
    expect(state.pulled).toBeLessThanOrEqual(10 * 1024 + 2 * 1024)
  })

  it('page getter refuses a declared Content-Length over the cap without reading', async () => {
    const { stream, state } = endlessBody()
    const fetchImpl = (async () =>
      new Response(stream, {
        status: 200,
        headers: { 'Content-Length': String(DEFAULT_PAGE_MAX_BYTES + 1) },
      })) as unknown as typeof fetch
    const getter = createPoliteGetter({ fetchImpl, minIntervalMs: 0 })
    await expect(getter.get('https://www.flsenate.gov/a')).rejects.toThrow(/exceeds the 5242880-byte cap/)
    expect(state.cancelled).toBe(true)
  })

  it('range getter aborts an oversized 206 body at its cap', async () => {
    const { stream, state } = endlessBody()
    const fetchImpl = (async () =>
      new Response(stream, {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-99/5000000000' },
      })) as unknown as typeof fetch
    const getter = createPoliteRangeGetter({ fetchImpl, minIntervalMs: 0, maxBodyBytes: 8 * 1024 })
    await expect(
      getter.getRanges('https://downloads.example.test/a.zip', [{ start: 0, end: 99 }]),
    ).rejects.toBeInstanceOf(ResponseTooLargeError)
    expect(state.cancelled).toBe(true)
  })

  it('defaults: 5 MB per page, 40 MB per range response', () => {
    expect(DEFAULT_PAGE_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(DEFAULT_RANGE_MAX_BYTES).toBe(40 * 1024 * 1024)
  })
})
