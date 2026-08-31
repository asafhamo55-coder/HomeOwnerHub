'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { deleteCommunication } from '@/lib/communications/actions'
import { resendFailedRecipients } from '@/lib/communications/send'

export function CommunicationActions({
  commId,
  failedEmailCount,
}: {
  commId: string
  /** Email recipients in `delivery_status = 'failed'`. Zero hides the
   *  resend button entirely — there is nothing to retry, and an always-on
   *  button next to Delete invites a pointless re-send. */
  failedEmailCount: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  // No confirm step: unlike Delete, a resend only touches rows that already
  // failed, so the worst case is a second failure rather than lost data.
  function handleResend() {
    startTransition(async () => {
      const result = await resendFailedRecipients(commId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({
        tone: result.failedCount > 0 ? 'info' : 'success',
        message:
          result.failedCount > 0
            ? `Resent to ${result.sentCount}; ${result.failedCount} still failing.`
            : `Resent to ${result.sentCount} recipient${result.sentCount === 1 ? '' : 's'}.`,
      })
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center gap-2">
      {failedEmailCount > 0 ? (
        <Button
          size="sm"
          variant="outline"
          onClick={handleResend}
          disabled={isPending}
          title="Send again to the email recipients that failed. Recipients who already received it are untouched."
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span>{isPending ? 'Resending…' : `Resend to ${failedEmailCount} failed`}</span>
        </Button>
      ) : null}
      <TwoClickDelete
        onDelete={() => deleteCommunication(commId)}
        successMessage="Communication deleted."
        onAfterDelete={() => router.push('/communications')}
        label="Delete"
      />
    </div>
  )
}
