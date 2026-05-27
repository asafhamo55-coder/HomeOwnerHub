'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { Button, Input, Select, Textarea } from '@homeowner-portal/ui'
import { scheduleMeeting, type MeetingType } from '@/lib/meetings'

const TYPES: Array<{ value: MeetingType; label: string }> = [
  { value: 'regular', label: 'Regular board meeting' },
  { value: 'special', label: 'Special meeting' },
  { value: 'annual', label: 'Annual meeting' },
  { value: 'emergency', label: 'Emergency meeting' },
]

export function ScheduleMeetingForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    const meetingDate = String(formData.get('meeting_date') ?? '').trim()
    const meetingType = String(formData.get('meeting_type') ?? 'regular') as MeetingType
    const agenda = String(formData.get('agenda') ?? '').trim() || undefined

    if (!meetingDate) {
      setError('Meeting date is required.')
      return
    }

    startTransition(async () => {
      const result = await scheduleMeeting({ meetingDate, meetingType, agenda })
      if (!result.ok) {
        setError(result.error ?? 'Could not schedule.')
        return
      }
      router.push('/meetings')
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <label className="block space-y-1">
        <span className="text-sm font-medium">
          Date <span className="text-destructive">*</span>
        </span>
        <Input name="meeting_date" type="date" required />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Type</span>
        <Select name="meeting_type" defaultValue="regular">
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Agenda / notes (optional)</span>
        <Textarea
          name="agenda"
          rows={4}
          maxLength={4000}
          placeholder="Topics to discuss, documents to review, etc."
        />
      </label>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          <CalendarPlus className="h-4 w-4" />
          {isPending ? 'Scheduling…' : 'Schedule meeting'}
        </Button>
      </div>
    </form>
  )
}
