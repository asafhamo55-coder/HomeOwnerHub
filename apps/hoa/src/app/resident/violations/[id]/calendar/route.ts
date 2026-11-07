import { NextResponse } from 'next/server'
import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteMember } from '@/lib/api/auth'
import { parseValue } from '@/lib/api/parse'
import { zUuid } from '@/lib/api/schemas'
import { appOrigin } from '@/lib/app-origin'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { buildHearingIcs, hearingIcsFilename } from '@/lib/violation-hearings/hearing-ics'
import { loadUpcomingHearings } from '@/lib/violation-hearings/resident-upcoming'

/**
 * GET /resident/violations/<violation id>/calendar
 * Round 31: "Add to my calendar" for a scheduled violation hearing. Returns
 * one .ics.
 *
 * WHO MAY DOWNLOAD. A signed-in member of the violation's org whose own
 * home the violation sits on. loadUpcomingHearings walks the same scope as
 * the resident home card: the caller's units -> their home properties ->
 * violations on them in this org -> hearings for exactly those. Anything
 * else (a neighbour's violation, another org, no hearing, a hearing that is
 * cancelled, held, past or not yet noticed) is the same 404, so the route
 * cannot be used to probe for ids. Board and admin accounts own no home, so
 * they get 404 too; they have their own page.
 *
 * It lives under /resident, not /api, so middleware can send a signed-out
 * owner to /login and straight back (same reason as the meeting invite).
 *
 * NO PII in the file or in logs (lib/violation-hearings/hearing-ics.ts):
 * title, date, time, place and the association's name only.
 */
export const GET = withRoute('violation-hearings.calendar', async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { orgId } = await requireRouteMember()
  const { id } = await ctx.params
  const violationId = parseValue(zUuid, id)

  const [actor, units] = await Promise.all([getResidentActor(), getResidentUnits()])
  const res = await loadUpcomingHearings(
    { residentDb: actor.client, admin: createAdminClient() as never },
    { orgId, units, violationId },
  )
  if (res.kind === 'failed') throw new ApiRouteError('internal')
  const hearing = res.kind === 'ok' ? res.hearings[0] : undefined
  if (!hearing || hearing.violationId !== violationId) throw new ApiRouteError('not_found')

  const body = buildHearingIcs({ ...hearing, origin: appOrigin() })
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${hearingIcsFilename(hearing.hearingOn)}"`,
      'cache-control': 'private, no-store',
    },
  })
})
