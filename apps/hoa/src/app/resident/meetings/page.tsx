import Link from 'next/link'
import { CalendarClock, CalendarDays, FileText } from 'lucide-react'
import { Badge, Button, LoadFailed, NoOrgSelected } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { calendarDaysBetween, todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'
import { fetchResidentMeetings, type MeetingsClient } from '@/lib/resident-meetings/query'
import { formatMeetingDate, type PastMeeting, type UpcomingMeeting } from '@/lib/resident-meetings/select'
import { IconTile, Panel, ScreenEmpty, ScreenHeader, Section } from '@/components/resident/screen'

export const metadata = { title: 'Meetings and notices' }
export const dynamic = 'force-dynamic'

const ASK_FOR_NOTICE = `/resident/tickets/new?${new URLSearchParams({
  subject: 'Question about an association meeting',
}).toString()}`

/**
 * Meeting notices, agendas and approved minutes for owners (BL-088; Fla.
 * Stat. § 720.303(2) wants notices and agendas posted in an owners-only
 * area 14 days ahead). What a resident may see is decided by
 * lib/resident-meetings/select.ts: scheduled meetings and their agenda,
 * and approved minutes. Never drafts, transcripts or attendees. Read with
 * the signed-in user's own client so RLS applies.
 */
export default async function ResidentMeetingsPage() {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected href="/resident" />

  const supabase = await getSupabaseServerClient()
  const timeZone = await orgTimeZone(supabase, org.id)
  const today = todayIn(timeZone)
  const res = await tryLoad('association meetings', () =>
    fetchResidentMeetings(supabase as unknown as MeetingsClient, { orgId: org.id, today, timeZone }),
  )

  const header = (
    <ScreenHeader
      title="Meetings and notices"
      subtitle="Upcoming meetings with their agenda, and the minutes the board has approved."
    />
  )

  if (!res.ok) {
    return (
      <div className="space-y-6">
        {header}
        <LoadFailed what="your association’s meetings" retryHref="/resident/meetings" />
      </div>
    )
  }

  if (!res.data.available) {
    return (
      <div className="space-y-6">
        {header}
        <ScreenEmpty
          icon={<CalendarClock />}
          tone="slate"
          title="Meeting notices aren’t in the portal yet"
          description="Your association hasn’t turned this on yet, so this page can’t show whether a meeting is scheduled. Ask the board for the next meeting’s notice and agenda, or for a past meeting’s minutes."
          action={
            <Button asChild>
              <Link href={ASK_FOR_NOTICE}>Ask the board</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const { upcoming, past, pastCapped } = res.data

  return (
    <div className="space-y-6">
      {header}

      <Section label="Upcoming meetings">
        {upcoming.length === 0 ? (
          <ScreenEmpty
            icon={<CalendarDays />}
            title="No upcoming meeting posted"
            description="When the board schedules a meeting, its date and agenda appear here. Most meetings are posted at least 14 days ahead; an emergency meeting can be posted later."
          />
        ) : (
          <div className="space-y-3">
            {upcoming.map((m) => (
              <UpcomingCard key={m.id} meeting={m} today={today} />
            ))}
          </div>
        )}
      </Section>

      <Section label="Past meetings">
        {past.length === 0 ? (
          <ScreenEmpty
            icon={<FileText />}
            tone="slate"
            title="No approved minutes yet"
            description="Minutes appear here after the board approves them, usually at the next meeting. Draft minutes are not posted."
          />
        ) : (
          <div className="space-y-3">
            {past.map((m) => (
              <PastCard key={m.id} meeting={m} />
            ))}
            {pastCapped ? (
              <p className="text-xs text-muted">Showing the most recent minutes. Ask the board for older ones.</p>
            ) : null}
          </div>
        )}
      </Section>

      <Panel className="space-y-3">
        <p className="text-sm text-foreground-secondary">
          Have a question about a meeting, or need older minutes? Ask the board.
        </p>
        <Button asChild variant="secondary" size="sm">
          <Link href={ASK_FOR_NOTICE}>Ask the board</Link>
        </Button>
      </Panel>
    </div>
  )
}

function whenLabel(date: string, today: string): string | null {
  const days = calendarDaysBetween(today, date)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 15) return `In ${days} days`
  return null
}

function UpcomingCard({ meeting, today }: { meeting: UpcomingMeeting; today: string }) {
  const soon = whenLabel(meeting.date, today)
  return (
    <Panel className="space-y-3">
      <div className="flex items-start gap-3">
        <IconTile icon={<CalendarDays />} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{meeting.typeLabel}</p>
          <p className="num text-sm text-foreground-secondary">{formatMeetingDate(meeting.date)}</p>
          <p className="text-xs text-muted">The time and place are in the board’s notice. Ask the board if they aren’t listed.</p>
        </div>
        {soon ? (
          <Badge variant="info" size="sm">
            {soon}
          </Badge>
        ) : null}
      </div>
      {meeting.agenda ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Agenda</p>
          <p className="whitespace-pre-line text-sm text-foreground [overflow-wrap:anywhere]">{meeting.agenda}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">No agenda posted yet.</p>
      )}
    </Panel>
  )
}

function PastCard({ meeting }: { meeting: PastMeeting }) {
  return (
    <Panel className="space-y-2">
      <details>
        <summary className="flex cursor-pointer list-none items-center gap-3">
          <IconTile icon={<FileText />} tone="slate" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{meeting.typeLabel}</span>
            <span className="num mt-0.5 block text-xs text-muted">{formatMeetingDate(meeting.date)} · Approved minutes</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-primary">Read</span>
        </summary>
        <p className="mt-3 whitespace-pre-line text-sm text-foreground [overflow-wrap:anywhere]">{meeting.minutes}</p>
      </details>
    </Panel>
  )
}
