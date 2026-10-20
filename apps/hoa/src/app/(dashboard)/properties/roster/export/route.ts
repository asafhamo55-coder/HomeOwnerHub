import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { getCurrentUserRole } from '@/lib/auth'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { recordRosterExport } from '@/lib/properties/statutory-roster/audit'
import { loadRosterInput, readRosterAssociations } from '@/lib/properties/statutory-roster/load'
import { csvDocument } from '@/lib/csv'
import { buildReport, parseRosterParams, reportCounts, reportTable, rosterFilename } from '@/lib/properties/statutory-roster/model'

/**
 * GET /properties/roster/export?kind=owners|voters|records&asOf=YYYY-MM-DD —
 * the statutory owner roster, voter list, or records-request copy (the
 * roster an owner may be given: no phones, no balances, email only where
 * the state allows and the owner hasn't opted out) as CSV (Properties P5).
 *
 * Board/admin only, checked before any client is made. Anyone else —
 * a resident included — gets 404: the page and this file don't exist
 * for them. One audit_log row (counts only) is written before the file
 * is sent; if it can't be written the export is refused.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = withRoute('properties.roster-export', async (request) => {
  const ctx = await getCurrentUserRole()
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) throw new ApiRouteError('not_found')
  const orgId = ctx.org.id

  const url = new URL(request.url)
  const supabase = await getSupabaseServerClient()
  const assoc = await readRosterAssociations(supabase, orgId)
  const params = parseRosterParams(
    { kind: url.searchParams.get('kind') ?? undefined, asOf: url.searchParams.get('asOf') ?? undefined },
    todayIn(assoc.timeZone),
  )
  if (!params.kind || params.dateError) {
    throw new ApiRouteError('validation_failed', 'Choose a roster and a real as-of date.', {
      issues: [
        ...(params.kind ? [] : [{ path: 'kind', message: 'Use owners, voters or records.' }]),
        ...(params.dateError ? [{ path: 'asOf', message: 'Use a real YYYY-MM-DD date.' }] : []),
      ],
    })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new ApiRouteError('unauthenticated')

  const { input } = await loadRosterInput(supabase, orgId, params.kind, params.asOf, assoc)
  const report = buildReport(params.kind, input, params.asOf)

  const audit = await recordRosterExport(supabase, {
    orgId,
    userId: user.id,
    kind: params.kind,
    asOf: params.asOf,
    format: 'csv',
    counts: reportCounts(report),
  })
  if (!audit.ok) throw new ApiRouteError('internal')

  const { header, rows } = reportTable(report)
  return new Response(csvDocument(header, rows), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${rosterFilename(params.kind, params.asOf)}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
