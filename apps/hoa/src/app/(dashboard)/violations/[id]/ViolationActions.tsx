'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { deleteViolation } from '@/lib/violations'

export function ViolationActions({ violationId }: { violationId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const ok = await confirm({
        title: 'Delete this violation?',
        description:
          'This permanently removes the violation record, letter, and photos. This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
      const result = await deleteViolation(violationId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Violation deleted.' })
      router.push('/violations')
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => router.push(`/violations/${violationId}/edit`)}
        disabled={pending}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleDelete}
        disabled={pending}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  )
}
