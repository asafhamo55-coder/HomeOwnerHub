'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { runBidComparison } from '@/lib/bids'

export function RunComparisonButton({ rfpId }: { rfpId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await runBidComparison(rfpId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/rfps/${rfpId}/comparison`)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} disabled={isPending}>
        <Sparkles className="h-4 w-4" />
        {isPending ? 'Comparing…' : 'Run W23 comparison'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
