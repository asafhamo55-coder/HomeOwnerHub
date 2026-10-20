'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, useToast } from '@homeowner-portal/ui'
import { updateQuorumKit } from '@/lib/meeting-quorum/actions'

/** BL-122: a special meeting opens the kit once the board says owners vote at it. */
export function ConfirmMemberMeeting({ meetingId }: { meetingId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  return (
    <Alert variant="info" title="Is this a special meeting of the members?">
      The quorum kit is for meetings where owners vote. A special meeting of the board doesn’t need one.
      <span className="mt-3 block">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateQuorumKit(meetingId, { kind: 'member_meeting', value: true })
              if (!res.ok) {
                toast({ tone: 'error', title: 'Not saved', message: res.error })
                return
              }
              router.refresh()
            })
          }
        >
          {pending ? 'Saving…' : 'Yes, owners vote at this meeting'}
        </Button>
      </span>
    </Alert>
  )
}
