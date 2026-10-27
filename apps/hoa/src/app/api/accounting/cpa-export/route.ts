import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteCpa } from '@/lib/api/auth'
import { parseQuery } from '@/lib/api/parse'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { buildCpaExport, cpaCsvResponse, CpaExportQuery } from '@/lib/professionals/cpa-export'
import { writeProAudit } from '@/lib/professionals/audit'
import { PRO_AUDIT } from '@/lib/professionals/model'

/**
 * GET /api/accounting/cpa-export?kind=trial_balance|general_ledger|ar_aging&periodId=<uuid>
 * (BL-168 follow-up) — a read-only CSV for the association's CPA.
 *
 * Active CPA only (RC-4): a resident, board member, attorney or an expired
 * CPA gets 403 before any client is made, and before M6_APPLIED nobody
 * passes. Every read uses the CPA's OWN RLS client, pinned to the gate's
 * org, so the file holds exactly what the CPA can already see and no more:
 * AR aging shows owner names and nothing else of the owner. It grants
 * nothing and writes nothing but one audit row (ids and codes: the period,
 * the kind, a row count). If that row can't be written the download is
 * refused (RC-6). The year-end package stays board-only.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = withRoute('accounting.cpa-export', async (request: Request) => {
  const { orgId, userId } = await requireRouteCpa()
  if (!M6_APPLIED) throw new ApiRouteError('not_found')
  const { kind, periodId } = parseQuery(new URL(request.url), CpaExportQuery)

  const supabase = await getSupabaseServerClient()
  let result
  try {
    result = await buildCpaExport(supabase, { orgId, kind, periodId })
  } catch (err) {
    logRouteFailure('accounting.cpa-export.read', err, { orgId, kind })
    throw new ApiRouteError('internal')
  }
  if (!result.ok) {
    throw new ApiRouteError('not_found', 'We could not find that fiscal period.', { reason: 'period_not_found' })
  }

  const audited = await writeProAudit(createAdminClient(), {
    orgId,
    userId,
    action: PRO_AUDIT.accountingExported,
    entityType: 'fiscal_period',
    entityId: periodId,
    metadata: { kind, rows: result.rows },
  })
  if (!audited) throw new ApiRouteError('internal')

  return cpaCsvResponse(result)
})
