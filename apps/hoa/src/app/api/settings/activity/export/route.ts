import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin, requireRouteUser } from '@/lib/api/auth'
import { parseQuery } from '@/lib/api/parse'
import { checkWrite } from '@/lib/api/db'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { orgTimeZone } from '@/lib/association-time-server'
import { todayIn } from '@/lib/association-time'
import { readAll } from '@/lib/supabase/read-all'
import { csvDocument } from '@/lib/csv'
import { ACTIVITY_EXPORT_ACTION } from '@/lib/audit/labels'
import {
  ACTIVITY_CSV_HEADER,
  ACTIVITY_EXPORT_MAX,
  ActivityQuery,
  activityCsvRow,
  activityExportPage,
  activityView,
  countActivity,
  loadActorDirectory,
  type AuditClient,
  type AuditRow,
} from '@/lib/audit/queries'

/**
 * GET /api/settings/activity/export?person=&area=&from=&to= — BL-115, the
 * board activity log as CSV, with the same filters as /settings/activity.
 *
 * Board/admin only (RC-4): a resident gets 403 before any client is made.
 * audit_log is read with the caller's RLS-bound client (0063
 * audit_log_select), pinned to the gate's org. The CSV holds exactly what
 * the page shows: board members' names, plain-language actions, an
 * allowlisted detail and the in-app link. Never metadata JSON, never a
 * resident's name.
 *
 * The export is itself audited: one audit_log row (filters and the row
 * count, no names) is written before the file is sent. If it can't be
 * written the export is refused (RC-6).
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = withRoute('settings.activity-export', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const { userId } = await requireRouteUser()
  const filters = parseQuery(new URL(request.url), ActivityQuery)
  const f = {
    person: filters.person ?? null,
    area: filters.area ?? null,
    from: filters.from ?? null,
    to: filters.to ?? null,
  }

  const supabase = await getSupabaseServerClient()
  const db = supabase as unknown as AuditClient
  const timeZone = await orgTimeZone(supabase, orgId)

  const { count, error: countError } = await countActivity(db, orgId, f, timeZone)
  if (countError) {
    logRouteFailure('settings.activity-export.count', countError, { orgId })
    throw new ApiRouteError('internal')
  }
  if ((count ?? 0) > ACTIVITY_EXPORT_MAX) {
    throw new ApiRouteError(
      'unprocessable',
      `That’s more than ${ACTIVITY_EXPORT_MAX.toLocaleString('en-US')} entries. Pick a shorter date range and export again.`,
      { reason: 'too_many_rows', maxRows: ACTIVITY_EXPORT_MAX },
    )
  }

  let rows: AuditRow[]
  try {
    rows = await readAll<AuditRow>(
      activityExportPage(db, orgId, f, timeZone),
      (e) => Object.assign(new Error('audit_log page failed'), { code: e.code }),
      ACTIVITY_EXPORT_MAX,
    )
  } catch (e) {
    logRouteFailure('settings.activity-export.read', e, { orgId })
    throw new ApiRouteError('internal')
  }
  const directory = await loadActorDirectory(orgId)

  // Audited before the file leaves (the row itself isn't in this file).
  const { error: auditError } = await supabase.from('audit_log').insert({
    action: ACTIVITY_EXPORT_ACTION,
    org_id: orgId,
    user_id: userId,
    entity_type: 'org',
    entity_id: orgId,
    metadata: {
      rows: rows.length,
      area: f.area,
      from: f.from,
      to: f.to,
      person_filtered: Boolean(f.person),
    },
  })
  checkWrite({ error: auditError }, 'settings.activity-export.audit', { orgId })

  const body = csvDocument(
    ACTIVITY_CSV_HEADER,
    rows.map((r) => activityCsvRow(activityView(r, directory), timeZone)),
  )
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="activity-log-${todayIn(timeZone)}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
