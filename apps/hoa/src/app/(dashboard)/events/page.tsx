import Link from 'next/link'
import { CalendarHeart, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from '@homeowner-portal/ui'
import { listEvents, type RecurringEvent } from '@/lib/events'

export const metadata = { title: 'Events' }
export const dynamic = 'force-dynamic'

export default async function EventsListPage() {
  const events = await listEvents()
  const { upcoming, past } = splitEvents(events)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Events"
        description="Annual reminders for your board"
        actions={
          <Button asChild>
            <Link href="/events/new">
              <Plus className="h-4 w-4" />
              New event
            </Link>
          </Button>
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarHeart className="h-10 w-10" aria-hidden />}
          title="No events yet"
          description="Create one to remind the board automatically before annual deadlines."
          action={
            <Button asChild>
              <Link href="/events/new">
                <Plus className="h-4 w-4" />
                New event
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <EventGroup
            heading={`Upcoming${upcoming.length > 0 ? ` (${upcoming.length})` : ''}`}
            events={upcoming}
            emptyMessage="No upcoming events scheduled."
          />
          {past.length > 0 ? (
            <EventGroup
              heading={`Past (${past.length})`}
              events={past}
              emptyMessage=""
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

function EventGroup({
  heading,
  events,
  emptyMessage,
}: {
  heading: string
  events: RecurringEvent[]
  emptyMessage: string
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {heading}
      </h2>
      {events.length === 0 ? (
        emptyMessage ? (
          <p className="text-sm text-muted">{emptyMessage}</p>
        ) : null
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function EventRow({ event }: { event: RecurringEvent }) {
  const days = daysUntilDate(event.event_date)
  const dateLabel = formatShortDate(event.event_date)
  const recurrenceLabel = event.recurrence === 'annual' ? 'annual' : 'one-time'
  const excerpt = event.description
    ? event.description.length > 140
      ? `${event.description.slice(0, 140)}…`
      : event.description
    : null

  return (
    <li>
      <Link
        href={`/events/${event.id}`}
        className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-background sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {event.title}
            </p>
            {!event.is_active ? (
              <Badge variant="outline" size="sm">
                Paused
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            {dateLabel} · {recurrenceLabel}
            {' · '}
            <DaysUntilLabel days={days} />
          </p>
          {excerpt ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted">{excerpt}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted">
            Alerts board {event.alert_days_before === 0
              ? 'the day of'
              : `${event.alert_days_before} day${event.alert_days_before === 1 ? '' : 's'} before`}
          </p>
        </div>
      </Link>
    </li>
  )
}

function DaysUntilLabel({ days }: { days: number }) {
  if (days === 0) return <span className="text-foreground">today</span>
  if (days > 0)
    return (
      <span className="text-foreground">
        in {days} day{days === 1 ? '' : 's'}
      </span>
    )
  const abs = Math.abs(days)
  return (
    <span>
      {abs} day{abs === 1 ? '' : 's'} ago
    </span>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

function splitEvents(events: RecurringEvent[]): {
  upcoming: RecurringEvent[]
  past: RecurringEvent[]
} {
  const today = todayIsoUtc()
  const upcoming: RecurringEvent[] = []
  const past: RecurringEvent[] = []
  for (const e of events) {
    if (e.event_date >= today) upcoming.push(e)
    else past.push(e)
  }
  // Already sorted ascending from DB; past should display newest first.
  past.reverse()
  return { upcoming, past }
}

function todayIsoUtc(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function daysUntilDate(yyyyMmDd: string): number {
  const target = new Date(`${yyyyMmDd}T00:00:00Z`).getTime()
  const now = new Date()
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )
  return Math.round((target - todayUtc) / (24 * 60 * 60 * 1000))
}

function formatShortDate(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
