// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { extractPdfText, PdfExtractError } from './extract-text'

// SEC-L7: the shared extractor runs the real pdfjs-dist legacy build on a
// PDF generated here (no fixture file, no network).

/** A minimal valid PDF: one Helvetica text line per page, correct xref. */
function makePdf(pageTexts: string[]): Uint8Array {
  const objs: string[] = []
  const n = pageTexts.length
  // 1 catalog, 2 pages, 3 font, then per page: page obj + content obj.
  const pageIds = pageTexts.map((_, i) => 4 + i * 2)
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${n} >>`
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  pageTexts.forEach((t, i) => {
    const pid = pageIds[i]!
    const stream = `BT /F1 18 Tf 72 720 Td (${t.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj ET`
    objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pid + 1} 0 R >>`
    objs[pid + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objs.length; id++) {
    offsets[id] = out.length
    out += `${id} 0 obj\n${objs[id]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objs.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    expect(err).toBeInstanceOf(PdfExtractError)
    return (err as PdfExtractError).code
  }
}

describe('extractPdfText (pdfjs-dist, hardened)', () => {
  it('extracts the text of a real PDF and reports the parser version', async () => {
    const res = await extractPdfText(makePdf(['Invoice SL-2210 total 1200.00']))
    expect(res.text).toContain('Invoice SL-2210 total 1200.00')
    expect(res.numPages).toBe(1)
    expect(res.truncated).toBe(false)
    expect(res.parserVersion).toMatch(/^pdfjs-dist-\d+\./)
  })

  it('leaves the caller’s buffer usable (pdf.js gets a copy)', async () => {
    const bytes = makePdf(['Keep me'])
    const len = bytes.byteLength
    await extractPdfText(bytes)
    expect(bytes.byteLength).toBe(len)
  })

  it('stops at the page cap and says so', async () => {
    const res = await extractPdfText(makePdf(['Page one', 'Page two', 'Page three']), { maxPages: 2 })
    expect(res.text).toContain('Page one')
    expect(res.text).toContain('Page two')
    expect(res.text).not.toContain('Page three')
    expect(res.numPages).toBe(3)
    expect(res.truncated).toBe(true)
  })

  it('caps the characters returned', async () => {
    // pdf.js drops text outside the page box, so spread it over pages.
    const res = await extractPdfText(makePdf(['A'.repeat(30), 'B'.repeat(30), 'C'.repeat(30)]), { maxChars: 50 })
    expect(res.text).not.toContain('C')
    expect(res.text.length).toBe(50)
    expect(res.truncated).toBe(true)
  })

  it('refuses an over-size file before parsing', async () => {
    expect(await code(extractPdfText(makePdf(['x']), { maxBytes: 10 }))).toBe('pdf_too_large')
  })

  it('a non-PDF or corrupt file is pdf_parse_failed, with no content in the error', async () => {
    const bytes = new TextEncoder().encode('not a pdf at all — secret body text')
    try {
      await extractPdfText(bytes)
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PdfExtractError)
      expect((err as PdfExtractError).code).toBe('pdf_parse_failed')
      expect(String((err as Error).message)).not.toContain('secret')
    }
  })

  it('a document that outlives its budget is pdf_timeout', async () => {
    const pages = Array.from({ length: 60 }, (_, i) => `Page ${i}`)
    expect(await code(extractPdfText(makePdf(pages), { timeoutMs: 1 }))).toBe('pdf_timeout')
  })
})
