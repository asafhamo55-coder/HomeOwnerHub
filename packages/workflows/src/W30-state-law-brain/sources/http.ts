import type { ByteRange, HttpGetter, HttpResponse, RangeGetter, RangeResponse } from './types'
import { SourceUnavailableError } from './types'

/**
 * The only code in the ingestion pipeline that touches the network.
 *
 * Politeness, per the official sources' published rules:
 *   - flsenate.gov/robots.txt (checked 2026-10-15) allows /Laws/ and sets
 *     `Crawl-delay: 10`. tcss.legis.texas.gov and
 *     downloads.leginfo.legislature.ca.gov publish no robots.txt (404,
 *     checked 2026-10-20). Every getter here waits at least `minIntervalMs`
 *     between requests to the same host (default 10s) regardless.
 *   - an identifying User-Agent, so the operator can tell who is calling.
 *   - redirects are NOT followed: flsenate.gov answers an unpublished
 *     edition year with a 302 to its index page, and following it would
 *     turn "this year is not out yet" into a 200 with no statutes in it.
 *
 * Unit and integration tests never construct these with real fetch; they
 * inject a getter that serves recorded fixtures.
 */
export interface PoliteGetterOptions {
  minIntervalMs?: number
  timeoutMs?: number
  userAgent?: string
  /** Injectable for tests of the throttle itself. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  fetchImpl?: typeof fetch
}

export const DEFAULT_USER_AGENT =
  'HomeownerHub-StateLawIngest/1.1 (weekly HOA statute refresh from official state sources; a few requests per run)'

interface Throttled {
  fetchImpl: typeof fetch
  userAgent: string
  timeoutMs: number
  wait(url: string): Promise<void>
}

function throttled(opts: PoliteGetterOptions): Throttled {
  const minIntervalMs = opts.minIntervalMs ?? 10_000
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = opts.now ?? (() => Date.now())
  const lastRequestAt = new Map<string, number>()
  return {
    fetchImpl: opts.fetchImpl ?? fetch,
    userAgent: opts.userAgent ?? DEFAULT_USER_AGENT,
    timeoutMs: opts.timeoutMs ?? 30_000,
    async wait(url) {
      const host = new URL(url).host
      const last = lastRequestAt.get(host)
      if (last !== undefined) {
        const wait = last + minIntervalMs - now()
        if (wait > 0) await sleep(wait)
      }
      lastRequestAt.set(host, now())
    },
  }
}

export function createPoliteGetter(opts: PoliteGetterOptions = {}): HttpGetter {
  const t = throttled(opts)
  return {
    async get(url: string): Promise<HttpResponse> {
      await t.wait(url)
      const res = await t.fetchImpl(url, {
        headers: { 'User-Agent': t.userAgent, Accept: 'text/html' },
        redirect: 'manual',
        signal: AbortSignal.timeout(t.timeoutMs),
      })
      const body = res.status >= 300 && res.status < 400 ? '' : await res.text()
      return { status: res.status, url, body }
    },
  }
}

// ─── Byte ranges (California's bulk zip) ─────────────────────────────

/** `bytes=a-b,c-d` or `bytes=-n`. Ranges are inclusive, as in HTTP. */
export function rangeHeader(ranges: ByteRange[]): string {
  return (
    'bytes=' +
    ranges
      .map((r) => ('suffix' in r ? `-${r.suffix}` : `${r.start}-${r.end}`))
      .join(',')
  )
}

/** `bytes 100-199/5000` → {start, end, total}. */
export function parseContentRange(value: string | null): { start: number; end: number; total: number | null } | null {
  const m = value?.match(/^\s*bytes\s+(\d+)-(\d+)\/(\d+|\*)\s*$/i)
  if (!m) return null
  return { start: Number(m[1]), end: Number(m[2]), total: m[3] === '*' ? null : Number(m[3]) }
}

interface Piece {
  start: number
  bytes: Uint8Array
}

function indexOf(hay: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

/**
 * Splits a `multipart/byteranges` body into its parts. Each part's own
 * Content-Range says where it sits in the file; the server may merge or
 * reorder the requested ranges, so callers locate data by offset, never by
 * part order.
 */
export function parseMultipartByteranges(body: Uint8Array, boundary: string): { pieces: Piece[]; total: number | null } {
  const enc = new TextEncoder()
  const dec = new TextDecoder('latin1')
  const delim = enc.encode(`--${boundary}`)
  const crlf2 = enc.encode('\r\n\r\n')
  const pieces: Piece[] = []
  let total: number | null = null
  let pos = indexOf(body, delim, 0)
  while (pos >= 0) {
    const after = pos + delim.length
    // `--boundary--` closes the body.
    if (body[after] === 0x2d && body[after + 1] === 0x2d) break
    const headEnd = indexOf(body, crlf2, after)
    if (headEnd < 0) break
    const headers = dec.decode(body.subarray(after, headEnd))
    const cr = parseContentRange(headers.match(/content-range:\s*([^\r\n]+)/i)?.[1] ?? null)
    if (!cr) throw new SourceUnavailableError('multipart/byteranges part without a Content-Range')
    const dataStart = headEnd + crlf2.length
    const length = cr.end - cr.start + 1
    if (dataStart + length > body.length) throw new SourceUnavailableError('multipart/byteranges part is truncated')
    pieces.push({ start: cr.start, bytes: body.subarray(dataStart, dataStart + length) })
    total = cr.total ?? total
    pos = indexOf(body, delim, dataStart + length)
  }
  return { pieces, total }
}

/** For each requested range, the bytes from whichever returned piece covers it. */
export function sliceRanges(pieces: Piece[], ranges: ByteRange[], total: number): Uint8Array[] {
  return ranges.map((r) => {
    const start = 'suffix' in r ? Math.max(0, total - r.suffix) : r.start
    const end = 'suffix' in r ? total - 1 : Math.min(r.end, total - 1)
    const piece = pieces.find((p) => p.start <= start && p.start + p.bytes.length - 1 >= end)
    if (!piece) throw new SourceUnavailableError(`server did not return bytes ${start}-${end}`)
    return piece.bytes.subarray(start - piece.start, end - piece.start + 1)
  })
}

/**
 * Sorts and merges overlapping or touching ranges. Apache answers a request
 * with too many overlapping or out-of-order ranges (MaxRangeOverlaps /
 * MaxRangeReversals, default 20) with the whole file, so the wire request
 * is always ascending and disjoint; callers still get one slice per range
 * they asked for.
 */
export function coalesceRanges(ranges: ByteRange[]): ByteRange[] {
  const suffixes = ranges.filter((r): r is { suffix: number } => 'suffix' in r)
  const spans = ranges
    .filter((r): r is { start: number; end: number } => !('suffix' in r))
    .map((r) => ({ ...r }))
    .sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const r of spans) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end)
    else merged.push(r)
  }
  return [...merged, ...suffixes]
}

/**
 * Range reads, several ranges per request (`multipart/byteranges`), so a
 * run over a 1.2 GB archive is a handful of small requests rather than a
 * download. A server that ignores Range (200) is refused before its body is
 * read: that body would be the whole archive.
 */
export function createPoliteRangeGetter(opts: PoliteGetterOptions = {}): RangeGetter {
  const t = throttled(opts)
  return {
    async getRanges(url: string, ranges: ByteRange[]): Promise<RangeResponse> {
      if (ranges.length === 0) throw new Error('getRanges: no ranges requested')
      await t.wait(url)
      const res = await t.fetchImpl(url, {
        headers: { 'User-Agent': t.userAgent, Range: rangeHeader(coalesceRanges(ranges)) },
        redirect: 'manual',
        signal: AbortSignal.timeout(t.timeoutMs),
      })
      const etag = res.headers.get('etag')
      if (res.status !== 206) {
        await res.body?.cancel().catch(() => undefined)
        return { status: res.status, url, etag, totalSize: null, parts: [] }
      }
      const body = new Uint8Array(await res.arrayBuffer())
      const type = res.headers.get('content-type') ?? ''
      const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1]
      let pieces: Piece[]
      let total: number | null
      if (/multipart\/byteranges/i.test(type) && boundary) {
        ;({ pieces, total } = parseMultipartByteranges(body, boundary))
      } else {
        const cr = parseContentRange(res.headers.get('content-range'))
        if (!cr) throw new SourceUnavailableError(`${url}: 206 without a Content-Range`)
        pieces = [{ start: cr.start, bytes: body }]
        total = cr.total
      }
      if (total === null) throw new SourceUnavailableError(`${url}: unknown file size`)
      return { status: 206, url, etag, totalSize: total, parts: sliceRanges(pieces, ranges, total) }
    },
  }
}
