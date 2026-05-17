'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Award } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { awardBid } from '@/lib/bids'

export function AwardBidButton({ rfpId, bidId }: { rfpId: string; bidId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    const ok = await confirm({
      title: 'Award this bid?',
      description:
        'The RFP will close and any other submitted bids will be auto-declined. This cannot be undone.',
      confirmLabel: 'Award bid',
      destructive: true,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await awardBid(rfpId, bidId)
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Bid awarded. Other bids were marked declined.' })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} disabled={isPending}>
        <Award className="h-4 w-4" />
        {isPending ? 'Awarding…' : 'Award this bid'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
