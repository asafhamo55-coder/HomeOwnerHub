import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { logRouteFailure } from '@/lib/api/log'
import { parseQuery } from '@/lib/api/parse'
import { zDateOnly, zUuid } from '@/lib/api/schemas'
import { computeBudgetVsActual, getAccountingContext } from '@/lib/accounting/queries'
import { todayIn } from '@/lib/association-time'
import { csvDocument } from '@/lib/csv'

/**
 * GET /accounting/reports/budget-vs-actual/export?budget=<id>&asOf=<date>
 * The Budget vs actual report as CSV.
 *
 * Board/admin only, checked before any read, and scoped to the caller's
 * association. Read-only. Rows come from the same computeBudgetVsActual the
 * page uses, so the file matches the screen. A read failure is the standard
 * error response, never an empty file.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const Query = z.object({
  budget: zUuid,
  asOf: zDateOnly.optional(),
})

const HEADER = ['Account', 'Type', 'Budgeted', 'Actual', 'Variance', 'Note']

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'association'

export const GET = withRoute('accounting.budget-vs-actual-export', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const { budget, asOf } = parseQuery(new URL(request.url), Query)

  let ctx
  try {
    ctx = await getAccountingContext()
  } catch (e) {
    logRouteFailure('accounting.budget-vs-actual-export.context', e, { orgId })
    throw new ApiRouteError('internal')
  }
  if (!ctx) throw new ApiRouteError('not_found', 'No association is set up yet.')

  let report
  try {
    report = await computeBudgetVsActual(ctx.associationId, budget, asOf ? { through: asOf } : {})
  } catch (e) {
    logRouteFailure('accounting.budget-vs-actual-export.read', e, { orgId })
    throw new ApiRouteError('internal')
  }
  if (!report) throw new ApiRouteError('not_found', 'That budget was not found.')

  const body = csvDocument(
    HEADER,
    report.rows.map((r) => [
      `${r.accountNumber} ${r.accountName}`,
      r.accountType === 'income' ? 'Income' : 'Expense',
      money(r.budgeted),
      money(r.actual),
      money(r.variance),
      r.unbudgeted ? 'Not in the budget' : '',
    ]),
  )

  const today = todayIn(ctx.timeZone)
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="budget-vs-actual-${slugOf(ctx.associationName)}-${today}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
