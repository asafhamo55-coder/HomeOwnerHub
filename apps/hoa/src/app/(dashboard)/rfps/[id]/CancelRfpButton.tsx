'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@homeowner-portal/ui'
import { cancelRfp } from '@/lib/rfps'

export function CancelRfpButton({ rfpId }: { rfpId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (!window.confirm('Cancel this RFP? Any open invitations stop working.')) return
    setError(null)
    startTransition(async () => {
      const result = await cancelRfp(rfpId)
      if (!result.ok) {
        setError(result.error)
        return
      }
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
