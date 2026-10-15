'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { deleteMeeting } from '@/lib/meetings'

export function MeetingActions({ meetingId }: { meetingId: string }) {
  const router = useRouter()
  return (
    <>
      <ConfirmDeleteButton
        onDelete={() => deleteMeeting(meetingId)}
        title="Delete this meeting?"
        description="The minutes, motions and transcript are removed from the board record."
        confirmLabel="Delete meeting"
        successMessage="Meeting deleted."
        onAfterDelete={() => router.push('/meetings')}
        label="Delete"
        variant="destructive-ghost"
        size="md"
      />
      <Button asChild variant="secondary">
        <Link href={`/meetings/${meetingId}/edit`}>
          <Pencil className="size-4" aria-hidden />
          Edit
        </Link>
      </Button>
    </>
  )
}
