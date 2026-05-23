'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardContent, useToast } from '@homeowner-portal/ui'
import { updateMeeting } from '@/lib/meetings'

interface Props {
  meetingId: string
  defaultValues: {
    meetingDate: string
    meetingType: 'regular' | 'special' | 'annual' | 'emergency'
    attendees: string
    approvedSummary: string
  }
}

export function EditMeetingForm({ meetingId, defaultValues }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const attendeesRaw = fd.get('attendees') as string
    startTransition(async () => {
      const result = await updateMeeting(meetingId, {
        meetingDate: fd.get('meetingDate') as string,
        meetingType: fd.get('meetingType') as 'regular' | 'special' | 'annual' | 'emergency',
        attendees: attendeesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        approvedSummary: fd.get('approvedSummary') as string,
      })
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Meeting updated.' })
      router.push(`/meetings/${meetingId}`)
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Meeting date</label>
              <input
                name="meetingDate"
                type="date"
                defaultValue={defaultValues.meetingDate}
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Type</label>
              <select
                name="meetingType"
                defaultValue={defaultValues.meetingType}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="regular">Regular</option>
                <option value="special">Special</option>
                <option value="annual">Annual</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Attendees (comma-separated)</label>
            <input
              name="attendees"
              defaultValue={defaultValues.attendees}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Approved minutes</label>
            <textarea
              name="approvedSummary"
              defaultValue={defaultValues.approvedSummary}
              rows={8}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
