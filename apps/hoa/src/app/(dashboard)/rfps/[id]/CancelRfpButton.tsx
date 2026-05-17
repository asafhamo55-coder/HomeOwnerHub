'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { cancelRfp } from '@/lib/rfps'

export function CancelRfpButton({ rfpId }: { rfpId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    const ok = await confirm({
      title: 'Cancel this RFP?',
      description: 'Any open invitations stop working and vendors can no longer submit bids.',
      confirmLabel: 'Cancel RFP',
      cancelLabel: 'Keep RFP open',
      destructive: true,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await cancelRfp(rfpId)
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'RFP cancelled.' })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? 'Cancelling…' : 'Cancel RFP'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
