'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { withdrawMyArcRequest } from '@/lib/resident-submissions'

export function WithdrawArcButton({ arcId }: { arcId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function withdraw() {
    setError(null)
    startTransition(async () => {
      const result = await withdrawMyArcRequest(arcId)
      if (!result.ok) {
        setError(result.error)
        setConfirming(false)
        return
      }
      router.refresh()
    })
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirming(true)}
          disabled={isPending}
        >
          <X className="h-3.5 w-3.5" />
          Withdraw
        </Button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">Withdraw this application?</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={withdraw}
        disabled={isPending}
      >
        {isPending ? 'Withdrawing…' : 'Yes, withdraw'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={isPending}
      >
        Cancel
      </Button>
    </div>
  )
}
