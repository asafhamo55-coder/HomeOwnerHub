import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { orgTimeZone } from '@/lib/association-time-server'
import { todayIn } from '@/lib/association-time'
import { loadInsurancePolicies, type LooseDb } from '@/lib/insurance/queries'
import { buildComplianceIcs, COMPLIANCE_ICS_FILENAME, type CalendarAssociation } from '@/lib/compliance/calendar-ics'

/**
 * GET /compliance/calendar: a one-off .ics file of the next 12 months of
 * compliance deadlines and insurance policy expiry dates. Board/admin only
 * (RC-4); every read is pinned to the gate's org. Sends nothing and holds no
 * subscription. Policy events carry the policy type only, never a number.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface AssocRow {
  id: string
  name: string | null
  state: string | null
  governing_law_state: string | null
}

export const GET = withRoute('compliance.calendar', async () => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const timeZone = await orgTimeZone(supabase, orgId)

  const res = (await supabase
    .from('associations')
    .select('id, name, state, governing_law_state')
    .eq('organization_id', orgId)) as unknown as { data: AssocRow[] | null; error: { code?: string } | null }
  if (res.error) {
    logRouteFailure('compliance.calendar.associations', res.error, { orgId })
    throw new ApiRouteError('internal')
  }
  const policies = await loadInsurancePolicies(supabase as unknown as LooseDb, orgId)
  if (policies === null) throw new ApiRouteError('internal')

  const associations: CalendarAssociation[] = (res.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    state: r.state,
    governingLawState: r.governing_law_state,
  }))
  const body = buildComplianceIcs({ orgId, associations, policies, today: todayIn(timeZone) })

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${COMPLIANCE_ICS_FILENAME}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
