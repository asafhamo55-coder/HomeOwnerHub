import { M4_APPLIED } from '@homeowner-portal/db/m4'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readAllResult } from '@/lib/supabase/read-all'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import {
  INSURANCE_COLUMNS,
  INSURANCE_TABLE,
  POLICY_KIND_LABELS,
  daysFrom,
  isActive,
  policyFromRow,
  type InsurancePolicy,
} from '@/lib/insurance/model'
import type { LooseDb } from '@/lib/insurance/queries'
import { csvDocument } from '@/lib/csv'

/**
 * GET /insurance/export — the association's insurance policies as CSV.
 *
 * Board/admin only, checked before any read. Read-only. Same table, columns
 * and parser as the /insurance page (policyFromRow), scoped to the caller's
 * org. The page shows the policy number to the board, so the file does too;
 * premium, deductible and notes stay on the page.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HEADER = ['Kind', 'Carrier', 'Policy number', 'Coverage amount', 'Start', 'Expiry', 'Status']

const dollars = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2))

function statusOf(p: InsurancePolicy, today: string): string {
  if (isActive(p, today)) return 'Active'
  const left = daysFrom(today, p.expiresOn)
  return left !== null && left < 0 ? 'Expired' : 'Not started'
}

export const GET = withRoute('insurance.export', async () => {
  const { orgId } = await requireRouteBoardOrAdmin()
  // Migration 0068 not applied: the table may not exist, so read nothing.
  if (!M4_APPLIED) throw new ApiRouteError('not_found', 'Insurance tracking is not turned on yet.')

  const db = (await getSupabaseServerClient()) as unknown as LooseDb
  const timeZone = await currentTimeZone()

  // Paged to the end (BL-047); `id` is the tiebreak so pages never overlap.
  const { data, error } = await readAllResult<Record<string, unknown>>(
    (from, to) =>
      db
        .from(INSURANCE_TABLE)
        .select(INSURANCE_COLUMNS)
        .eq('organization_id', orgId)
        .order('expires_on', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
  )
  if (error) {
    logRouteFailure('insurance.export.read', new Error(error.message ?? 'read failed'), { orgId })
    throw new ApiRouteError('internal')
  }

  const today = todayIn(timeZone)
  const policies = (data ?? []).map(policyFromRow).filter((p): p is InsurancePolicy => p !== null)
  const body = csvDocument(
    HEADER,
    policies.map((p) => [
      POLICY_KIND_LABELS[p.kind],
      p.carrier,
      p.policyNumber ?? '',
      dollars(p.coverageLimitCents),
      p.effectiveOn ?? '',
      p.expiresOn,
      statusOf(p, today),
    ]),
  )

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="insurance-${today}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
