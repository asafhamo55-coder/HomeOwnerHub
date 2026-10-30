'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileText, Pencil } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { approveMeetingMinutesById, deleteMeeting } from '@/lib/meetings'

export function MeetingActions({ meetingId, canApprove = false }: { meetingId: string; canApprove?: boolean }) {
  const router = useRouter()
  const toast = useToast()

  async function approve() {
    const r = await approveMeetingMinutesById(meetingId)
    if (!r.ok) {
      toast({ tone: 'error', title: 'Couldn’t approve', message: r.error })
      throw new Error(r.error)
    }
    toast({ tone: 'success', message: 'Minutes approved. Owners can read them in the portal.' })
    router.refresh()
  }

  return (
    <>
      {canApprove ? (
        <ConfirmDialog
          title="Approve these minutes?"
          description="Owners will be able to read them in the portal."
          confirmLabel="Approve minutes"
          trigger={
            <Button variant="primary" icon={<CheckCircle2 aria-hidden />}>
              Approve minutes
            </Button>
          }
          onConfirm={approve}
        />
      ) : null}
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
