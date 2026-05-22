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
import { createEvent } from '@/lib/events'

export function NewEventForm() {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [recurrence, setRecurrence] = useState<'annual' | 'none'>('annual')

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
      const result = await createEvent({
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
      toast({ tone: 'success', message: 'Event created.' })
      router.push(`/events/${result.data.id}`)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Field label="Title" required>
        <Input
          name="title"
          required
          maxLength={200}
          placeholder="Annual Board Meeting"
        />
      </Field>

      <Field label="Description">
        <Textarea
          name="description"
          rows={3}
          maxLength={2000}
          placeholder="Optional context — agenda, prep notes, or who's responsible."
        />
        <Helper>Up to 2000 characters.</Helper>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event date" required>
          <Input name="event_date" type="date" required />
          <Helper>The next occurrence. Annual events repeat each year.</Helper>
        </Field>

        <Field label="Recurrence" required>
          <Select
            name="recurrence"
            value={recurrence}
            onValueChange={(v) => setRecurrence(v as 'annual' | 'none')}
          >
            <option value="annual">Annual (repeats every year)</option>
            <option value="none">One-time</option>
          </Select>
        </Field>
      </div>

      <Field label="Alert the board" required>
        <div className="flex items-center gap-2">
          <Input
            name="alert_days_before"
            type="number"
            min={0}
            max={90}
            step={1}
            defaultValue={7}
            inputMode="numeric"
            className="w-24"
            required
          />
          <span className="text-sm text-muted">days before</span>
        </div>
        <Helper>0–90 days. We email admin + board members on that day.</Helper>
      </Field>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/events')}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending} loading={pending}>
          {pending ? 'Creating…' : 'Create event'}
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

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}
