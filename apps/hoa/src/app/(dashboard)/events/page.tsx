import Link from 'next/link'
import { BellRing, CalendarHeart, Plus, Repeat } from 'lucide-react'
import {
  Button,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  StatusPill,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { loadEvents, type RecurringEvent } from '@/lib/events'
import {
  alertState,
  audienceLabel,
  daysUntilDate,
  formatDate,
  relativeDays,
  CHANNEL_LABEL,
} from './event-dates'
import { todayIn } from '@/lib/association-time'
import { currentScopeZones } from '@/lib/association-time-current'

/** An event's association day and zone (BL-065), the cron's rule. */
type EventDay = (e: RecurringEvent) => { today: string; timeZone: string }

export const metadata = { title: 'Events' }
export const dynamic = 'force-dynamic'

export default async function EventsListPage() {
  const events = await loadEvents()

  const newButton = (
    <Button asChild>
      <Link href="/events/new">
        <Plus className="size-4" aria-hidden />
        New event
      </Link>
    </Button>
  )

  if (events === null) {
    return (
      <Page title="Events" description="Dated reminders the board gets ahead of each deadline." actions={newButton}>
        <LoadFailed what="events" />
      </Page>
    )
  }

  // Each event reads its own association's day (an org-wide event, the
  // primary association's), exactly as the recurring-events cron does.
  const zoneOf = await currentScopeZones()
  const now = new Date()
  const dayOfEvent: EventDay = (e) => {
    const timeZone = zoneOf(e.association_id)
    return { today: todayIn(timeZone, now), timeZone }
  }
  const upcoming = events.filter((e) => e.event_date >= dayOfEvent(e).today)
  // Already ascending from the DB; past reads newest first.
  const past = events.filter((e) => e.event_date < dayOfEvent(e).today).reverse()

  return (
    <Page
      title="Events"
      description="Dated reminders — annual meeting, insurance renewal, budget deadline. We alert the people you choose ahead of each one."
      actions={newButton}
    >
      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarHeart aria-hidden />}
          title="No events yet"
          description="Add the dates your board can’t miss and we’ll send a reminder ahead of each one, every year."
          action={newButton}
        />
      ) : (
        <>
          <section aria-labelledby="upcoming-events" className="space-y-3">
            <h2 id="upcoming-events" className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
              Upcoming <span className="num text-sm font-normal text-muted">{upcoming.length}</span>
            </h2>
            <DataTable
              caption="Upcoming events"
              columns={columns(dayOfEvent)}
              rows={upcoming}
              rowKey={(e) => e.id}
              mobile="cards"
              linkAs={Link}
              empty={
                <EmptyState
                  variant="compact"
                  icon={<CalendarHeart aria-hidden />}
                  title="Nothing coming up"
                  description="Every event on file is in the past. Add the next deadline so the board gets a reminder."
                  action={
                    <Button asChild size="sm">
                      <Link href="/events/new">Add the next deadline</Link>
                    </Button>
                  }
                />
              }
            />
          </section>

          {past.length > 0 ? (
            <section aria-labelledby="past-events" className="space-y-3">
              <h2 id="past-events" className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
                Past <span className="num text-sm font-normal text-muted">{past.length}</span>
              </h2>
              <DataTable
                caption="Past events"
                columns={columns(dayOfEvent).filter((c) => c.key !== 'alert')}
                rows={past}
                rowKey={(e) => e.id}
                mobile="cards"
                linkAs={Link}
              />
            </section>
          ) : null}
        </>
      )}
    </Page>
  )
}

function columns(dayOfEvent: EventDay): DataTableColumn<RecurringEvent>[] {
  return [
    {
      key: 'title',
      header: 'Event',
      mobilePrimary: true,
      cell: (e) => (
        <div className="min-w-0">
          <Link
            href={`/events/${e.id}`}
            className="font-medium text-foreground no-underline hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {e.title}
          </Link>
          {e.description ? (
            <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-muted">{e.description}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      cell: (e) => (
        <div className="whitespace-nowrap">
          <span className="num text-foreground">{formatDate(e.event_date)}</span>
          <span className="block text-xs text-muted">{relativeDays(daysUntilDate(e.event_date, dayOfEvent(e).today))}</span>
        </div>
      ),
    },
    {
      key: 'repeats',
      header: 'Repeats',
      hideBelowLg: true,
      cell: (e) =>
        e.recurrence === 'annual' ? (
          <span className="inline-flex items-center gap-1.5 text-foreground-secondary">
            <Repeat className="size-3.5 text-muted" aria-hidden />
            Yearly
          </span>
        ) : (
          <span className="text-muted">Once</span>
        ),
    },
    {
      key: 'alert',
      header: 'Reminder',
      cell: (e) => <AlertCell event={e} {...dayOfEvent(e)} />,
    },
    {
      key: 'notify',
      header: 'Notifies',
      hideBelowLg: true,
      hideOnMobile: true,
      cell: (e) => (
        <span className="text-foreground-secondary">
          {audienceLabel(e)}
          <span className="block text-xs text-muted">
            {e.notify_channels.map((c) => CHANNEL_LABEL[c] ?? c).join(' · ')}
          </span>
        </span>
      ),
    },
  ]
}

function AlertCell({ event, today, timeZone }: { event: RecurringEvent; today: string; timeZone: string }) {
  const s = alertState(event, today, timeZone)
  switch (s.kind) {
    case 'paused':
      return <StatusPill tone="neutral" label="Paused" />
    case 'sent':
      return <StatusPill tone="success" label={s.on ? `Sent ${formatDate(s.on)}` : 'Sent'} />
    case 'due':
      return <StatusPill tone="warning" label="Sending today" icon={<BellRing aria-hidden />} />
    case 'scheduled':
      return (
        <span className="num whitespace-nowrap text-foreground-secondary">
          {formatDate(s.on)}
          <span className="block text-xs text-muted">{relativeDays(daysUntilDate(s.on, today))}</span>
        </span>
      )
    default:
      return <span className="text-muted">—</span>
  }
}
