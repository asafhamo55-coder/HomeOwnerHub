'use client'

import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteMeeting } from '@/lib/meetings'

export function MeetingActions({ meetingId }: { meetingId: string }) {
  const router = useRouter()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/meetings/${meetingId}/edit`)}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <TwoClickDelete
        onDelete={() => deleteMeeting(meetingId)}
        successMessage="Meeting deleted."
        onAfterDelete={() => router.push('/meetings')}
        label="Delete"
      />
    </div>
  )
}
