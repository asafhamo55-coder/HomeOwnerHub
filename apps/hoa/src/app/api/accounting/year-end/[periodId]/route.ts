import { z } from 'zod'
import { getAccountingContext } from '@/lib/accounting/queries'
import { loadYearEndData } from '@/lib/accounting/year-end/load'
import { buildYearEndZip } from '@/lib/accounting/year-end/model'
import { YEAR_END_EXPORT_ACTION } from '@/lib/audit/labels'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin, requireRouteUser } from '@/lib/api/auth'
import { parseValue } from '@/lib/api/parse'
import { zUuid } from '@/lib/api/schemas'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * GET /api/accounting/year-end/[periodId] — BL-121, the year-end package
 * for the CPA: a zip of CSVs (trial balance, statements, GL detail, AR
 * aging, bank rec status, vendor payments, budget vs actual, the 1120-H
 * worksheet and the 1099-NEC candidates) for one fiscal year.
 *
 * Board/admin only (RC-4): a resident gets 403 before any client is made.
 * Reads use the caller's RLS-scoped client, pinned to the gate's org and
 * its association. The period must belong to that association (else 404).
 *
 * The export is audited: one audit_log row with the fiscal year and per-file
 * row counts (no names, no amounts) is written before the zip is sent. If
 * it cannot be written the export is refused (RC-6). Tax ids never leave:
 * the 1099 list only says whether one is on file.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DENIED = 'Only board members and admins can download the year-end package.'
const Params = z.object({ periodId: zUuid })

interface RouteContext {
  params: Promise<{ periodId: string }>
}

export const GET = withRoute('accounting.year-end', async (_request: Request, context: RouteContext) => {
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
    logRouteFailure('accounting.year-end.period', periodError, { orgId, periodId })
    throw new ApiRouteError('internal')
  }
  if (!period) {
    throw new ApiRouteError('not_found', 'We could not find that fiscal year.', { reason: 'period_not_found' })
  }

  // Any failed read throws; withRoute answers the generic 500 and no
  // partial package is ever sent.
  const data = await loadYearEndData({
    orgId,
    associationId: ctx.associationId,
    associationName: ctx.associationName,
    timeZone: ctx.timeZone,
    period,
  })
  const { zip, files } = buildYearEndZip(data, new Date().toISOString())

  const { error: auditError } = await supabase.from('audit_log').insert({
    action: YEAR_END_EXPORT_ACTION,
    org_id: orgId,
    user_id: userId,
    entity_type: 'fiscal_period',
    entity_id: period.id,
    metadata: {
      fiscal_start: period.start_date,
      fiscal_end: period.end_date,
      files: files.length,
      rows: Object.fromEntries(files.map((f) => [f.name, f.rows])),
      nec_candidates: data.nec.length,
    },
  })
  checkWrite({ error: auditError }, 'accounting.year-end.audit', { orgId })

  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="year-end-package-${period.end_date}.zip"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
