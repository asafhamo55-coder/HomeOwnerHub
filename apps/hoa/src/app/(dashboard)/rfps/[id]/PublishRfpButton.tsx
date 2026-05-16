'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { publishRfp } from '@/lib/rfps'

export function PublishRfpButton({ rfpId }: { rfpId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (
      !window.confirm(
        'Publish this RFP? Once open, the scope and line items shouldn\'t change.',
      )
    )
      return
    setError(null)
    startTransition(async () => {
      const result = await publishRfp(rfpId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} disabled={isPending}>
        <Megaphone className="h-4 w-4" />
        {isPending ? 'Publishing…' : 'Publish'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
