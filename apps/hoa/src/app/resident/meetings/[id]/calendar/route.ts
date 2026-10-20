import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteMember } from '@/lib/api/auth'
import { parseQuery, parseValue } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { logRouteFailure } from '@/lib/api/log'
import { appOrigin } from '@/lib/app-origin'
import { todayIn } from '@/lib/association-time'
import { primaryAssociationZone } from '@/lib/association-time-server'
import { buildMeetingIcs, meetingIcsFilename } from '@/lib/meetings/meeting-ics'
import { CALENDAR_TIME_RE, MAX_CALENDAR_WHERE } from '@/lib/meetings/notice-prefill'
import { verifyCalendarLink } from '@/lib/meetings/calendar-link-sign'
import { paySettingsSecret } from '@/lib/pay-by-zelle'

/**
 * GET /resident/meetings/<id>/calendar?start=HH:MM&where=<place>
 * BL-118: the "Add to calendar" link in a meeting notice. Returns an .ics.
 *
 * WHY A SIGNED-IN MEMBER, NOT A PUBLIC TOKEN. A token link works for
 * anyone the email is forwarded to, needs a new column (a migration) or a
 * new signing secret, and can't be revoked per person. This route needs a
 * session in the meeting's own HOA instead (requireRouteMember: residents
 * may call it, since the invite is for owners). It lives under /resident,
 * not /api, on purpose: middleware sends a signed-out owner who clicks the
 * link to /login and straight back here, where an /api path would answer a
 * bare JSON 401. It still follows every api-route-convention.
 *
 * WHAT A RESIDENT MAY GET. hoa_meeting_minutes is board-only under RLS
 * (0063), so the row is read with the service role AFTER the member gate,
 * scoped to the gate's org, naming only id, date, type and status. A
 * resident gets an invite only for an upcoming scheduled meeting (status
 * 'draft', date today or later in the association's zone) — the same rule
 * as the resident meetings page (lib/resident-meetings/select.ts).
 * Anything else is 404. The board may download any of its meetings.
 *
 * NO PII in the file (lib/meetings/meeting-ics.ts). `start` and `where`
 * are the time and place the board typed into the notice; both bounded.
 *
 * L-3: they are honoured only with `sig`, the server's HMAC over this org,
 * this meeting and exactly those values (lib/meetings/calendar-link-sign.ts),
 * minted when the board's notice is sent. A missing or tampered signature
 * drops both: the invite still downloads, with the meeting's date only, so
 * a re-shared link can't plant a different time or address.
 */

const Query = z.object({
  start: z.string().regex(CALENDAR_TIME_RE).optional(),
  where: zText(MAX_CALENDAR_WHERE).optional(),
  // Checked below; a malformed one is just "unsigned", not a 400.
  sig: z.string().max(256).optional(),
})

export const GET = withRoute('meetings.calendar', async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { orgId, role } = await requireRouteMember()
  const { id } = await ctx.params
  const meetingId = parseValue(zUuid, id)
  const query = parseQuery(new URL(request.url), Query)

  const admin = createAdminClient()
  const [meetingRes, assocRes] = await Promise.all([
    admin
      .from('hoa_meeting_minutes')
      .select('id, meeting_date, meeting_type, status')
      .eq('id', meetingId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle(),
    admin.from('associations').select('name, state').eq('organization_id', orgId),
  ])
  if (meetingRes.error) {
    logRouteFailure('meetings.calendar.meeting', meetingRes.error, { orgId })
    throw new ApiRouteError('internal')
  }
  if (assocRes.error) {
    logRouteFailure('meetings.calendar.association', assocRes.error, { orgId })
    throw new ApiRouteError('internal')
  }
  const meeting = meetingRes.data as { id: string; meeting_date: string; meeting_type: string | null; status: string | null } | null
  if (!meeting) throw new ApiRouteError('not_found')

  const assocRows = (assocRes.data ?? []) as Array<{ name: string | null; state: string | null }>
  const timeZone = primaryAssociationZone(assocRows)
  const isBoard = role === 'admin' || role === 'board'
  if (!isBoard) {
    const upcoming = meeting.status === 'draft' && meeting.meeting_date >= todayIn(timeZone)
    if (!upcoming) throw new ApiRouteError('not_found')
  }
  const start = query.start ?? null
  const where = query.where || null
  const signed =
    (start !== null || where !== null) &&
    verifyCalendarLink(paySettingsSecret(), { orgId, meetingId: meeting.id, start, where, sig: query.sig })

  const associationName =
    [...assocRows].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))[0]?.name?.trim() || 'Your association'

  const body = buildMeetingIcs({
    meetingId: meeting.id,
    meetingDate: meeting.meeting_date,
    meetingType: meeting.meeting_type,
    associationName,
    timeZone,
    start: signed ? start : null,
    where: signed ? where : null,
    origin: appOrigin(),
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${meetingIcsFilename(meeting.meeting_date)}"`,
      'cache-control': 'private, no-store',
    },
  })
})
