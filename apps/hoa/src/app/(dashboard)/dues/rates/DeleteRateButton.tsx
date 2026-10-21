'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteDuesRate } from '@/lib/dues-rates/actions'

/** BL-137: remove an upcoming rate (one that has started stays). */
export function DeleteRateButton({ rateId, label }: { rateId: string; label: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  async function handleClick() {
    const ok = await confirm({
      title: 'Remove this rate?',
      description: `${label} comes off the schedule. Bills already made are not changed.`,
      confirmLabel: 'Remove rate',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteDuesRate(rateId)
      if (!res.ok) {
        toast({ tone: 'error', title: 'Couldn’t remove the rate', message: res.error })
        return
      }
      toast({ tone: 'success', message: 'Rate removed.' })
      router.refresh()
    })
  }

  return (
    <Button variant="destructive-ghost" size="sm" onClick={handleClick} loading={pending}>
      Remove
    </Button>
  )
}
