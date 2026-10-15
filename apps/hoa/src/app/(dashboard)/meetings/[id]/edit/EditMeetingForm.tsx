'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
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
  const [errors, setErrors] = useState<Record<string, string>>({})

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const attendeesRaw = fd.get('attendees') as string
    const meetingDate = (fd.get('meetingDate') as string) ?? ''
    const approvedSummary = (fd.get('approvedSummary') as string) ?? ''
    const clientErrors: Record<string, string> = {}
    if (!meetingDate) clientErrors.meetingDate = 'Meeting date is required.'
    if (approvedSummary.trim().length < 10) clientErrors.approvedSummary = 'Minutes must be at least 10 characters.'
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    startTransition(async () => {
      const result = await updateMeeting(meetingId, {
        meetingDate,
        meetingType: fd.get('meetingType') as 'regular' | 'special' | 'annual' | 'emergency',
        attendees: attendeesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        approvedSummary,
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setErrors(result.fieldErrors)
        } else {
          toast({ tone: 'error', message: result.error })
        }
        return
      }
      toast({ tone: 'success', message: 'Meeting updated.' })
      router.push(`/meetings/${meetingId}`)
    })
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Meeting date" required error={errors.meetingDate}>
              <Input name="meetingDate" type="date" defaultValue={defaultValues.meetingDate} required />
            </Field>
            <Field label="Type" error={errors.meetingType}>
              <Select name="meetingType" defaultValue={defaultValues.meetingType}>
                <option value="regular">Regular board meeting</option>
                <option value="special">Special meeting</option>
                <option value="annual">Annual meeting</option>
                <option value="emergency">Emergency meeting</option>
              </Select>
            </Field>
          </div>
          <Field label="Attendees" hint="Separate names with commas." optional error={errors.attendees}>
            <Input name="attendees" defaultValue={defaultValues.attendees} placeholder="Linda Williams, John Smith" />
          </Field>
          <Field label="Minutes" required error={errors.approvedSummary}>
            <Textarea name="approvedSummary" defaultValue={defaultValues.approvedSummary} rows={12} required />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
