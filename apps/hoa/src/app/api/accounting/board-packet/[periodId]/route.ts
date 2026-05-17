import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import {
  computeBalanceSheet,
  computeCashFlow,
  computeIncomeStatement,
  getAccountingContext,
  type AccountingBasis,
} from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * GET /api/accounting/board-packet/[periodId]
 *
 * Returns a PDF combining Balance Sheet (as-of period end) + Income
 * Statement + Cash Flow for the named fiscal period. Auth comes via the
 * existing RLS-scoped server client (the route runs under the user's
 * session cookies). PDFs are streamed back as application/pdf so the
 * browser triggers a download.
 *
 * Layout is plain text on portrait Letter — fine for a monthly board
 * packet. Designed renders (logo, two-column tables) land later if a
 * board cares.
 */

interface RouteContext {
  params: Promise<{ periodId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { periodId } = await context.params
  const ctx = await getAccountingContext()
  if (!ctx) {
    return NextResponse.json({ error: 'unauthorized_or_unseeded' }, { status: 401 })
  }

  // Verify the period belongs to this association — RLS would block
  // cross-org reads anyway but a clear 404 is nicer.
  const supabase = await getSupabaseServerClient()
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id, start_date, end_date, status')
    .eq('id', periodId)
    .eq('association_id', ctx.associationId)
    .single()
  if (!period) {
    return NextResponse.json({ error: 'period_not_found' }, { status: 404 })
  }

  // Pull all three reports in parallel. Use accrual basis (the board's
  // statutory book of record); managers wanting cash can use the UI.
  const basis: AccountingBasis = 'accrual'
  const [balanceSheet, incomeStatement, cashFlow] = await Promise.all([
    computeBalanceSheet(ctx.associationId, period.end_date),
    computeIncomeStatement(ctx.associationId, period.id, basis),
    computeCashFlow(ctx.associationId, period.id),
  ])

  const buf = await renderPdf({
    associationName: ctx.associationName,
    period,
    balanceSheet,
    incomeStatement,
    cashFlow,
  })

  // Node Buffer needs to be converted to Uint8Array for the Web Response
  // body. (NextResponse extends Response, which doesn't accept Buffer
  // directly under DOM lib types.)
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="board-packet-${period.start_date.slice(0, 4)}.pdf"`,
      'cache-control': 'no-store',
    },
  })
}

type BS = Awaited<ReturnType<typeof computeBalanceSheet>>
type IS = Awaited<ReturnType<typeof computeIncomeStatement>>
type CF = Awaited<ReturnType<typeof computeCashFlow>>

async function renderPdf(input: {
  associationName: string
  period: { start_date: string; end_date: string; status: string }
  balanceSheet: BS
  incomeStatement: IS
  cashFlow: CF
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 48 })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((resolve) => {
    doc.on('end', () => resolve())
  })

  // ─── Cover header ──────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(20).text(`${input.associationName}`, { align: 'left' })
  doc.font('Helvetica').fontSize(12).text(
    `Board Packet — ${input.period.start_date} to ${input.period.end_date}`,
    { align: 'left' },
  )
  doc.fontSize(9).fillColor('#666').text(
    `Period status: ${input.period.status} · Accrual basis · Posted entries only`,
    { align: 'left' },
  )
  doc.fillColor('#000').moveDown(1)

  // ─── Balance Sheet ─────────────────────────────────────────────────
  sectionHeader(doc, 'Balance Sheet')
  doc.fontSize(9).fillColor('#666').text(
    `As of ${input.balanceSheet.asOfDate}`,
  )
  doc.fillColor('#000').moveDown(0.5)

  reportSubsection(
    doc,
    'Assets',
    input.balanceSheet.assets.map((r) => ({
      label: `${r.accountNumber}  ${r.accountName}`,
      amount: r.balance,
    })),
    input.balanceSheet.totalAssets,
  )
  reportSubsection(
    doc,
    'Liabilities',
    input.balanceSheet.liabilities.map((r) => ({
      label: `${r.accountNumber}  ${r.accountName}`,
      amount: r.balance,
    })),
    input.balanceSheet.totalLiabilities,
  )

  // Equity section with PTD net-income memo line.
  reportSubsection(
    doc,
    'Equity',
    [
      ...input.balanceSheet.equity.map((r) => ({
        label: `${r.accountNumber}  ${r.accountName}`,
        amount: r.balance,
      })),
      {
        label: 'Net income (period-to-date)',
        amount: input.balanceSheet.netIncomePtd,
      },
    ],
    input.balanceSheet.totalEquity,
  )

  doc.font('Helvetica-Bold').fontSize(10)
  totalRow(
    doc,
    'Total liabilities + equity',
    input.balanceSheet.totalLiabilities + input.balanceSheet.totalEquity,
  )
  doc.fontSize(8).fillColor(input.balanceSheet.isBalanced ? '#059669' : '#dc2626')
  doc.text(
    input.balanceSheet.isBalanced
      ? `✓ balanced (A = L + E)`
      : `✗ off by ${currency(Math.abs(input.balanceSheet.totalAssets - (input.balanceSheet.totalLiabilities + input.balanceSheet.totalEquity)))}`,
    { align: 'right' },
  )
  doc.fillColor('#000').font('Helvetica').moveDown(1)

  // ─── Income Statement ──────────────────────────────────────────────
  doc.addPage()
  sectionHeader(doc, 'Income Statement')
  doc.fontSize(9).fillColor('#666').text(
    `${input.incomeStatement.startDate} to ${input.incomeStatement.endDate}`,
  )
  doc.fillColor('#000').moveDown(0.5)

  reportSubsection(
    doc,
    'Income',
    input.incomeStatement.income.map((r) => ({
      label: `${r.accountNumber}  ${r.accountName}`,
      amount: r.balance,
    })),
    input.incomeStatement.totalIncome,
  )
  reportSubsection(
    doc,
    'Expenses',
    input.incomeStatement.expenses.map((r) => ({
      label: `${r.accountNumber}  ${r.accountName}`,
      amount: r.balance,
    })),
    input.incomeStatement.totalExpenses,
  )

  doc.font('Helvetica-Bold').fontSize(11)
  totalRow(doc, 'Net income', input.incomeStatement.netIncome)
  doc.font('Helvetica').moveDown(1)

  // ─── Cash Flow ─────────────────────────────────────────────────────
  doc.addPage()
  sectionHeader(doc, 'Cash Flow')
  doc.fontSize(9).fillColor('#666').text(
    `${input.cashFlow.startDate} to ${input.cashFlow.endDate} · direct method`,
  )
  doc.fillColor('#000').moveDown(0.5)

  totalRow(doc, 'Opening cash', input.cashFlow.openingCash)
  doc.moveDown(0.3)

  if (input.cashFlow.rows.length === 0) {
    doc.fontSize(9).fillColor('#666').text('(no cash movements)').fillColor('#000')
  } else {
    doc.font('Helvetica-Bold').fontSize(9)
    threeCol(doc, 'Source', 'Inflows', 'Outflows', 'Net')
    doc.font('Helvetica').fontSize(9)
    for (const r of input.cashFlow.rows) {
      threeCol(
        doc,
        r.source,
        r.inflow > 0 ? currency(r.inflow) : '—',
        r.outflow > 0 ? currency(r.outflow) : '—',
        currency(r.net),
      )
    }
  }

  doc.moveDown(0.5)
  doc.font('Helvetica-Bold')
  totalRow(doc, 'Net change in cash', input.cashFlow.totalNet)
  totalRow(doc, 'Closing cash', input.cashFlow.closingCash)

  doc.end()
  await done
  return Buffer.concat(chunks)
}

// ─── PDF helpers ──────────────────────────────────────────────────

function sectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.font('Helvetica-Bold').fontSize(14).text(title)
  doc.font('Helvetica')
}

function reportSubsection(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: { label: string; amount: number }[],
  total: number,
): void {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#444').text(title.toUpperCase())
  doc.fillColor('#000').font('Helvetica').fontSize(9)
  if (rows.length === 0) {
    doc.fillColor('#666').text('(none)')
    doc.fillColor('#000')
  } else {
    for (const r of rows) {
      twoCol(doc, r.label, currency(r.amount))
    }
  }
  doc.font('Helvetica-Bold').fontSize(9)
  twoCol(doc, `Total ${title.toLowerCase()}`, currency(total))
  doc.font('Helvetica').moveDown(0.4)
}

function twoCol(doc: PDFKit.PDFDocument, left: string, right: string): void {
  const y = doc.y
  doc.text(left, 56, y, { width: 360, continued: false })
  doc.text(right, 56 + 360, y, { width: 140, align: 'right' })
}

function threeCol(
  doc: PDFKit.PDFDocument,
  label: string,
  a: string,
  b: string,
  c: string,
): void {
  const y = doc.y
  doc.text(label, 56, y, { width: 200 })
  doc.text(a, 256, y, { width: 80, align: 'right' })
  doc.text(b, 336, y, { width: 80, align: 'right' })
  doc.text(c, 416, y, { width: 100, align: 'right' })
}

function totalRow(doc: PDFKit.PDFDocument, label: string, amount: number): void {
  twoCol(doc, label, currency(amount))
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}
