import Link from 'next/link'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import type { NextMeetingInfo } from '@/lib/dashboard/queries'
import { FailedNote } from './BreakdownList'

const MONTH: Intl.DateTimeFormatOptions = { month: 'short', timeZone: 'UTC' }
const DAY: Intl.DateTimeFormatOptions = { day: 'numeric', timeZone: 'UTC' }
const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'long', timeZone: 'UTC' }

function relativeLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'today'
  if (daysUntil === 1) return 'tomorrow'
  if (daysUntil > 1) return `in ${daysUntil} days`
  const ago = Math.abs(daysUntil)
  return ago === 1 ? '1 day ago' : `${ago} days ago`
}

function typeLabel(t: string | null): string {
  if (!t) return 'Board meeting'
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} meeting`
}

// "What's next on the board calendar". Soonest future meeting; falls back
// to the most recent past meeting whose minutes still need approval.
export function NextMeeting({
  meeting,
  failed = false,
}: {
  meeting: NextMeetingInfo | null
  failed?: boolean
}) {
  if (!meeting) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle as="h2">Next meeting</CardTitle>
        </CardHeader>
        <CardContent>
          {failed ? (
            <FailedNote what="the meeting calendar" />
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-foreground-secondary">No board meeting is scheduled.</p>
              <Link
                href="/meetings/schedule"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Schedule one <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // meeting_date is a DATE; format in UTC so it never shifts a day.
  const dt = new Date(`${meeting.meetingDate.slice(0, 10)}T00:00:00Z`)
  const inPast = meeting.daysUntil < 0

  return (
    <Card>
      <CardHeader
        className="pb-3"
        actions={inPast ? <StatusPill tone="warning" label="Minutes pending" /> : null}
      >
        <CardTitle as="h2">{inPast ? 'Last meeting' : 'Next meeting'}</CardTitle>
      </CardHeader>
      <CardContent>
        <Link
          href={`/meetings/${meeting.id}`}
          className="group -m-2 flex items-center gap-4 rounded-lg p-2 transition-colors duration-fast hover:bg-subtle"
        >
          <span
            className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-surface"
            aria-hidden
          >
            <span className="text-2xs font-semibold uppercase text-primary">
              {dt.toLocaleDateString('en-US', MONTH)}
            </span>
            <span className="num text-xl font-semibold leading-none text-foreground">
              {dt.toLocaleDateString('en-US', DAY)}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{typeLabel(meeting.meetingType)}</span>
            <span className="block text-sm text-muted">
              {dt.toLocaleDateString('en-US', WEEKDAY)} · {relativeLabel(meeting.daysUntil)}
            </span>
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  )
}
