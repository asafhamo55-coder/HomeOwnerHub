/**
 * The board packet PDF (server only: pdfkit). Letter, portrait, Helvetica
 * (a built-in PDF font, so nothing extra to bundle on Vercel).
 *
 * Layout: a branded cover block with a plain-words summary and four headline
 * figures, then the balance sheet, income statement and cash flow as ruled
 * tables with right-aligned money. Every page carries the association name,
 * the period and "Page X of Y"; a table never starts without its header and
 * at least two rows on the page, and repeats its header after a page break.
 * Text is limited to what Helvetica's WinAnsi set can draw (no check marks).
 *
 * Presentation only: every figure printed is an input, formatted by `usd`.
 */

import PDFDocument from 'pdfkit'
import { MARK } from '@homeowner-portal/ui/brand'
import { formatDay, usd } from '@/lib/money/format'
import { packetPeriodLabel, sourceLabel, summarizePacket, type PacketPdfInput } from './pdf-summary'

export type { PacketPdfInput } from './pdf-summary'

const C = {
  primary: '#4B27C9',
  primarySubtle: '#F0ECFF',
  text: '#0F172A',
  text2: '#334155',
  muted: '#526077',
  line: '#E2E8F0',
  tint: '#F5F8FC',
  danger: '#C4261B',
  success: '#067647',
  warnBg: '#FFF8E6',
  warnEdge: '#F79009',
  warnText: '#93370D',
  door: '#DDD6FE',
}

const MARGIN = 48
const PAGE_W = 612
const PAGE_H = 792
const CONTENT_W = PAGE_W - MARGIN * 2
const TOP_NEXT = 70 // first line of content on pages after the first
const BOTTOM = PAGE_H - 62 // last usable y; the footer lives below it
const ROW_H = 20

type Doc = PDFKit.PDFDocument

function drawMark(doc: Doc, x: number, y: number, size: number): void {
  const s = size / 32
  doc.save()
  doc.translate(x, y).scale(s)
  doc.roundedRect(0, 0, 32, 32, MARK.tileRadius).fill(C.primary)
  doc.lineCap('round').lineJoin('round').strokeColor('#FFFFFF')
  doc.path(MARK.stems.d).lineWidth(MARK.stems.strokeWidth).stroke()
  doc.path(MARK.roof.d).lineWidth(MARK.roof.strokeWidth).stroke()
  doc.roundedRect(MARK.door.x, MARK.door.y, MARK.door.width, MARK.door.height, MARK.door.rx).fill(C.door)
  doc.restore()
}

function wordmark(doc: Doc, x: number, y: number, size: number): void {
  doc.font('Helvetica-Bold').fontSize(size).fillColor(C.text).text('Homeowner', x, y, { continued: true, lineBreak: false })
  doc.fillColor(C.primary).text('Hub', { lineBreak: false })
}

function money(n: number): { text: string; color: string } {
  return { text: usd(n), color: n < -0.005 ? C.danger : C.text }
}

interface Col {
  label: string
  w: number
  align?: 'left' | 'right'
}

interface Row {
  cells: string[]
  kind?: 'row' | 'total' | 'grand'
  /** Per-cell colour override (money cells that are negative). */
  colors?: Array<string | undefined>
}

function drawHeaderRow(doc: Doc, cols: Col[], x: number, y: number): number {
  doc.rect(x, y, CONTENT_W, 22).fill(C.primarySubtle)
  let cx = x
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.primary)
  for (const c of cols) {
    doc.text(c.label.toUpperCase(), cx + 8, y + 7, { width: c.w - 16, align: c.align ?? 'left', characterSpacing: 0.6, lineBreak: false })
    cx += c.w
  }
  return y + 22
}

function rowHeight(doc: Doc, cols: Col[], r: Row): number {
  doc.font(r.kind === 'row' || !r.kind ? 'Helvetica' : 'Helvetica-Bold').fontSize(10)
  const h = doc.heightOfString(r.cells[0] ?? '', { width: cols[0]!.w - 16 })
  return Math.max(ROW_H, h + 10)
}

/**
 * A ruled table. Starts on a fresh page when its header and first two rows
 * would not fit, and repeats the header when it runs onto another page.
 */
function table(doc: Doc, title: string, cols: Col[], rows: Row[]): void {
  const x = MARGIN
  const first = rows.slice(0, 2).reduce((s, r) => s + rowHeight(doc, cols, r), 0)
  if (doc.y + 22 + first > BOTTOM) doc.addPage()
  let y = drawHeaderRow(doc, cols, x, doc.y)
  const heights = rows.map((r) => rowHeight(doc, cols, r))
  for (const [idx, r] of rows.entries()) {
    const h = heights[idx]!
    // Keep the closing total rows together with the row above them.
    const tail = idx === rows.length - 2 && rows.length > 3 ? heights[idx]! + heights[idx + 1]! : h
    if (y + tail > BOTTOM) {
      doc.addPage()
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted).text(`${title} (continued)`, x, doc.y, { lineBreak: false })
      y = drawHeaderRow(doc, cols, x, doc.y + 14)
    }
    if (r.kind === 'total' || r.kind === 'grand') doc.rect(x, y, CONTENT_W, h).fill(r.kind === 'grand' ? C.primarySubtle : C.tint)
    let cx = x
    r.cells.forEach((cell, i) => {
      const c = cols[i]!
      doc
        .font(r.kind === 'total' || r.kind === 'grand' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10)
        .fillColor(r.colors?.[i] ?? C.text)
        .text(cell, cx + 8, y + 5, { width: c.w - 16, align: c.align ?? 'left', lineBreak: i === 0 })
      cx += c.w
    })
    doc.moveTo(x, y + h).lineTo(x + CONTENT_W, y + h).lineWidth(0.5).strokeColor(C.line).stroke()
    y += h
  }
  doc.y = y + 14
  doc.x = MARGIN
}

function note(doc: Doc, text: string, color = C.muted): void {
  if (doc.y + 24 > BOTTOM) doc.addPage()
  doc.font('Helvetica').fontSize(10).fillColor(color).text(text, MARGIN, doc.y, { width: CONTENT_W })
  doc.moveDown(0.6)
}

function sectionTitle(doc: Doc, title: string, sub?: string, need = 130): void {
  if (doc.y + need > BOTTOM) doc.addPage()
  const y = doc.y
  doc.rect(MARGIN, y + 1, 4, sub ? 30 : 16).fill(C.primary)
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.text).text(title, MARGIN + 12, y, { width: CONTENT_W - 12 })
  if (sub) doc.font('Helvetica').fontSize(10).fillColor(C.muted).text(sub, MARGIN + 12, doc.y + 1, { width: CONTENT_W - 12 })
  doc.y += 10
  doc.x = MARGIN
}

const MONEY_COLS: Col[] = [
  { label: 'Account', w: 376 },
  { label: 'Amount', w: 140, align: 'right' },
]

function accountRows(rows: Array<{ accountNumber: string; accountName: string; balance: number }>, extra: Array<{ label: string; amount: number }> = []): Row[] {
  return [
    ...rows.map((r) => ({ label: `${r.accountNumber}  ${r.accountName}`, amount: r.balance })),
    ...extra,
  ].map((r) => {
    const m = money(r.amount)
    return { cells: [r.label, m.text], colors: [undefined, m.color] }
  })
}

function totalRow(label: string, amount: number, kind: 'total' | 'grand' = 'total'): Row {
  const m = money(amount)
  return { cells: [label, m.text], kind, colors: [undefined, m.color] }
}

function group(doc: Doc, title: string, rows: Row[], ...closing: Row[]): void {
  const body: Row[] = rows.length === 0 ? [{ cells: ['No accounts with a balance in this group', ''], colors: [C.muted] }] : rows
  table(doc, title, [{ ...MONEY_COLS[0]!, label: title }, MONEY_COLS[1]!], [...body, ...closing])
}

export async function renderBoardPacketPdf(input: PacketPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN },
    bufferPages: true,
    info: { Title: `${input.associationName} board packet`, Author: 'HomeownerHub' },
  })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  // Reject on a pdfkit stream error so a render failure is a 500, not a hung request.
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve())
    doc.on('error', reject)
  })

  const periodLabel = packetPeriodLabel(input.period)
  const sum = summarizePacket(input)

  // Running header on every page after the first.
  doc.on('pageAdded', () => {
    drawMark(doc, MARGIN, 26, 20)
    wordmark(doc, MARGIN + 27, 30, 11)
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`${input.associationName}  |  ${periodLabel}`, MARGIN + 150, 31, { width: CONTENT_W - 150, align: 'right', lineBreak: false })
    doc.moveTo(MARGIN, 54).lineTo(PAGE_W - MARGIN, 54).lineWidth(1.5).strokeColor(C.primary).stroke()
    doc.x = MARGIN
    doc.y = TOP_NEXT
  })

  // ─── Cover block ───────────────────────────────────────────────────
  drawMark(doc, MARGIN, MARGIN - 4, 34)
  wordmark(doc, MARGIN + 44, MARGIN + 3, 19)
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted).text('BOARD PACKET', MARGIN, MARGIN + 6, { width: CONTENT_W, align: 'right', characterSpacing: 1.2, lineBreak: false })
  doc.rect(MARGIN, MARGIN + 38, CONTENT_W, 3).fill(C.primary)

  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted).text(input.associationName.toUpperCase(), MARGIN, MARGIN + 60, { width: CONTENT_W, characterSpacing: 1 })
  doc.font('Helvetica-Bold').fontSize(26).fillColor(C.text).text('Board packet', MARGIN, doc.y + 4, { width: CONTENT_W })
  doc.font('Helvetica').fontSize(13).fillColor(C.text2).text(periodLabel, MARGIN, doc.y + 2, { width: CONTENT_W })
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(C.muted)
    .text(
      `Period status: ${input.period.status}. Accrual basis, posted entries only.${input.preparedOn ? ` Prepared ${formatDay(input.preparedOn)}.` : ''}`,
      MARGIN,
      doc.y + 4,
      { width: CONTENT_W },
    )

  // In brief
  let y = doc.y + 18
  const sentenceH = sum.sentences.reduce((s, t) => s + doc.font('Helvetica').fontSize(11).heightOfString(t, { width: CONTENT_W - 36 }) + 6, 0)
  const boxH = 22 + 26 + sentenceH + 10
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 8).fill(C.primarySubtle)
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.primary).text('IN BRIEF', MARGIN + 18, y + 14, { characterSpacing: 1.2 })
  doc.font('Helvetica-Bold').fontSize(14).fillColor(C.text).text(sum.headline, MARGIN + 18, y + 28, { width: CONTENT_W - 36 })
  let sy = y + 28 + doc.heightOfString(sum.headline, { width: CONTENT_W - 36 }) + 8
  doc.font('Helvetica').fontSize(11).fillColor(C.text2)
  for (const t of sum.sentences) {
    doc.text(t, MARGIN + 18, sy, { width: CONTENT_W - 36 })
    sy = doc.y + 6
  }
  y += boxH + 14

  // Flags
  if (sum.flags.length > 0) {
    const fh = sum.flags.reduce((s, t) => s + doc.font('Helvetica').fontSize(11).heightOfString(t, { width: CONTENT_W - 40 }) + 6, 0) + 36
    doc.rect(MARGIN, y, CONTENT_W, fh).fill(C.warnBg)
    doc.rect(MARGIN, y, 4, fh).fill(C.warnEdge)
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.warnText).text('WORTH A LOOK', MARGIN + 18, y + 12, { characterSpacing: 1.2 })
    let fy = y + 28
    doc.font('Helvetica').fontSize(11).fillColor(C.text)
    for (const t of sum.flags) {
      doc.text(t, MARGIN + 18, fy, { width: CONTENT_W - 40 })
      fy = doc.y + 6
    }
    y += fh + 14
  }

  // Figures: 2 x 2 tiles
  const tileW = (CONTENT_W - 12) / 2
  const tileH = 68
  sum.figures.forEach((f, i) => {
    const tx = MARGIN + (i % 2) * (tileW + 12)
    const ty = y + Math.floor(i / 2) * (tileH + 12)
    doc.roundedRect(tx, ty, tileW, tileH, 8).fillAndStroke(C.tint, C.line)
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted).text(f.label, tx + 14, ty + 11, { width: tileW - 28, lineBreak: false })
    doc.font('Helvetica-Bold').fontSize(sum.empty ? 16 : 20).fillColor(f.tone === 'danger' ? C.danger : f.tone === 'success' ? C.success : C.text).text(f.value, tx + 14, ty + 25, { width: tileW - 28, lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(f.sub, tx + 14, ty + 50, { width: tileW - 28, lineBreak: false })
  })
  y += 2 * (tileH + 12) + 6
  doc.x = MARGIN
  doc.y = y

  const { balanceSheet: bs, incomeStatement: is, cashFlow: cf } = input

  // ─── Balance sheet ─────────────────────────────────────────────────
  if (!sum.empty) doc.addPage()
  sectionTitle(doc, 'Balance sheet', `As of ${formatDay(bs.asOfDate)}`, sum.empty ? 60 : 130)
  if (sum.empty) {
    note(doc, 'No balances are on the books yet, so there is nothing to list here.')
  } else {
    group(doc, 'Assets', accountRows(bs.assets), totalRow('Total assets', bs.totalAssets))
    group(doc, 'Liabilities', accountRows(bs.liabilities), totalRow('Total liabilities', bs.totalLiabilities))
    group(
      doc,
      'Equity',
      accountRows(bs.equity, [{ label: 'Net income (period-to-date)', amount: bs.netIncomePtd }]),
      totalRow('Total equity', bs.totalEquity),
      totalRow('Total liabilities + equity', bs.totalLiabilities + bs.totalEquity, 'grand'),
    )
    const diff = Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity))
    note(
      doc,
      bs.isBalanced ? 'Balanced: assets equal liabilities plus equity.' : `Out of balance by ${usd(diff)}: assets do not equal liabilities plus equity.`,
      bs.isBalanced ? C.success : C.danger,
    )
  }

  // ─── Income statement ──────────────────────────────────────────────
  doc.moveDown(0.5)
  sectionTitle(doc, 'Income statement', `${formatDay(is.startDate)} to ${formatDay(is.endDate)}`, sum.empty ? 60 : 130)
  if (sum.empty) {
    note(doc, 'No income or expenses were posted in this period.')
  } else {
    group(doc, 'Income', accountRows(is.income), totalRow('Total income', is.totalIncome))
    group(
      doc,
      'Expenses',
      accountRows(is.expenses),
      totalRow('Total expenses', is.totalExpenses),
      totalRow(is.netIncome < 0 ? 'Net loss' : 'Net income', is.netIncome, 'grand'),
    )
  }

  // ─── Cash flow ─────────────────────────────────────────────────────
  doc.moveDown(0.5)
  sectionTitle(doc, 'Cash flow', `${formatDay(cf.startDate)} to ${formatDay(cf.endDate)}, direct method`, sum.empty ? 60 : 130)
  if (sum.empty) {
    note(doc, 'No cash moved in this period.')
  } else {
    const cols: Col[] = [
      { label: 'Source', w: 196 },
      { label: 'Inflows', w: 100, align: 'right' },
      { label: 'Outflows', w: 100, align: 'right' },
      { label: 'Net', w: 120, align: 'right' },
    ]
    const dash = (n: number) => (n > 0 ? usd(n) : '-')
    const opening = money(cf.openingCash)
    const flowRows: Row[] = [{ cells: ['Opening cash', '', '', opening.text], kind: 'total', colors: [undefined, undefined, undefined, opening.color] }]
    if (cf.rows.length === 0) flowRows.push({ cells: ['No cash movements in this period', '', '', ''], colors: [C.muted] })
    for (const r of cf.rows) {
      const n = money(r.net)
      flowRows.push({ cells: [sourceLabel(r.source), dash(r.inflow), dash(r.outflow), n.text], colors: [undefined, undefined, undefined, n.color] })
    }
    const net = money(cf.totalNet)
    const close = money(cf.closingCash)
    flowRows.push({ cells: ['Net change in cash', '', '', net.text], kind: 'total', colors: [undefined, undefined, undefined, net.color] })
    flowRows.push({ cells: ['Closing cash', '', '', close.text], kind: 'grand', colors: [undefined, undefined, undefined, close.color] })
    table(doc, 'Cash flow', cols, flowRows)
  }

  // ─── Footer on every page ──────────────────────────────────────────
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    doc.page.margins.bottom = 0 // else writing below the bottom margin adds a page
    doc.moveTo(MARGIN, PAGE_H - 46).lineTo(PAGE_W - MARGIN, PAGE_H - 46).lineWidth(0.5).strokeColor(C.line).stroke()
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(C.muted)
      .text(`${input.associationName}  |  ${periodLabel}  |  For board use only`, MARGIN, PAGE_H - 36, { width: CONTENT_W - 90, lineBreak: false })
    doc.text(`Page ${i + 1} of ${range.count}`, PAGE_W - MARGIN - 90, PAGE_H - 36, { width: 90, align: 'right', lineBreak: false })
  }

  doc.end()
  await done
  return Buffer.concat(chunks)
}
