// Test helper: builds a small ZIP in memory and serves it through a fake
// RangeGetter, so the California adapter's range-read path runs end to end
// with no network. Not imported by production code.

import { deflateRawSync } from 'node:zlib'
import type { ByteRange, RangeGetter, RangeResponse } from './types'

export interface BuildZipOptions {
  /** Emit the ZIP64 end records (as the real 205k-entry archive does). */
  zip64?: boolean
  /** Junk bytes before the first entry, so offsets are not tiny. */
  padding?: number
}

/** CRC is not checked by the reader; a zero CRC keeps the helper small. */
export function buildZip(files: Record<string, Uint8Array | string>, opts: BuildZipOptions = {}): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  let offset = 0
  const push = (b: Uint8Array) => {
    chunks.push(b)
    offset += b.length
  }
  if (opts.padding) push(new Uint8Array(opts.padding))

  const central: Uint8Array[] = []
  for (const [name, content] of Object.entries(files)) {
    const raw = typeof content === 'string' ? enc.encode(content) : content
    const data = deflateRawSync(raw)
    const nameBytes = enc.encode(name)
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, 8, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    const localOffset = offset
    push(local)
    push(data)

    const c = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(c.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 8, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, localOffset, true)
    c.set(nameBytes, 46)
    central.push(c)
  }
  const cdOffset = offset
  for (const c of central) push(c)
  const cdSize = offset - cdOffset
  const count = central.length

  if (opts.zip64) {
    const eocd64Offset = offset
    const e64 = new Uint8Array(56)
    const v = new DataView(e64.buffer)
    v.setUint32(0, 0x06064b50, true)
    v.setBigUint64(4, 44n, true)
    v.setBigUint64(24, BigInt(count), true)
    v.setBigUint64(32, BigInt(count), true)
    v.setBigUint64(40, BigInt(cdSize), true)
    v.setBigUint64(48, BigInt(cdOffset), true)
    push(e64)
    const loc = new Uint8Array(20)
    const lv = new DataView(loc.buffer)
    lv.setUint32(0, 0x07064b50, true)
    lv.setBigUint64(8, BigInt(eocd64Offset), true)
    lv.setUint32(16, 1, true)
    push(loc)
  }
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, opts.zip64 ? 0xffff : count, true)
  ev.setUint16(10, opts.zip64 ? 0xffff : count, true)
  ev.setUint32(12, opts.zip64 ? 0xffffffff : cdSize, true)
  ev.setUint32(16, opts.zip64 ? 0xffffffff : cdOffset, true)
  push(eocd)

  const out = new Uint8Array(offset)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

export interface FakeRangeGetter extends RangeGetter {
  calls: { url: string; ranges: ByteRange[] }[]
}

/** Serves byte ranges of in-memory files by URL. Unknown URLs are 404. */
export function fakeRangeGetter(
  files: Record<string, Uint8Array>,
  opts: { etag?: (url: string, callIndex: number) => string } = {},
): FakeRangeGetter {
  const calls: { url: string; ranges: ByteRange[] }[] = []
  return {
    calls,
    async getRanges(url, ranges): Promise<RangeResponse> {
      calls.push({ url, ranges })
      const file = files[url]
      const etag = opts.etag ? opts.etag(url, calls.length - 1) : '"fixture"'
      if (!file) return { status: 404, url, etag: null, totalSize: null, parts: [] }
      const parts = ranges.map((r) => {
        if ('suffix' in r) return file.subarray(Math.max(0, file.length - r.suffix))
        return file.subarray(r.start, Math.min(r.end, file.length - 1) + 1)
      })
      return { status: 206, url, etag, totalSize: file.length, parts }
    },
  }
}
