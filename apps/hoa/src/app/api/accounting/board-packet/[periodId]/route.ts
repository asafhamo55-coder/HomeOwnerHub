import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { z } from 'zod'
import {
  computeBalanceSheet,
  computeCashFlow,
  computeIncomeStatement,
  getAccountingContext,
  type AccountingBasis,
} from '@/lib/accounting/queries'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseValue } from '@/lib/api/parse'
import { zUuid } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * GET /api/accounting/board-packet/[periodId]
 *
 * Returns a PDF combining Balance Sheet (as-of period end) + Income
 * Statement + Cash Flow for the named fiscal period. Board/admin only
 * (RC-4): residents lost full-ledger reads in 0061, so the gate refuses
 * them with 403 rather than letting RLS hand back an empty packet.
 * Every failure is the JSON envelope (RC-1); the PDF is the only 2xx.
 *
 * Layout is plain text on portrait Letter — fine for a monthly board
 * packet. Designed renders (logo, two-column tables) land later if a
 * board cares.
 */

const DENIED = 'Only board members and admins can download the board packet.'

const Params = z.object({ periodId: zUuid })

interface RouteContext {
  params: Promise<{ periodId: string }>
}

export const GET = withRoute('accounting.board-packet', async (_request: Request, context: RouteContext) => {
  const { orgId } = await requireRouteBoardOrAdmin(DENIED) // 401 / 403 before any read
  const { periodId } = parseValue(Params, await context.params) // 400 validation_failed

  // A thrown read failure becomes a generic 500 via withRoute.
  const ctx = await getAccountingContext()
  if (!ctx || ctx.organizationId !== orgId) {
    throw new ApiRouteError('not_found', 'Accounting is not set up for this association yet.', {
      reason: 'accounting_not_set_up',
    })
  }

  // The period must belong to this association. RLS would block a
  // cross-org read anyway; a foreign or unknown id is the same 404.
  const supabase = await getSupabaseServerClient()
  const { data: period, error: periodError } = await supabase
    .from('fiscal_periods')
    .select('id, start_date, end_date, status')
    .eq('id', periodId)
    .eq('association_id', ctx.associationId)
    .maybeSingle()
  if (periodError) {
    logRouteFailure('accounting.board-packet.period', periodError, { orgId, periodId })
    throw new ApiRouteError('internal')
  }
  if (!period) {
    throw new ApiRouteError('not_found', 'We could not find that fiscal period.', { reason: 'period_not_found' })
  }

  // Pull all three reports in parallel. Use accrual basis (the board's
  // statutory book of record); managers wanting cash can use the UI.
  // The compute* helpers read through readAll and throw on a page error;
  // withRoute turns that into the generic 500 envelope.
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
})

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
  // Reject on a pdfkit stream error so a render failure is a 500, not a hung request.
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve())
    doc.on('error', reject)
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
