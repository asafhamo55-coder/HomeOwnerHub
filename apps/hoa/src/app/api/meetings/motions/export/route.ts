import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseQuery } from '@/lib/api/parse'
import { zText } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { orgTimeZone } from '@/lib/association-time-server'
import { todayIn } from '@/lib/association-time'
import { csvDocument } from '@/lib/csv'
import {
  MOTION_CSV_HEADER,
  MOTION_RESULTS,
  MOTION_SEARCH_MAX,
  filterMotions,
  loadAllMotions,
  motionCsvRow,
  type MinutesClient,
  type Motion,
  type MotionResult,
} from '@/lib/meeting-motions'

/**
 * GET /api/meetings/motions/export?q=&year=&result= — BL-116, the motion
 * log as CSV with the same filters as /meetings/motions.
 *
 * Board/admin only (RC-4): minutes, drafts included, are board-only
 * (0063), so a resident gets 403 before any client is made. Reads use the
 * caller's RLS client pinned to the gate's org, in full (RC-9). The CSV
 * carries the motion as the minutes record it, the meeting date and type,
 * and the in-app link — no attendee list, transcript or resident data.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const Query = z.object({
  q: zText(MOTION_SEARCH_MAX).optional(),
  year: z.string().regex(/^\d{4}$/, 'Use a four-digit year.').optional(),
  result: z.enum([...(MOTION_RESULTS as [MotionResult, ...MotionResult[]]), 'none']).optional(),
})

export const GET = withRoute('meetings.motions-export', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const query = parseQuery(new URL(request.url), Query)

  const supabase = await getSupabaseServerClient()
  const today = todayIn(await orgTimeZone(supabase, orgId))
  let all: Motion[]
  try {
    all = await loadAllMotions(supabase as unknown as MinutesClient, orgId, today)
  } catch (e) {
    logRouteFailure('meetings.motions-export.read', e, { orgId })
    throw new ApiRouteError('internal')
  }
  const motions = filterMotions(all, {
    q: query.q?.trim() || null,
    year: query.year ?? null,
    result: query.result ?? null,
  })

  return new Response(csvDocument(MOTION_CSV_HEADER, motions.map(motionCsvRow)), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="motion-log-${today}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
