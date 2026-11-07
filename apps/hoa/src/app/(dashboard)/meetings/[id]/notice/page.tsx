import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Button, Input, LoadFailed } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { formatDay } from '@/lib/money/format'
import { todayIn } from '@/lib/association-time'
import { noticeContacts } from '@/lib/join-notice'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { checkMeetingNotice } from '@/lib/meetings/notice-law'
import { buildMeetingNoticeDraft, hoursUntilStart, longMeetingDay, meetingClock } from '@/lib/meetings/notice-draft'
import { MAX_CALENDAR_WHERE, calendarLinkParams } from '@/lib/meetings/notice-prefill'
import { MeetingNoticePrint } from './MeetingNoticePrint'

export const metadata = { title: 'Print meeting notice' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

interface MeetingRow {
  id: string
  meeting_date: string
  meeting_type: string | null
  status: string | null
  ai_summary: string | null
}
interface AssociationRow {
  state: string | null
  type: string | null
  compliance_settings: unknown
}

type Search = { time?: string | string[]; where?: string | string[]; edit?: string | string[] }
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * /meetings/[id]/notice: the meeting notice on paper, to post in the
 * clubhouse or mail to owners who do not read email. The words come from
 * buildMeetingNoticeDraft, the same builder as the email notice, in print
 * mode. A meeting does not store its start time or place, so the board
 * types them here (the same two answers the composer asks for) and the page
 * refuses to print until both are there. Board and admins only (anyone else
 * gets a 404 before any database client is made). Every read is scoped to
 * the org; a failed read shows LoadFailed and prints nothing. Nothing is
 * sent or recorded from here.
 */
export default async function MeetingNoticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Search>
}) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, getCurrentUserRole()])
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  if (!UUID.test(id)) notFound()

  const supabase = await getSupabaseServerClient()
  const here = `/meetings/${id}/notice`
  const back = (
    <p className="print:hidden">
      <Link href={`/meetings/${id}`} className="inline-flex min-h-12 items-center text-sm text-primary hover:underline">
        Back to the meeting
      </Link>
    </p>
  )

  const [meeting, assoc, settings] = await Promise.all([
    loadOrFail(
      'this meeting notice',
      supabase
        .from('hoa_meeting_minutes')
        .select('id, meeting_date, meeting_type, status, ai_summary')
        .eq('id', id)
        .eq('org_id', ctx.org.id)
        .is('deleted_at', null)
        .maybeSingle(),
    ),
    getPrimaryAssociationResult(),
    // The state, type and board contacts (Settings, Association), all from this org's association.
    loadOrFail(
      'the association',
      supabase
        .from('associations')
        .select('state, type, compliance_settings')
        .eq('organization_id', ctx.org.id)
        .order('name', { ascending: true })
        .range(0, 0),
    ),
  ])
  // Any failed read prints nothing: a notice built on a guessed state or a
  // missing meeting would go on the clubhouse door with the wrong day.
  if (!meeting.ok || !assoc.ok || !settings.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <LoadFailed what="the meeting notice" retryHref={here} />
      </div>
    )
  }
  if (!meeting.data) notFound()
  const m = meeting.data as unknown as MeetingRow
  const a = ((settings.data ?? []) as AssociationRow[])[0]

  const parsed = calendarLinkParams({ time: first(sp.time), where: first(sp.where) })
  const start = parsed.start
  // A place over the cap is not silently cut: it counts as missing, with its own message.
  const rawWhere = (first(sp.where) ?? '').replace(/\s+/g, ' ').trim()
  const tooLong = rawWhere.length > MAX_CALENDAR_WHERE
  const where = tooLong ? null : parsed.where
  const missing = [!DAY.test(m.meeting_date) ? 'date' : null, !start ? 'time' : null, !where ? 'place' : null].filter(Boolean) as string[]
  const editing = first(sp.edit) === '1'
  if (missing.length > 0 || editing) {
    const what = missing.join(' and ')
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        {tooLong ? (
          <Alert variant="warning" title="The place is too long">
            Shorten the place to {MAX_CALENDAR_WHERE} characters or less.
          </Alert>
        ) : missing.length > 0 ? (
          <Alert variant="warning" title={`Add the meeting ${what} first`}>
            A notice on paper cannot have a gap in it. Type the start time and the place below, then print.
          </Alert>
        ) : (
          <Alert variant="info" title="Change the time or place">
            Fix the time or place below, then show the notice again.
          </Alert>
        )}
        <form method="get" action={here} className="space-y-4 print:hidden">
          <p className="text-sm text-foreground">Type the start time and the place, the same ones you put in the email.</p>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">Start time (for example 7:00 PM)</span>
            <Input type="time" name="time" required defaultValue={start ?? ''} className="min-h-12" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-foreground">Place</span>
            <Input
              type="text"
              name="where"
              required
              maxLength={MAX_CALENDAR_WHERE}
              defaultValue={tooLong ? rawWhere.slice(0, MAX_CALENDAR_WHERE) : (where ?? '')}
              placeholder="Clubhouse, 100 Elm St"
              className="min-h-12"
            />
          </label>
          <Button type="submit" size="lg" className="min-h-12">
            Show the notice
          </Button>
        </form>
      </div>
    )
  }

  const warnings: string[] = []
  // No association row means no zone and no state: say so, never default quietly.
  const noAssoc = !a || !assoc.data
  if (noAssoc) warnings.push('Association details missing, so the notice timing was not checked.')
  const zone = assoc.data ? assoc.data.timeZone : 'America/New_York'
  const today = todayIn(zone)
  const contactLines = noticeContacts(a?.compliance_settings).map((c) =>
    [c.label, c.name, c.phone, c.email, c.emergencyLine ? `Emergency: ${c.emergencyLine}` : ''].filter(Boolean).join(', '),
  )
  // An upcoming draft's text is its agenda (the same rule as the email prefill).
  const agenda = m.status === 'draft' ? m.ai_summary : null
  const draft = buildMeetingNoticeDraft({
    associationName: ctx.org.name,
    meetingType: m.meeting_type,
    meetingDate: m.meeting_date,
    meetingTime: start!,
    location: where!,
    agenda,
    mode: 'print',
    contactLines,
  })

  const check = checkMeetingNotice({
    state: a?.state ?? null,
    associationType: a?.type ?? null,
    meetingType: m.meeting_type,
    meetingDate: m.meeting_date,
    today,
  })
  const state = (a?.state ?? '').trim().toUpperCase()
  if (!noAssoc) {
    if (check.level === 'past') warnings.push('The meeting date has passed.')
    else if (check.level === 'short' || check.level === 'caution' || check.level === 'bylaws') warnings.push(check.message)
    // Florida board meetings: the notice must be posted 48 hours ahead, counted from the typed start.
    if (state === 'FL' && m.meeting_type === 'regular' && check.level !== 'past' && check.level !== 'short') {
      const hours = hoursUntilStart(m.meeting_date, start!, zone)
      if (hours !== null && hours < 48) {
        warnings.push('The meeting starts in less than 48 hours. Florida asks for a board meeting notice to be posted at least 48 hours ahead.')
      }
    }
  } else if (today > m.meeting_date) {
    warnings.push('The meeting date has passed.')
  }
  const emptyAgenda = !(agenda ?? '').trim()
  if (emptyAgenda && (m.meeting_type === 'special' || m.meeting_type === 'annual' || state === 'FL' || (state === 'GA' && a?.type === 'condo'))) {
    warnings.push('No agenda is written, and this state asks the notice to say what the meeting is for. Add it to the meeting first.')
  }
  if (m.status === 'approved' && check.level !== 'past') warnings.push('This meeting is marked as held.')
  if (contactLines.length === 0) warnings.push('No board contacts are set, so the notice says "contact the board." Add them under Settings, Association.')
  if (draft.bodyHtml.includes('[')) warnings.push('The notice has a square bracket in it. Look it over before you print.')

  const change = new URLSearchParams({ time: start!, where: where! }).toString()
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {back}
      <MeetingNoticePrint
        view={{
          association: ctx.org.name,
          dateLabel: formatDay(today),
          when: `${longMeetingDay(m.meeting_date)}, ${meetingClock(start!)}`,
          where: where!,
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          // Opens the form again with these two filled in.
          changeHref: `${here}?${change}&edit=1`,
          warnings,
        }}
      />
    </div>
  )
}
