import { describe, expect, it } from 'vitest'
import { looksLikeBillFile, resolveBillContentType } from './file-rules'

describe('resolveBillContentType', () => {
  it('accepts the declared PDF and image types', () => {
    expect(resolveBillContentType('application/pdf', 'x')).toBe('application/pdf')
    expect(resolveBillContentType('image/JPEG; charset=binary', 'x')).toBe('image/jpeg')
    expect(resolveBillContentType('image/webp', 'x.webp')).toBe('image/webp')
  })

  it('a declared type off the list is refused even with a bill-like name', () => {
    expect(resolveBillContentType('text/html', 'invoice.pdf')).toBeNull()
    expect(resolveBillContentType('image/svg+xml', 'bill.png')).toBeNull()
    expect(resolveBillContentType('image/heic', 'bill.heic')).toBeNull()
  })

  it('falls back to the extension only when the type is missing or generic', () => {
    expect(resolveBillContentType(null, 'Invoice 42.PDF')).toBe('application/pdf')
    expect(resolveBillContentType('application/octet-stream', 'scan.jpeg')).toBe('image/jpeg')
    expect(resolveBillContentType('', 'bill.docx')).toBeNull()
    expect(resolveBillContentType(null, 'noext')).toBeNull()
    expect(resolveBillContentType(null, '.pdf')).toBeNull()
  })
})

describe('looksLikeBillFile', () => {
  it('offers the scan on PDFs and photos only', () => {
    expect(looksLikeBillFile('invoice.pdf')).toBe(true)
    expect(looksLikeBillFile('photo.PNG')).toBe(true)
    expect(looksLikeBillFile('minutes.docx')).toBe(false)
    expect(looksLikeBillFile('IMG_0001.HEIC')).toBe(false)
  })
})
