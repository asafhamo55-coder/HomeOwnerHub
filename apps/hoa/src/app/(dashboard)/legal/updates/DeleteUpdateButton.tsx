'use client'

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { deleteLawUpdate } from '@/lib/state-law'

export function DeleteUpdateButton({ updateId, headline }: { updateId: string; headline?: string }) {
  const router = useRouter()
  const toast = useToast()
  return (
    <ConfirmDialog
      destructive
      title="Delete this update?"
      description={
        headline
          ? `“${headline}” will be removed for every board in your state. This can’t be undone — archive it instead if you may need it again.`
          : 'It will be removed for every board in your state. This can’t be undone — archive it instead if you may need it again.'
      }
      confirmLabel="Delete update"
      onConfirm={async () => {
        const result = await deleteLawUpdate(updateId)
        if (!result.ok) {
          toast({ tone: 'error', title: 'Couldn’t delete', message: result.error })
          // Throwing keeps the dialog open so the user can retry or cancel.
          throw new Error('delete failed')
        }
        toast({ tone: 'success', message: 'Update deleted.' })
        router.refresh()
      }}
      trigger={
        <Button
          type="button"
          variant="destructive-ghost"
          size="icon-sm"
          aria-label="Delete update"
          title="Delete update"
          icon={<Trash2 aria-hidden />}
        />
      }
    />
  )
}
