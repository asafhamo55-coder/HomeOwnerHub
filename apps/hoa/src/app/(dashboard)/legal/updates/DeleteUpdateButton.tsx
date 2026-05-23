'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteLawUpdate } from '@/lib/state-law'

export function DeleteUpdateButton({ updateId }: { updateId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete this legal update?',
        description:
          'This permanently removes the update. This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      const result = await deleteLawUpdate(updateId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Update deleted.' })
      router.refresh()
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={pending}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {pending ? 'Deleting…' : 'Delete'}
    </Button>
  )
}
