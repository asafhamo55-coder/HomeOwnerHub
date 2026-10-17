import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Card,
  CardContent,
  KeyValue,
  KeyValueList,
  LoadFailed,
  Page,
  StatusPill,
} from '@homeowner-portal/ui'
import { listEventNotifyProperties, loadEvent } from '@/lib/events'
import { EventActions } from './EventActions'
import { EventForm } from '../EventForm'
import {
  CHANNEL_LABEL,
  alertState,
  audienceLabel,
  daysUntilDate,
  formatDate,
  leadTimeLabel,
  relativeDays,
} from '../event-dates'
import { dayOf, todayIn } from '@/lib/association-time'
import { currentScopeZones } from '@/lib/association-time-current'

export const metadata = { title: 'Event' }
export const dynamic = 'force-dynamic'

export default async function EventDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const result = await loadEvent(id)
  if (!result.ok) {
    return (
      <Page
        width="narrow"
        title="Event"
        breadcrumbs={[{ label: 'Events', href: '/events' }, { label: 'Event' }]}
        linkAs={Link}
      >
        <LoadFailed what="this event" />
      </Page>
    )
  }
  const event = result.event
  if (!event) notFound()
  const properties = await listEventNotifyProperties()

  // The event's association day (BL-065), by the cron's rule.
  const timeZone = (await currentScopeZones())(event.association_id)
  const today = todayIn(timeZone)
  const days = daysUntilDate(event.event_date, today)
  const alert = alertState(event, today, timeZone)
  const reminder =
    alert.kind === 'paused'
      ? 'Paused — no reminder will be sent'
      : alert.kind === 'sent'
        ? `Sent${alert.on ? ` ${formatDate(alert.on)}` : ''} for this occurrence`
        : alert.kind === 'due'
          ? 'Sending today'
          : alert.kind === 'scheduled'
            ? `${formatDate(alert.on)} (${relativeDays(daysUntilDate(alert.on, today)).toLowerCase()})`
            : 'None — this date has passed'

  return (
    <Page
      width="narrow"
      title={event.title}
      description={`${formatDate(event.event_date, 'long')} · ${relativeDays(days)}`}
      meta={
        event.is_active ? <StatusPill tone="success" label="Active" /> : <StatusPill tone="neutral" label="Paused" />
      }
      breadcrumbs={[{ label: 'Events', href: '/events' }, { label: event.title }]}
      linkAs={Link}
      actions={<EventActions eventId={event.id} isActive={event.is_active} />}
    >
      <Card>
        <CardContent className="pt-5">
          <KeyValueList>
            <KeyValue label="Next reminder" value={reminder} />
            <KeyValue
              label="Repeats"
              value={event.recurrence === 'annual' ? 'Every year' : 'Does not repeat'}
            />
            <KeyValue label="Lead time" value={leadTimeLabel(event.alert_days_before)} />
            <KeyValue
              label="Notifies"
              value={`${audienceLabel(event)} · ${event.notify_channels.map((c) => CHANNEL_LABEL[c] ?? c).join(', ')}`}
            />
            <KeyValue
              label="Last reminder sent"
              value={
                event.last_alert_sent_at
                  ? `${formatDate(dayOf(event.last_alert_sent_at, timeZone) ?? event.last_alert_sent_at.slice(0, 10))}${
                      event.last_alert_sent_for ? ` (for ${formatDate(event.last_alert_sent_for)})` : ''
                    }`
                  : 'Never'
              }
            />
            <KeyValue label="Created" value={formatDate(dayOf(event.created_at, timeZone) ?? event.created_at.slice(0, 10))} />
          </KeyValueList>
        </CardContent>
      </Card>

      <EventForm event={event} properties={properties} />
    </Page>
  )
}
