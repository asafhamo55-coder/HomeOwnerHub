'use client'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { deleteArcRequest } from '@/lib/board-review'

export function ArcActions({ arcId }: { arcId: string }) {
  const router = useRouter()
  const toast = useToast()
  return (
    <ConfirmDialog
      title="Delete this ARC application?"
      description="It is removed from the board queue and the resident's portal. Use Deny instead if the board is rejecting it."
      confirmLabel="Delete application"
      destructive
      onConfirm={async () => {
        const result = await deleteArcRequest(arcId)
        if (!result.ok) {
          toast({ tone: 'error', message: result.error })
          throw new Error(result.error)
        }
        toast({ tone: 'success', message: 'ARC application deleted.' })
        router.push('/arc')
      }}
      trigger={
        <Button variant="destructive-ghost" icon={<Trash2 aria-hidden />}>
          Delete
        </Button>
      }
    />
  )
}
