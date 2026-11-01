import { NextResponse } from 'next/server'
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
import { renderBoardPacketPdf } from '@/lib/board-packet/render-pdf'
import { todayIso } from '@/lib/money/format'

/**
 * GET /api/accounting/board-packet/[periodId]
 *
 * Returns a PDF combining Balance Sheet (as-of period end) + Income
 * Statement + Cash Flow for the named fiscal period. Board/admin only
 * (RC-4): residents lost full-ledger reads in 0061, so the gate refuses
 * them with 403 rather than letting RLS hand back an empty packet.
 * Every failure is the JSON envelope (RC-1); the PDF is the only 2xx.
 *
 * Layout (lib/board-packet/render-pdf.ts): branded cover with a summary,
 * then ruled tables on portrait Letter, with the association, period and
 * page number on every page. Presentation only; the figures are exactly
 * the three computed reports below.
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

  const buf = await renderBoardPacketPdf({
    preparedOn: todayIso(),
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
