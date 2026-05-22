'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Input,
  Select,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
import { updateEvent, type RecurringEvent } from '@/lib/events'

export function EditEventForm({ event }: { event: RecurringEvent }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [recurrence, setRecurrence] = useState<'annual' | 'none'>(
    event.recurrence,
  )

  function handleSubmit(formData: FormData) {
    setError(null)
    const title = String(formData.get('title') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const eventDate = String(formData.get('event_date') ?? '').trim()
    const alertDaysRaw = String(formData.get('alert_days_before') ?? '').trim()
    const alertDays = Number(alertDaysRaw)

    if (!title) {
      setError('Title is required.')
      return
    }
    if (!eventDate) {
      setError('Event date is required.')
      return
    }
    if (
      !Number.isFinite(alertDays) ||
      !Number.isInteger(alertDays) ||
      alertDays < 0 ||
      alertDays > 90
    ) {
      setError('Alert days must be a whole number between 0 and 90.')
      return
    }

    startTransition(async () => {
      const result = await updateEvent(event.id, {
        title,
        description: description || null,
        event_date: eventDate,
        recurrence,
        alert_days_before: alertDays,
      })
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Event updated.' })
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <Field label="Title" required>
        <Input
          name="title"
          defaultValue={event.title}
          required
          maxLength={200}
        />
      </Field>

      <Field label="Description">
        <Textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={event.description ?? ''}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event date" required>
          <Input
            name="event_date"
            type="date"
            defaultValue={event.event_date}
            required
          />
        </Field>

        <Field label="Recurrence" required>
          <Select
            name="recurrence"
            value={recurrence}
            onValueChange={(v) => setRecurrence(v as 'annual' | 'none')}
          >
            <option value="annual">Annual</option>
            <option value="none">One-time</option>
          </Select>
        </Field>
      </div>

      <Field label="Alert days before" required>
        <div className="flex items-center gap-2">
          <Input
            name="alert_days_before"
            type="number"
            min={0}
            max={90}
            step={1}
            defaultValue={event.alert_days_before}
            inputMode="numeric"
            className="w-24"
            required
          />
          <span className="text-sm text-muted">days before</span>
        </div>
      </Field>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} loading={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  )
}
