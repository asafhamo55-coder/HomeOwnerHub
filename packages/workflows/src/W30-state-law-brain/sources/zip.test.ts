import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { MAX_ENTRY_BYTES, entryRange, extractEntry, type ZipEntry } from './zip'

// Security review 2026-10-20 follow-up: the CA zip reader inflates no
// further than an entry's declared size, so a bomb that under-declares
// stops at the limit instead of allocating its real size first.

function localEntry(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name)
  const header = new Uint8Array(30 + nameBytes.length)
  const dv = new DataView(header.buffer)
  dv.setUint32(0, 0x04034b50, true)
  dv.setUint16(26, nameBytes.length, true)
  dv.setUint16(28, 0, true)
  header.set(nameBytes, 30)
  const out = new Uint8Array(header.length + data.length)
  out.set(header)
  out.set(data, header.length)
  return out
}

describe('zip extractEntry limits', () => {
  it('inflates an honest entry', () => {
    const plain = new TextEncoder().encode('Section 4000. Davis-Stirling.')
    const comp = deflateRawSync(plain)
    const e: ZipEntry = { name: 'a.dat', method: 8, compressedSize: comp.length, uncompressedSize: plain.length, localHeaderOffset: 0 }
    expect(new TextDecoder().decode(extractEntry(localEntry('a.dat', comp), e))).toBe('Section 4000. Davis-Stirling.')
  })

  it('refuses an entry that inflates past its declared size (bomb)', () => {
    const bomb = deflateRawSync(new Uint8Array(5 * 1024 * 1024)) // 5 MB of zeros, a few KB compressed
    const e: ZipEntry = { name: 'b.dat', method: 8, compressedSize: bomb.length, uncompressedSize: 1024, localHeaderOffset: 0 }
    expect(() => extractEntry(localEntry('b.dat', bomb), e)).toThrow(/declared size/)
  })

  it('refuses a declared size above the cap before inflating or range-reading', () => {
    const e: ZipEntry = { name: 'c.dat', method: 8, compressedSize: MAX_ENTRY_BYTES + 1, uncompressedSize: MAX_ENTRY_BYTES + 1, localHeaderOffset: 0 }
    expect(() => entryRange(e)).toThrow(/too large/)
    const small: ZipEntry = { ...e, compressedSize: 4 }
    expect(() => extractEntry(localEntry('c.dat', new Uint8Array(4)), small)).toThrow(/too large/)
  })
})
