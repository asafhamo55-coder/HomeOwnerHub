// Minimal read-only ZIP reader for range reads over a remote archive.
//
// California publishes its codes only as one ~1.2 GB zip
// (downloads.leginfo.legislature.ca.gov/pubinfo_<year>.zip). We never
// download it: we read its tail (end-of-central-directory), then its
// central directory, then only the handful of entries we need, each by an
// HTTP byte range. This file is the pure byte-level half of that; it does
// no I/O. ZIP64 is supported because the real archive uses it (205k
// entries > 65535).

import { inflateRawSync } from 'node:zlib'
import { SourceUnavailableError } from './types'

export interface ZipEntry {
  name: string
  /** 0 = stored, 8 = deflate. */
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

export interface CentralDirectoryLocation {
  offset: number
  size: number
  entries: number
}

const SIG_EOCD = 0x06054b50
const SIG_EOCD64 = 0x06064b50
const SIG_EOCD64_LOCATOR = 0x07064b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

/** Bytes of tail to read: the 22-byte EOCD plus a maximal 65535-byte comment. */
export const ZIP_TAIL_BYTES = 22 + 65_535

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength)
}

function u64(dv: DataView, at: number): number {
  const n = dv.getBigUint64(at, true)
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new SourceUnavailableError('zip: 64-bit value out of range')
  return Number(n)
}

/**
 * Locates the central directory from the last bytes of the archive.
 * `tailStart` is the file offset of `tail[0]`, needed only to find the ZIP64
 * record when it sits inside the tail.
 */
export function locateCentralDirectory(tail: Uint8Array, tailStart: number): CentralDirectoryLocation {
  const dv = view(tail)
  let at = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      at = i
      break
    }
  }
  if (at < 0) throw new SourceUnavailableError('zip: end of central directory not found')

  let entries = dv.getUint16(at + 10, true)
  let size = dv.getUint32(at + 12, true)
  let offset = dv.getUint32(at + 16, true)

  const needs64 = entries === 0xffff || size === 0xffffffff || offset === 0xffffffff
  const locAt = at - 20
  if (locAt >= 0 && dv.getUint32(locAt, true) === SIG_EOCD64_LOCATOR) {
    const eocd64Offset = u64(dv, locAt + 8)
    const rel = eocd64Offset - tailStart
    if (rel < 0 || rel + 56 > tail.length || dv.getUint32(rel, true) !== SIG_EOCD64) {
      throw new SourceUnavailableError('zip: ZIP64 end record not inside the tail read')
    }
    entries = u64(dv, rel + 32)
    size = u64(dv, rel + 40)
    offset = u64(dv, rel + 48)
  } else if (needs64) {
    throw new SourceUnavailableError('zip: ZIP64 sizes without a ZIP64 locator')
  }
  return { offset, size, entries }
}

/**
 * Walks the central directory and returns the entries `keep` accepts, by
 * name. Called with a narrow predicate so 200k entries are scanned without
 * 200k objects being kept.
 */
export function readCentralDirectory(cd: Uint8Array, keep: (name: string) => boolean): Map<string, ZipEntry> {
  const dv = view(cd)
  const dec = new TextDecoder('utf-8')
  const out = new Map<string, ZipEntry>()
  let p = 0
  while (p + 46 <= cd.length) {
    if (dv.getUint32(p, true) !== SIG_CENTRAL) throw new SourceUnavailableError(`zip: bad central entry at ${p}`)
    const method = dv.getUint16(p + 10, true)
    let compressedSize = dv.getUint32(p + 20, true)
    let uncompressedSize = dv.getUint32(p + 24, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    let localHeaderOffset = dv.getUint32(p + 42, true)
    const nameStart = p + 46
    const name = dec.decode(cd.subarray(nameStart, nameStart + nameLen))

    if (keep(name)) {
      // ZIP64 extended information (header id 1): only the fields whose
      // 32-bit slot is saturated are present, in this order.
      let q = nameStart + nameLen
      const extraEnd = q + extraLen
      while (q + 4 <= extraEnd) {
        const id = dv.getUint16(q, true)
        const len = dv.getUint16(q + 2, true)
        if (id === 1) {
          let r = q + 4
          if (uncompressedSize === 0xffffffff) (uncompressedSize = u64(dv, r)), (r += 8)
          if (compressedSize === 0xffffffff) (compressedSize = u64(dv, r)), (r += 8)
          if (localHeaderOffset === 0xffffffff) (localHeaderOffset = u64(dv, r)), (r += 8)
        }
        q += 4 + len
      }
      out.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset })
    }
    p = nameStart + nameLen + extraLen + commentLen
  }
  return out
}

/** Slack for the local header's own name/extra fields, which may differ
 *  from the central copy. */
const LOCAL_SLACK = 1024

/** The byte range that holds an entry's local header and data. */
export function entryRange(e: ZipEntry): { start: number; end: number } {
  return { start: e.localHeaderOffset, end: e.localHeaderOffset + 30 + e.name.length * 4 + e.compressedSize + LOCAL_SLACK }
}

/** Decompresses one entry from bytes that start at its local header. */
export function extractEntry(bytes: Uint8Array, e: ZipEntry): Uint8Array {
  const dv = view(bytes)
  if (bytes.length < 30 || dv.getUint32(0, true) !== SIG_LOCAL) {
    throw new SourceUnavailableError(`zip: no local header for ${e.name}`)
  }
  const dataStart = 30 + dv.getUint16(26, true) + dv.getUint16(28, true)
  const data = bytes.subarray(dataStart, dataStart + e.compressedSize)
  if (data.length !== e.compressedSize) throw new SourceUnavailableError(`zip: ${e.name} is truncated`)
  let out: Uint8Array
  if (e.method === 0) out = data
  else if (e.method === 8) out = inflateRawSync(data)
  else throw new SourceUnavailableError(`zip: ${e.name} uses unsupported method ${e.method}`)
  if (out.length !== e.uncompressedSize) throw new SourceUnavailableError(`zip: ${e.name} inflated to the wrong size`)
  return out
}
