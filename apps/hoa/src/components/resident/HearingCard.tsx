import { CalendarDays, CalendarPlus } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { IconTile, Panel, Section } from '@/components/resident/screen'
import {
  hearingDayText,
  hearingExpectText,
  hearingTimeText,
  remoteAttendanceText,
  type UpcomingHearing,
} from '@/lib/violation-hearings/upcoming'

/**
 * Round 31: the resident's next scheduled violation hearing on the home
 * page: when, where, what it is about, a plain "what to expect" line and a
 * single "Add to my calendar" download. The first item is the soonest;
 * any others are listed below it without a button. Plain words, no legal
 * conclusions (lib/violation-hearings/upcoming.ts holds the copy).
 */
export function HearingCard({ hearings }: { hearings: readonly UpcomingHearing[] }) {
  const [next, ...later] = hearings
  if (!next) return null
  const time = hearingTimeText(next.hearingTime)
  const remote = remoteAttendanceText(next.state)
  return (
    <Section label="Your hearing">
      <Panel className="space-y-4">
        <div className="flex items-start gap-3">
          <IconTile icon={<CalendarDays />} tone="info" />
          <div className="min-w-0 space-y-1">
            <p className="text-lg font-semibold text-foreground">
              {hearingDayText(next.hearingOn)}
              {time ? ` at ${time}` : ''}
            </p>
            <p className="text-base text-foreground-secondary">
              {next.location ? `Where: ${next.location}` : 'The board will tell you where.'}
            </p>
          </div>
        </div>
        <p className="text-base text-foreground">{hearingExpectText(next.summary)}</p>
        {remote ? <p className="text-base text-foreground-secondary">{remote}</p> : null}
        <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
          <a href={`/resident/violations/${next.violationId}/calendar`} download>
            <CalendarPlus aria-hidden />
            Add to my calendar
          </a>
        </Button>
        {later.length > 0 ? (
          <ul className="space-y-2 border-t border-border pt-3 text-base text-foreground-secondary">
            {later.map((h) => (
              <li key={h.violationId}>
                <a
                  href={`/resident/violations/${h.violationId}`}
                  className="inline-flex min-h-11 items-center font-medium text-primary underline"
                >
                  {hearingDayText(h.hearingOn)}
                  {hearingTimeText(h.hearingTime) ? ` at ${hearingTimeText(h.hearingTime)}` : ''}
                  {`: ${h.summary}`}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </Section>
  )
}
