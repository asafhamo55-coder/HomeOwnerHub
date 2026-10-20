'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useToast } from '@homeowner-portal/ui'
import { markComplianceDeadlineDone } from '@/lib/compliance/actions'

/** BL-131: records the board's acknowledgment and hides the deadline from the card and the digest. */
export function MarkComplianceDoneButton({ associationId, code }: { associationId: string; code: string }) {
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function markDone() {
    startTransition(async () => {
      const res = await markComplianceDeadlineDone({ associationId, code })
      if (!res.ok) {
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      toast({ tone: 'success', message: 'Marked as done. It won’t show here or in the morning email again.' })
      router.refresh()
    })
  }

  return (
    <Button type="button" size="sm" variant="secondary" onClick={markDone} disabled={pending}>
      {pending ? 'Saving…' : 'Mark as done'}
    </Button>
  )
}
