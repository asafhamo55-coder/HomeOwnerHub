import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { logRouteFailure } from '@/lib/api/log'
import { readAllResult } from '@/lib/supabase/read-all'
import { listArcRequestsForBoard } from '@/lib/board-review'
import { getArcClockSettings } from '@/lib/arc-review/clock-actions'
import { arcClock, localDate, pickArcClockSettings } from '@/lib/arc-review/clock'
import { ARC_FILTERS, parseArcFilter } from '@/lib/arc-review/filters'
import { ARC_CATEGORY, ARC_STATUS } from '@/lib/status/community'
import { csvDocument } from '@/lib/csv'

/**
 * GET /arc/export?status=<pending|approved|denied|withdrawn|all> — the ARC
 * list as CSV.
 *
 * Board/admin only, checked before any read. Read-only. Rows come from the
 * same loader and status views the /arc page uses, and the decide-by date from
 * the same arcClock() with the association's own deadline, so the file is the
 * list for that filter. The submitter's name and email are left out.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HEADER = ['Unit', 'Category', 'Summary', 'Status', 'Submitted', 'Decide by', 'Decision date']

export const GET = withRoute('arc.export', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const filter = parseArcFilter(new URL(request.url).searchParams.get('status'))
  const statuses = ARC_FILTERS[filter].statuses

  const clockLoad = await getArcClockSettings()
  if (!clockLoad.ok) {
    logRouteFailure('arc.export.clock', new Error('clock settings read failed'), { orgId })
    throw new ApiRouteError('internal')
  }
  const clockSettings = clockLoad.associations.map((a) => ({ associationId: a.association.id, settings: a.settings }))
  const orgAssociations = new Set(clockSettings.map((a) => a.associationId))

  // Paged to the end through the page's own loader (BL-047). The work queue
  // is oldest first, as on screen.
  const { data, error } = await readAllResult((from, to) =>
    listArcRequestsForBoard({ status: statuses ?? undefined, from, to, oldestFirst: filter === 'pending' }).then((r) =>
      r.ok ? { data: r.rows, error: null } : { data: null, error: { message: 'ARC read failed' } },
    ),
  )
  if (error) {
    logRouteFailure('arc.export.read', new Error(error.message ?? 'read failed'), { orgId })
    throw new ApiRouteError('internal')
  }
  // Belt and braces on top of row-level security: only this org's associations.
  const rows = (data ?? []).filter((r) => r.association_id === null || orgAssociations.has(r.association_id))

  const now = Date.now()
  const body = csvDocument(
    HEADER,
    rows.map((r) => {
      const clock = arcClock({
        status: r.status,
        submittedAt: r.submitted_at,
        settings: pickArcClockSettings(clockSettings, r.association_id),
        now,
      })
      return [
        r.unit_number ?? '',
        ARC_CATEGORY[r.category] ?? r.category,
        r.summary,
        ARC_STATUS.labels[r.status] ?? r.status,
        localDate(r.submitted_at),
        clock?.dueDate ?? '',
        r.board_response_at ? localDate(r.board_response_at) : '',
      ]
    }),
  )

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="arc-${filter}-${localDate(now)}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
