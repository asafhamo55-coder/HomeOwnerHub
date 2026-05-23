'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { removeResident } from '@/lib/property-residents'

export function ResidentActions({
  residentId,
  residentName,
  isActive,
}: {
  residentId: string
  residentName: string
  isActive: boolean
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  if (!isActive) return null

  function handleRemove() {
    startTransition(async () => {
      const ok = await confirm({
        title: `Remove ${residentName}?`,
        description:
          "This marks the resident as moved out with today's date. The record is kept for history but they'll no longer appear as active.",
        confirmLabel: 'Remove',
        destructive: true,
      })
      if (!ok) return
      const result = await removeResident(residentId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: `${residentName} removed.` })
      router.refresh()
    })
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleRemove}
      disabled={pending}
      className="shrink-0"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}
