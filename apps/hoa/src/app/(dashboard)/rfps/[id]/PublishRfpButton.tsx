'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { Button, useConfirm } from '@homeowner-portal/ui'
import { publishRfp } from '@/lib/rfps'

export function PublishRfpButton({ rfpId }: { rfpId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  async function handleClick() {
    const ok = await confirm({
      title: 'Publish this RFP?',
      description: 'Once it is open to bids, the scope and line items shouldn’t change.',
      confirmLabel: 'Publish',
    })
    if (!ok) return
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
      <Button onClick={handleClick} loading={isPending} icon={<Megaphone aria-hidden />}>
        {isPending ? 'Publishing…' : 'Publish'}
      </Button>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  )
}
