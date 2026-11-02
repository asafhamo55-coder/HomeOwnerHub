import { z } from 'zod'
import { getAccountingContext } from '@/lib/accounting/queries'
import { load1099Summary } from '@/lib/accounting/year-end/load-1099'
import { form1099Table } from '@/lib/accounting/year-end/form1099'
import { csvDocument } from '@/lib/csv'
import { FORM_1099_EXPORT_ACTION } from '@/lib/audit/labels'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin, requireRouteUser } from '@/lib/api/auth'
import { parseValue } from '@/lib/api/parse'
import { zUuid } from '@/lib/api/schemas'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * GET /api/accounting/year-end/[periodId]/1099 — B9, the per-vendor 1099-NEC
 * summary as a CSV for the board or CPA. Board/admin only. Tax ids appear as
 * the last four digits only. Audited with counts only (no names, no amounts).
 * Nothing is filed with the IRS.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DENIED = 'Only board members and admins can download the 1099 summary.'
const Params = z.object({ periodId: zUuid })

interface RouteContext {
  params: Promise<{ periodId: string }>
}

export const GET = withRoute('accounting.year-end.1099', async (_request: Request, context: RouteContext) => {
  const { orgId } = await requireRouteBoardOrAdmin(DENIED)
  const { userId } = await requireRouteUser()
  const { periodId } = parseValue(Params, await context.params)

  const ctx = await getAccountingContext()
  if (!ctx || ctx.organizationId !== orgId) {
    throw new ApiRouteError('not_found', 'Accounting is not set up for this association yet.', {
      reason: 'accounting_not_set_up',
    })
  }

  const supabase = await getSupabaseServerClient()
  const { data: period, error: periodError } = await supabase
    .from('fiscal_periods')
    .select('id, start_date, end_date, status')
    .eq('id', periodId)
    .eq('association_id', ctx.associationId)
    .maybeSingle()
  if (periodError) {
    logRouteFailure('accounting.year-end.1099.period', periodError, { orgId, periodId })
    throw new ApiRouteError('internal')
  }
  if (!period) {
    throw new ApiRouteError('not_found', 'We could not find that fiscal year.', { reason: 'period_not_found' })
  }

  const { rows, calendarYear } = await load1099Summary({
    orgId,
    associationId: ctx.associationId,
    associationName: ctx.associationName,
    timeZone: ctx.timeZone,
    period,
  })
  const table = form1099Table(rows, calendarYear)
  const csv = csvDocument(table.header, table.rows)

  const { error: auditError } = await supabase.from('audit_log').insert({
    action: FORM_1099_EXPORT_ACTION,
    org_id: orgId,
    user_id: userId,
    entity_type: 'fiscal_period',
    entity_id: period.id,
    metadata: { fiscal_start: period.start_date, fiscal_end: period.end_date, vendors: rows.length },
  })
  checkWrite({ error: auditError }, 'accounting.year-end.1099.audit', { orgId })

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="1099-nec-summary-${calendarYear}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
