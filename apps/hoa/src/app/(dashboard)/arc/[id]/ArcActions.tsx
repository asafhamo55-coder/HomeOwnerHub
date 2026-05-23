'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteArcRequest } from '@/lib/board-review'

export function ArcActions({ arcId }: { arcId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete this ARC application?',
        description:
          'This permanently removes the architectural review application and its decision history. This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      const result = await deleteArcRequest(arcId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'ARC application deleted.' })
      router.push('/arc')
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleDelete}
      disabled={pending}
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </Button>
  )
}
