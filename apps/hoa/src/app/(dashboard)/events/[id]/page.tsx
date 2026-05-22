import { notFound } from 'next/navigation'
import {
  BackLink,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  PageHeader,
} from '@homeowner-portal/ui'
import { getEvent } from '@/lib/events'
import { EventActions } from './EventActions'
import { EditEventForm } from './EditEventForm'

export const metadata = { title: 'Event' }
export const dynamic = 'force-dynamic'

export default async function EventDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const event = await getEvent(id)
  if (!event) notFound()

  const dateLabel = formatLongDate(event.event_date)
  const days = daysUntilDate(event.event_date)
  const recurrenceLabel =
    event.recurrence === 'annual' ? 'Annual (repeats yearly)' : 'One-time'
  const alertLabel =
    event.alert_days_before === 0
      ? 'Day of'
      : `${event.alert_days_before} day${event.alert_days_before === 1 ? '' : 's'} before`
  const lastSentLabel = event.last_alert_sent_at
    ? `${formatLongDate(event.last_alert_sent_at.slice(0, 10))} (for ${event.last_alert_sent_for ?? 'unknown occurrence'})`
    : 'Never'
  const statusLabel = event.is_active ? 'Active' : 'Paused'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink href="/events" label="All events" />

      <PageHeader
        title={event.title}
        description={
          <span>
            {dateLabel} ·{' '}
            <DaysUntil days={days} />
          </span>
        }
        actions={<EventActions eventId={event.id} isActive={event.is_active} />}
      />

      <Card>
        <CardContent className="p-5">
          <KeyValueList>
            <KeyValue label="Date" value={dateLabel} />
            <KeyValue label="Recurrence" value={recurrenceLabel} />
            <KeyValue label="Alert window" value={alertLabel} />
            <KeyValue
              label="Status"
              value={
                <Badge
                  variant={event.is_active ? 'success' : 'outline'}
                  size="sm"
                >
                  {statusLabel}
                </Badge>
              }
            />
          </KeyValueList>
        </CardContent>
      </Card>

      {event.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {event.description}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <EditEventForm event={event} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <KeyValueList>
            <KeyValue label="Last alert sent" value={lastSentLabel} />
            <KeyValue
              label="Alerted for occurrence"
              value={
                event.last_alert_sent_for
                  ? formatLongDate(event.last_alert_sent_for)
                  : '—'
              }
            />
            <KeyValue
              label="Created"
              value={formatLongDate(event.created_at.slice(0, 10))}
            />
          </KeyValueList>
        </CardContent>
      </Card>
    </div>
  )
}

function DaysUntil({ days }: { days: number }) {
  if (days === 0) return <span>today</span>
  if (days > 0) return <span>in {days} day{days === 1 ? '' : 's'}</span>
  const abs = Math.abs(days)
  return (
    <span>
      {abs} day{abs === 1 ? '' : 's'} ago
    </span>
  )
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

function formatLongDate(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
