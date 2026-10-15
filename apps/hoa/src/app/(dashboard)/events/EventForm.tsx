'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
import { createEvent, updateEvent, type RecurringEvent } from '@/lib/events'
import { EventNotifyFields, type EventAudienceKind, type EventNotifyValue } from './EventNotifyFields'

type Errors = Record<string, string>

/**
 * Create + edit form for a recurring event. One form so the two cannot
 * drift (they had: the edit form lacked the field hints). Validation runs
 * client-side first for instant per-field feedback; the server schema
 * enforces the same rules and its fieldErrors land on the same fields.
 */
export function EventForm({
  event,
  properties,
}: {
  /** Omitted → create. */
  event?: RecurringEvent
  properties: { id: string; label: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const editing = Boolean(event)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Errors>({})
  const [recurrence, setRecurrence] = useState<'annual' | 'none'>(event?.recurrence ?? 'annual')
  const [notify, setNotify] = useState<EventNotifyValue>(() =>
    event ? initialNotify(event) : { channels: ['email'], audience: { kind: 'board' } },
  )

  function handleSubmit(formData: FormData) {
    const title = String(formData.get('title') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const eventDate = String(formData.get('event_date') ?? '').trim()
    const alertDays = Number(String(formData.get('alert_days_before') ?? '').trim())

    const next: Errors = {}
    if (!title) next.title = 'Give the event a title.'
    if (!eventDate) next.event_date = 'Pick the date of the next occurrence.'
    if (!Number.isInteger(alertDays) || alertDays < 0 || alertDays > 90)
      next.alert_days_before = 'Use a whole number from 0 to 90.'
    const notifyError = validateNotify(notify)
    if (notifyError) next[notifyError.field] = notifyError.message
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const payload = {
      title,
      description: description || null,
      event_date: eventDate,
      recurrence,
      alert_days_before: alertDays,
      notify_channels: notify.channels,
      notify_audience: notify.audience,
    }

    startTransition(async () => {
      if (event) {
        const result = await updateEvent(event.id, payload)
        if (!result.ok) return fail(result)
        toast({ tone: 'success', message: 'Event updated.' })
        router.refresh()
      } else {
        const result = await createEvent(payload)
        if (!result.ok) return fail(result)
        toast({ tone: 'success', message: 'Event created.' })
        router.push(`/events/${result.data.id}`)
      }
    })
  }

  function fail(result: { error: string; fieldErrors?: Record<string, string> }) {
    if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setErrors(result.fieldErrors)
    else toast({ tone: 'error', message: result.error })
  }

  return (
    <form action={handleSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{editing ? 'Event details' : 'Event'}</CardTitle>
          <CardDescription>What the reminder is for and when it next happens.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Title" required error={errors.title}>
            <Input
              name="title"
              defaultValue={event?.title}
              required
              maxLength={200}
              placeholder="Annual board meeting"
              autoFocus={!editing}
            />
          </Field>
          <Field label="Description" optional error={errors.description} hint="Agenda, prep notes, or who is responsible. Up to 2,000 characters.">
            <Textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={event?.description ?? ''}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Next occurrence"
              required
              error={errors.event_date}
              hint={recurrence === 'annual' ? 'Rolls forward a year after each reminder.' : 'Happens once.'}
            >
              <Input name="event_date" type="date" defaultValue={event?.event_date} required />
            </Field>
            <Field label="Repeats" error={errors.recurrence}>
              <Select name="recurrence" value={recurrence} onValueChange={(v) => setRecurrence(v as 'annual' | 'none')}>
                <option value="annual">Every year</option>
                <option value="none">Does not repeat</option>
              </Select>
            </Field>
          </div>
        </CardContent>

        <div className="border-t border-border">
          <CardHeader>
            <CardTitle as="h2">Reminder</CardTitle>
            <CardDescription>When the alert goes out, how, and to whom.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Lead time" required error={errors.alert_days_before} hint="0–90 days. 0 sends on the day itself.">
              <Input
                name="alert_days_before"
                type="number"
                min={0}
                max={90}
                step={1}
                defaultValue={event?.alert_days_before ?? 7}
                inputMode="numeric"
                suffix="days before"
                className="w-48"
                required
              />
            </Field>
            <EventNotifyFields
              properties={properties}
              initial={event ? notify : undefined}
              onChange={setNotify}
              disabled={pending}
              channelsError={errors.notify_channels}
              audienceError={errors.notify_audience}
            />
          </CardContent>
        </div>

        <CardFooter className="justify-end">
          {editing ? null : (
            <Button type="button" variant="ghost" onClick={() => router.push('/events')} disabled={pending}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={pending}>
            {editing ? 'Save changes' : 'Create event'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

/** Client-side guard so empty selections fail before the round-trip. */
function validateNotify(notify: EventNotifyValue): { field: string; message: string } | null {
  if (notify.channels.length === 0) {
    return { field: 'notify_channels', message: 'Pick at least one notification channel.' }
  }
  if (notify.audience.kind === 'board' && notify.audience.boardUserIds && notify.audience.boardUserIds.length === 0) {
    return { field: 'notify_audience', message: 'Pick at least one board member, or choose Select all.' }
  }
  if (notify.audience.kind === 'specific_residents' && (notify.audience.residentIds?.length ?? 0) === 0) {
    return { field: 'notify_audience', message: 'Pick at least one resident to notify.' }
  }
  return null
}

// Map a stored event's notify config onto the picker's value shape,
// narrowing the audience kind to the three the event form supports.
function initialNotify(event: RecurringEvent): EventNotifyValue {
  const channels: EventNotifyValue['channels'] = event.notify_channels?.length ? event.notify_channels : ['email']
  const def = event.notify_audience
  const kind = (def?.kind ?? 'board') as string
  const supported: EventAudienceKind[] = ['everyone', 'board', 'specific_residents']
  const audienceKind: EventAudienceKind = supported.includes(kind as EventAudienceKind)
    ? (kind as EventAudienceKind)
    : 'board'
  return {
    channels,
    audience:
      audienceKind === 'board'
        ? { kind: 'board', boardUserIds: def?.boardUserIds }
        : audienceKind === 'specific_residents'
          ? { kind: 'specific_residents', residentIds: def?.residentIds }
          : { kind: 'everyone' },
  }
}
