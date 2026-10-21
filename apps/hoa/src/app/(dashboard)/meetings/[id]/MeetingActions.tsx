'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Pencil } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { deleteMeeting } from '@/lib/meetings'

export function MeetingActions({ meetingId }: { meetingId: string }) {
  const router = useRouter()
  return (
    <>
      <Button asChild variant="secondary">
        <Link href={`/meetings/${meetingId}/edit`}>
          <Pencil className="size-4" aria-hidden />
          Edit
        </Link>
      </Button>
      {/* BL-016: the printable monthly packet for this meeting. */}
      <Button asChild variant="secondary">
        <Link href={`/meetings/${meetingId}/packet`}>
          <FileText className="size-4" aria-hidden />
          Board packet
        </Link>
      </Button>
      {/* Last, and icon-only on a phone, so the three fit one row at 375px. */}
      <ConfirmDeleteButton
        onDelete={() => deleteMeeting(meetingId)}
        title="Delete this meeting?"
        description="The minutes, motions and transcript are removed from the board record."
        confirmLabel="Delete meeting"
        successMessage="Meeting deleted."
        onAfterDelete={() => router.push('/meetings')}
        label="Delete"
        labelClassName="sr-only sm:not-sr-only"
        variant="destructive-ghost"
        size="md"
      />
    </>
  )
}
