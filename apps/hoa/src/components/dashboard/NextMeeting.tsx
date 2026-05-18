import Link from 'next/link'
import { ArrowRight, CalendarDays, CalendarPlus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import type { NextMeetingInfo } from '@/lib/dashboard/queries'

const WEEKDAY: Intl.DateTimeFormatOptions = { weekday: 'long' }
const PRETTY_DATE: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}

function relativeLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'today'
  if (daysUntil === 1) return 'tomorrow'
  if (daysUntil > 1) return `in ${daysUntil} days`
  const ago = Math.abs(daysUntil)
  return ago === 1 ? '1 day ago' : `${ago} days ago`
}

// Single-card "what's next on the board calendar". Defaults to the
// soonest future meeting; falls back to the most recent past meeting
// whose minutes still need approval (handled upstream in the query).
export function NextMeeting({ meeting }: { meeting: NextMeetingInfo | null }) {
  if (!meeting) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4 text-muted" aria-hidden />
            Next meeting
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          No meeting scheduled.{' '}
          <Link
            href="/meetings/new"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Schedule the next board meeting <ArrowRight className="inline h-3.5 w-3.5" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    )
  }

  const dt = new Date(meeting.meetingDate)
  const weekday = dt.toLocaleDateString(undefined, WEEKDAY)
  const pretty = dt.toLocaleDateString(undefined, PRETTY_DATE)
  const relative = relativeLabel(meeting.daysUntil)
  const inPast = meeting.daysUntil < 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
          Next meeting
        </CardTitle>
        {inPast ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            Minutes pending
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-0.5">
          <div className="text-lg font-semibold text-foreground">
            {weekday} <span className="text-muted">·</span>{' '}
            <span className="text-foreground">{relative}</span>
          </div>
          <div className="text-sm text-muted">
            {pretty}
            {meeting.meetingType ? ` · ${meeting.meetingType}` : ''}
          </div>
        </div>
        <Link
          href={`/meetings/${meeting.id}`}
          className="inline-flex items-center gap-1 text-sm text-foreground underline-offset-2 hover:underline"
        >
          Open meeting
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  )
}
