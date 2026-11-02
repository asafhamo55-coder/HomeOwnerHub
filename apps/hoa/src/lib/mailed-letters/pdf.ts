/**
 * BL-032: the letter blocks as a PDF (server only: pdfkit), US Letter,
 * Helvetica (built in, nothing to bundle). One page count comes back so the
 * cost screen prices the exact letter that will be mailed. Same pdfkit
 * approach as lib/board-packet/render-pdf.ts. Presentation only.
 */

import PDFDocument from 'pdfkit'
import type { DocBlock } from './letter-doc'

const MARGIN = 72
const PAGE_W = 612
const CONTENT_W = PAGE_W - MARGIN * 2

/** Helvetica's built-in set is WinAnsi: keep what it can draw, mark the rest. */
export function winAnsi(s: string): string {
  return s.replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—•…€™\n]/g, '?')
}

export interface RenderedLetter {
  pdf: Uint8Array
  pages: number
}

export function renderLetterPdf(blocks: DocBlock[]): Promise<RenderedLetter> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('error', reject)
    doc.on('end', () => resolve({ pdf: new Uint8Array(Buffer.concat(chunks)), pages: pageCount }))
    let pageCount = 1

    const ink = (muted?: boolean) => (muted ? '#334155' : '#0F172A')
    for (const b of blocks) {
      if (b.kind === 'gap') {
        doc.moveDown(b.height / 12)
      } else if (b.kind === 'text') {
        doc
          .font(b.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(b.size ?? 11)
          .fillColor(ink(b.muted))
          .text(winAnsi(b.text), { width: CONTENT_W })
          .moveDown(0.5)
      } else if (b.kind === 'bullets') {
        for (const item of b.items) {
          doc.font('Helvetica').fontSize(10.5).fillColor(ink()).text(winAnsi(`• ${item}`), { width: CONTENT_W, indent: 10 }).moveDown(0.3)
        }
        doc.moveDown(0.3)
      } else {
        const size = b.small ? 9.5 : 11
        const amountW = 110
        for (const r of b.rows) {
          const font = r.bold ? 'Helvetica-Bold' : 'Helvetica'
          const label = winAnsi(r.label)
          const amount = winAnsi(r.amount)
          doc.font(font).fontSize(size)
          const h = Math.max(doc.heightOfString(label, { width: CONTENT_W - amountW - 8 }), doc.heightOfString('M'))
          if (doc.y + h + 4 > doc.page.height - MARGIN) doc.addPage()
          const y = doc.y
          doc.fillColor(ink()).text(label, MARGIN, y, { width: CONTENT_W - amountW - 8 })
          doc.text(amount, MARGIN + CONTENT_W - amountW, y, { width: amountW, align: 'right' })
          doc.y = y + h + 4
          doc.moveTo(MARGIN, doc.y - 2).lineTo(MARGIN + CONTENT_W, doc.y - 2).lineWidth(0.4).strokeColor('#CBD5E1').stroke()
        }
        doc.x = MARGIN
        doc.moveDown(0.6)
      }
      doc.x = MARGIN
    }
    pageCount = doc.bufferedPageRange().count
    doc.end()
  })
}
